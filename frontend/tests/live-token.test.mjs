/**
 * Tests for the Live token route.
 *
 * Run:  node --test tests/live-token.test.mjs
 *
 * Until 2026-09-27 this route returned the Gemini API key itself to every
 * visitor. What these pin down is that the browser only ever receives a minted
 * single-use token, and that a failure never leaks the key either. Google's
 * token service is stubbed, so this runs offline in CI.
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { GET, POST } from "../app/api/live-token/route.ts";

const KEY = "AIza-test-primary-key";
const realFetch = globalThis.fetch;
const realError = console.error;
let calls;

// The route caps mints per client IP in module memory, so every call gets an
// address of its own unless a test is about that cap.
let nextIp = 0;
function mintRequest(ip = `198.51.100.${++nextIp}`) {
  return new Request("https://voltpilot.test/api/live-token", {
    method: "POST",
    headers: { "x-real-ip": ip },
  });
}

function stubTokenService(respond) {
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return respond();
  };
}

describe("POST /api/live-token", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEYS = `${KEY}, AIza-test-spare-key`;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_LIVE_MODEL;
    console.error = () => {};
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    console.error = realError;
    delete process.env.GEMINI_API_KEYS;
  });

  test("returns a minted token, never the key", async () => {
    stubTokenService(() => Response.json({ name: "auth_tokens/minted" }));
    const res = await POST(mintRequest());
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.token, "auth_tokens/minted");
    assert.equal(body.api_version, "v1alpha");
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.ok(!JSON.stringify(body).includes("AIza"));
  });

  test("mints with the primary key: single use, model locked and nothing else", async () => {
    stubTokenService(() => Response.json({ name: "auth_tokens/minted" }));
    const before = Date.now();
    await POST(mintRequest());

    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/v1alpha\/auth_tokens$/);
    assert.equal(new Headers(calls[0].init.headers).get("x-goog-api-key"), KEY);
    const sent = JSON.parse(calls[0].init.body);
    assert.equal(sent.uses, 1);
    assert.deepEqual(sent.bidiGenerateContentSetup, { model: "models/gemini-3.8-live" });
    // Without the mask every setup field is locked, and the server drops the
    // page's AUDIO modality and closes the socket with 1007.
    assert.equal(sent.fieldMask, "model");
    const window = Date.parse(sent.newSessionExpireTime) - before;
    assert.ok(window > 0 && window <= 61_000, `new-session window was ${window}ms`);
  });

  test("the model follows GEMINI_LIVE_MODEL", async () => {
    process.env.GEMINI_LIVE_MODEL = "gemini-3.1-flash-live-preview";
    stubTokenService(() => Response.json({ name: "auth_tokens/minted" }));
    const body = await (await POST(mintRequest())).json();

    assert.equal(body.model, "gemini-3.1-flash-live-preview");
    assert.equal(JSON.parse(calls[0].init.body).bidiGenerateContentSetup.model, "models/gemini-3.1-flash-live-preview");
  });

  test("a refused mint is a 502 that does not echo the key", async () => {
    stubTokenService(() =>
      Response.json({ error: { message: `API key ${KEY} not valid` } }, { status: 400 }),
    );
    const res = await POST(mintRequest());
    const text = await res.text();

    assert.equal(res.status, 502);
    assert.ok(!text.includes("AIza"));
  });

  test("an unreachable token service is a 502, not a throw", async () => {
    globalThis.fetch = async () => { throw new TypeError("fetch failed"); };
    assert.equal((await POST(mintRequest())).status, 502);
  });

  test("no key configured is a 501, so the page falls back to the form", async () => {
    delete process.env.GEMINI_API_KEYS;
    stubTokenService(() => Response.json({ name: "auth_tokens/minted" }));
    const res = await POST(mintRequest());

    assert.equal(res.status, 501);
    assert.equal(calls.length, 0);
  });

  test("the cap holds per address: the eleventh mint in ten minutes is a 429", async () => {
    stubTokenService(() => Response.json({ name: "auth_tokens/minted" }));
    const statuses = [];
    for (let i = 0; i < 11; i++) statuses.push((await POST(mintRequest("203.0.113.7"))).status);

    assert.deepEqual(statuses, [...Array(10).fill(200), 429]);
    assert.equal(calls.length, 10, "a refused mint must not reach Google");
    const refused = await POST(mintRequest("203.0.113.7"));
    assert.ok(Number(refused.headers.get("retry-after")) > 0);
    // Someone else is unaffected.
    assert.equal((await POST(mintRequest("203.0.113.8"))).status, 200);
  });
});

describe("GET /api/live-token", () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.GEMINI_API_KEYS;
  });

  test("says voice is available and mints nothing", async () => {
    process.env.GEMINI_API_KEYS = KEY;
    stubTokenService(() => Response.json({ name: "auth_tokens/minted" }));
    const res = await GET();
    const text = await res.text();

    assert.equal(res.status, 200);
    assert.deepEqual(JSON.parse(text), { available: true });
    assert.equal(calls.length, 0);
    assert.ok(!text.includes("AIza"));
  });

  test("is a 501 without a key, which the page reads as voice offline", async () => {
    delete process.env.GEMINI_API_KEYS;
    delete process.env.GEMINI_API_KEY;
    assert.equal((await GET()).status, 501);
  });
});
