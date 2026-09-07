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

import {
  downsampleAndConvertToInt16,
  pcmToBase64,
  newResampleState,
  resamplePcmToFloat32,
} from "../lib/voice/audio.ts";
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

describe("resamplePcmToFloat32", () => {
  /** A 24kHz tone, the rate Gemini's native audio actually arrives at. */
  const tone = (n) => {
    const out = new Int16Array(n);
    for (let i = 0; i < n; i++) out[i] = Math.round(20000 * Math.sin((2 * Math.PI * 440 * i) / 24000));
    return out;
  };

  test("chunked resampling matches resampling the whole utterance at once", () => {
    // This is the beeping. Handing Web Audio a buffer that declares 24000Hz on
    // a 48000Hz context made it resample every ~20ms chunk on its own, with
    // interpolation restarting at phase 0 and the last frame interpolating
    // against the chunk's own final sample instead of the next chunk's first.
    // Every boundary got a step; at 50 chunks a second that is a 50Hz tick
    // under the whole utterance. Carrying the phase and the previous sample
    // makes the seams vanish, and "vanish" means the chunked result is the
    // one-shot result.
    const whole = tone(4800);
    const oneShot = resamplePcmToFloat32(whole, 24000, 48000, newResampleState());

    const state = newResampleState();
    const pieces = [];
    for (let i = 0; i < whole.length; i += 480) pieces.push(resamplePcmToFloat32(whole.subarray(i, i + 480), 24000, 48000, state));
    const joined = new Float32Array(pieces.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const piece of pieces) { joined.set(piece, at); at += piece.length; }

    assert.equal(joined.length, oneShot.length, "chunking changed the sample count");
    let worst = 0;
    for (let i = 0; i < joined.length; i++) worst = Math.max(worst, Math.abs(joined[i] - oneShot[i]));
    assert.ok(worst < 1e-6, `seam of ${worst} between chunks`);
  });

  test("no chunk boundary introduces a step the signal does not have", () => {
    // The audible form of the same defect: a discontinuity shows up as a
    // sample-to-sample jump far larger than the waveform's own slope.
    const state = newResampleState();
    const src = tone(4800);
    const out = [];
    for (let i = 0; i < src.length; i += 480) out.push(...resamplePcmToFloat32(src.subarray(i, i + 480), 24000, 48000, state));
    let worst = 0;
    for (let i = 1; i < out.length; i++) worst = Math.max(worst, Math.abs(out[i] - out[i - 1]));
    // A 440Hz tone at 48kHz steps by at most 2*pi*440/48000 ~= 0.058 of full scale.
    assert.ok(worst < 0.06, `${worst} exceeds the tone's own maximum slope`);
  });

  test("equal rates are copied exactly rather than interpolated", () => {
    // 24kHz PCM into a context that granted 24kHz must not be touched at all —
    // interpolating it would add a half-sample delay and a lowpass for nothing.
    const state = newResampleState();
    const src = new Int16Array([0, 32767, -32768, 1000, -1000]);
    const out = resamplePcmToFloat32(src, 24000, 24000, state);
    assert.equal(out.length, src.length);
    for (let i = 0; i < src.length; i++) assert.equal(out[i], src[i] / 32768);
  });

  test("the frame count per chunk is exact, so the schedule cannot drift", () => {
    // nextTimeRef advances by buffer.length / ctx.sampleRate, so a chunk that
    // renders a different number of frames than the schedule books walks the
    // nodes into overlap a fraction of a frame at a time. That is what the old
    // path did on any device rate that is not a multiple of 24000: it booked
    // samples/24000 seconds while the graph rendered ceil() frames of its own.
    // Only the first chunk is short, by the one input sample of priming.
    for (const [rate, perChunk] of [[48000, 960], [44100, 882], [16000, 320], [24000, 480]]) {
      const state = newResampleState();
      const counts = [];
      for (let i = 0; i < 12; i++) counts.push(resamplePcmToFloat32(tone(480), 24000, rate, state).length);
      assert.deepEqual(counts.slice(1), Array(11).fill(perChunk), `drift at ${rate}Hz`);
      assert.ok(perChunk - counts[0] <= 2, `${rate}Hz lost ${perChunk - counts[0]} frames priming`);
    }
  });

  test("an empty chunk is survivable", () => {
    assert.equal(resamplePcmToFloat32(new Int16Array(0), 24000, 48000, newResampleState()).length, 0);
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
