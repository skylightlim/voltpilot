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

import { POST } from "../app/api/live-token/route.ts";

const KEY = "AIza-test-primary-key";
const realFetch = globalThis.fetch;
const realError = console.error;
let calls;

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
    const res = await POST();
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
    await POST();

    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/v1alpha\/auth_tokens$/);
    assert.equal(new Headers(calls[0].init.headers).get("x-goog-api-key"), KEY);
    const sent = JSON.parse(calls[0].init.body);
    assert.equal(sent.uses, 1);
    assert.deepEqual(sent.bidiGenerateContentSetup, { model: "models/gemini-3.1-flash-live-preview" });
    // Without the mask every setup field is locked, and the server drops the
    // page's AUDIO modality and closes the socket with 1007.
    assert.equal(sent.fieldMask, "model");
    const window = Date.parse(sent.newSessionExpireTime) - before;
    assert.ok(window > 0 && window <= 61_000, `new-session window was ${window}ms`);
  });

  test("the model follows GEMINI_LIVE_MODEL", async () => {
    process.env.GEMINI_LIVE_MODEL = "gemini-3.8-live";
    stubTokenService(() => Response.json({ name: "auth_tokens/minted" }));
    const body = await (await POST()).json();

    assert.equal(body.model, "gemini-3.8-live");
    assert.equal(JSON.parse(calls[0].init.body).bidiGenerateContentSetup.model, "models/gemini-3.8-live");
  });

  test("a refused mint is a 502 that does not echo the key", async () => {
    stubTokenService(() =>
      Response.json({ error: { message: `API key ${KEY} not valid` } }, { status: 400 }),
    );
    const res = await POST();
    const text = await res.text();

    assert.equal(res.status, 502);
    assert.ok(!text.includes("AIza"));
  });

  test("an unreachable token service is a 502, not a throw", async () => {
    globalThis.fetch = async () => { throw new TypeError("fetch failed"); };
    assert.equal((await POST()).status, 502);
  });

  test("no key configured is a 501, so the page falls back to the form", async () => {
    delete process.env.GEMINI_API_KEYS;
    stubTokenService(() => Response.json({ name: "auth_tokens/minted" }));
    const res = await POST();

    assert.equal(res.status, 501);
    assert.equal(calls.length, 0);
  });
});
