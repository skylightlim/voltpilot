/**
 * Tests for the voice interview's audio and echo logic.
 *
 * Run:  node --test tests/voice.test.mjs
 *
 * This code ran for months untested because it lived inside a 1,066-line
 * component alongside a live WebSocket and the UI, so exercising it meant a
 * microphone and a Gemini session. Extracted to lib/voice/ it is ordinary
 * arithmetic and string matching, and Node imports the TypeScript directly.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { downsampleAndConvertToInt16, pcmToBase64 } from "../lib/voice/audio.ts";
import { isEchoOfAdvisor } from "../lib/voice/echo.ts";
import { appendDelta, withInterim, withFinalUser, promoteStatus, STATUS_ID } from "../lib/voice/transcript.ts";

describe("downsampleAndConvertToInt16", () => {
  test("passes through unchanged when the rates already match", () => {
    const input = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const out = downsampleAndConvertToInt16(input, 16000, 16000);
    assert.equal(out.length, input.length);
    assert.equal(out[0], 0);
    assert.equal(out[3], 32767, "+1.0 must reach full scale");
    assert.equal(out[4], -32768, "-1.0 must reach negative full scale");
  });

  test("clamps out-of-range samples instead of wrapping", () => {
    // Float input can exceed ±1.0. Wrapping would turn a loud sample into a
    // loud sample of the opposite sign — audible as a click, and the kind of
    // thing nobody notices until a user shouts.
    const out = downsampleAndConvertToInt16(new Float32Array([9, -9]), 16000, 16000);
    assert.equal(out[0], 32767);
    assert.equal(out[1], -32768);
  });

  test("halves the sample count when halving the rate", () => {
    const input = new Float32Array(480).fill(0.25);
    const out = downsampleAndConvertToInt16(input, 32000, 16000);
    assert.equal(out.length, 240);
    // averaging a constant signal must return that constant
    assert.ok(Math.abs(out[10] - Math.round(0.25 * 32767)) <= 1);
  });

  test("produces Int16Array, not a float view", () => {
    const out = downsampleAndConvertToInt16(new Float32Array([0.1]), 48000, 16000);
    assert.ok(out instanceof Int16Array);
  });
});

describe("pcmToBase64", () => {
  test("round-trips through base64", () => {
    const pcm = new Int16Array([0, 1, -1, 32767, -32768]);
    const decoded = Buffer.from(pcmToBase64(pcm), "base64");
    assert.deepEqual(new Int16Array(decoded.buffer, decoded.byteOffset, pcm.length), pcm);
  });

  test("survives the 8192-byte chunk boundary", () => {
    // The encoder walks the buffer in 8192-byte chunks to avoid blowing the
    // argument limit on String.fromCharCode. An off-by-one there corrupts every
    // utterance longer than ~4000 samples — which is most of them.
    const pcm = new Int16Array(20000);
    for (let i = 0; i < pcm.length; i++) pcm[i] = (i * 37) % 32767 - 16000;
    const decoded = Buffer.from(pcmToBase64(pcm), "base64");
    assert.equal(decoded.byteLength, pcm.byteLength);
    assert.deepEqual(new Int16Array(decoded.buffer, decoded.byteOffset, pcm.length), pcm);
  });

  test("handles an empty buffer", () => {
    assert.equal(pcmToBase64(new Int16Array(0)), "");
  });
});

describe("isEchoOfAdvisor", () => {
  test("catches the advisor's own words coming back through the mic", () => {
    const recent = ["What is your daily driving distance in kilometres?"];
    assert.equal(isEchoOfAdvisor("what is your daily driving distance in kilometres", recent), true);
  });

  test("catches the advisor's stock phrases even with nothing recent", () => {
    // These identify the assistant itself, so they are never the user talking.
    assert.equal(isEchoOfAdvisor("welcome to voltpilot", []), true);
    assert.equal(isEchoOfAdvisor("please introduce yourself", []), true);
  });

  test("lets a genuine user answer through", () => {
    // The dangerous direction. A false positive here silently drops a real
    // answer and the interview stalls asking the same question again.
    const recent = ["What is your daily driving distance in kilometres?"];
    for (const said of ["about forty five kilometres", "i drive to work and back", "around rm150000"]) {
      assert.equal(isEchoOfAdvisor(said, recent), false, `dropped a real answer: ${said}`);
    }
  });

  test("ignores noise too short to judge", () => {
    assert.equal(isEchoOfAdvisor("uh", []), false);
    assert.equal(isEchoOfAdvisor("", []), false);
  });

  test("is case- and punctuation-insensitive", () => {
    const recent = ["Do you have home charging?"];
    assert.equal(isEchoOfAdvisor("DO YOU HAVE HOME CHARGING?!", recent), true);
  });
});

describe("transcript reducers", () => {
  const T = "10:30";
  const status = [{ id: STATUS_ID, role: "system", text: "Connecting…", time: T }];

  test("streamed advisor text grows one bubble", () => {
    let log = appendDelta([], "advisor", "Hello ", "a1", T);
    log = appendDelta(log, "advisor", "there", "a2", T);
    assert.equal(log.length, 1);
    assert.equal(log[0].text, "Hello there");
  });

  test("advisor text never merges into the connection-status row", () => {
    // The status row is seeded before the socket opens. Merging into it would
    // put the advisor's first sentence inside "Connecting…".
    const log = appendDelta(status, "advisor", "Hello", "a1", T);
    assert.equal(log.length, 2);
    assert.equal(log[0].text, "Connecting…");
    assert.equal(log[1].text, "Hello");
  });

  test("a switch of speaker starts a new bubble", () => {
    let log = appendDelta([], "advisor", "Question?", "a1", T);
    log = appendDelta(log, "user", "Answer", "u1", T);
    assert.deepEqual(log.map((m) => m.role), ["advisor", "user"]);
  });

  test("interim speech updates in place instead of stuttering", () => {
    let log = withInterim([], "forty", "i1", T);
    log = withInterim(log, "forty five", "i2", T);
    log = withInterim(log, "forty five kilometres", "i3", T);
    assert.equal(log.length, 1, "each interim guess must replace the last");
    assert.equal(log[0].text, "forty five kilometres");
    assert.equal(log[0].isInterim, true);
  });

  test("a confirmed line replaces the interim guess", () => {
    let log = withInterim([], "forty fife", "i1", T);
    log = withFinalUser(log, "  forty five  ", "u1", T);
    assert.equal(log.length, 1);
    assert.equal(log[0].text, "forty five", "final text is trimmed");
    assert.equal(log[0].isInterim, false);
  });

  test("a confirmed line after advisor text appends rather than overwrites", () => {
    let log = appendDelta([], "advisor", "How far?", "a1", T);
    log = withFinalUser(log, "45 km", "u1", T);
    assert.equal(log.length, 2);
    assert.equal(log[0].text, "How far?");
  });

  test("promoting the status row edits it rather than adding a second", () => {
    const log = promoteStatus(status, "Live Consultation Active", "10:31");
    assert.equal(log.length, 1);
    assert.equal(log[0].text, "Live Consultation Active");
    assert.equal(log[0].id, STATUS_ID, "id must survive — appendDelta keys off it");
  });
});
