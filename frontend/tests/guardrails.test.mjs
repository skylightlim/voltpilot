/**
 * Frontend guardrails.
 *
 * Run:  node --test tests/
 *
 * Uses node:test and node:assert only — no test framework, no browser, no new
 * dependency. Every check here encodes a defect that shipped and went unnoticed,
 * so each test names the bug it exists to catch.
 *
 * The route checks need `npm run dev` on :3000 and skip themselves when it is
 * not up, so the static half still runs anywhere.
 */

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

/** Every .ts/.tsx file under the app's source directories. */
function sources() {
  const out = [];
  for (const dir of ["app", "components", "lib"]) {
    const walk = (d) => {
      for (const name of readdirSync(d)) {
        const p = join(d, name);
        if (statSync(p).isDirectory()) walk(p);
        else if ([".ts", ".tsx"].includes(extname(p))) out.push(p);
      }
    };
    walk(join(ROOT, dir));
  }
  return out;
}

const read = (p) => readFileSync(p, "utf8");
const rel = (p) => p.slice(ROOT.length + 1);

/** Parse the S = { ... } literal out of lib/i18n.ts by brace balance. */
function strings() {
  const src = read(join(ROOT, "lib", "i18n.ts"));
  const open = src.indexOf("{", src.indexOf("const S = {"));
  let depth = 0, end = -1, inStr = null, esc = false;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
    if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "/" && src[i + 1] === "*") { i = src.indexOf("*/", i) + 1; continue; }
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) { end = i; break; }
  }
  return JSON.parse(
    JSON.stringify(new Function(`return (${src.slice(open, end + 1)})`)()),
  );
}

describe("i18n", () => {
  const S = strings();

  test("every entry is a non-empty [en, bm] pair", () => {
    const bad = Object.entries(S).filter(
      ([, v]) => !Array.isArray(v) || v.length !== 2 || v.some((x) => typeof x !== "string" || !x.trim()),
    );
    assert.deepEqual(bad.map(([k]) => k), [], "malformed or half-translated entries");
  });

  test("placeholders match across both languages", () => {
    // A {n} present in one language and missing in the other renders a literal
    // brace to half the audience.
    const vars = (s) => (s.match(/\{(\w+)\}/g) ?? []).sort().join(",");
    const bad = Object.entries(S).filter(([, [en, bm]]) => vars(en) !== vars(bm));
    assert.deepEqual(bad.map(([k]) => k), []);
  });

  test("every key referenced in source is defined", () => {
    // A missing key renders the raw key string to the user.
    const blob = sources().map(read).join("\n");
    const referenced = new Set(
      [...blob.matchAll(/\bt\(\s*"([^"]+)"/g)].map((m) => m[1]),
    );
    const missing = [...referenced].filter((k) => !(k in S));
    assert.deepEqual(missing, []);
  });
});

describe("design system", () => {
  test("no Tailwind dark: variants while the theme is light-locked", () => {
    // DESIGN.md §1 locks the theme to light and defines no dark tokens, so a
    // `dark:` utility flips text white while the background stays bone. That is
    // exactly what hid the footer navigation and FAQ links from every visitor
    // whose OS was set to dark.
    //
    // `dark: "..."` with a space is a variants-object KEY (Button/Card/Badge
    // tones) and is unrelated — requiring a non-space after the colon skips it.
    const offenders = [];
    for (const p of sources()) {
      read(p).split("\n").forEach((line, i) => {
        if (/\sdark:[^\s"']/.test(line)) offenders.push(`${rel(p)}:${i + 1}`);
      });
    }
    assert.deepEqual(offenders, []);
  });

  test("no server/client-branched constant is rendered into JSX", () => {
    // lib/api.ts picks BACKEND_URL with `typeof window !== "undefined"`, so it
    // is "/api/proxy" on the client and the real host on the server. The voice
    // page rendered it into a hidden <span>, which failed hydration on every
    // load and published the backend address into the served HTML.
    const offenders = [];
    for (const p of sources()) {
      if (rel(p) === "lib/api.ts") continue;
      read(p).split("\n").forEach((line, i) => {
        if (/\{\s*BACKEND_URL\s*\}/.test(line) && !line.includes("from ") && !line.includes("import"))
          offenders.push(`${rel(p)}:${i + 1}`);
      });
    }
    assert.deepEqual(offenders, [], "BACKEND_URL rendered into markup");
  });

  test("the font variables globals.css consumes are actually bound", () => {
    // globals.css referenced --font-grotesk / --font-body / --font-mono while
    // nothing defined them. An undefined var() inside a font-family shorthand
    // invalidates the whole declaration, so every surface fell back to the UA
    // serif and the typographic half of the identity never rendered at all.
    const css = read(join(ROOT, "app", "globals.css"));
    const layout = read(join(ROOT, "app", "layout.tsx"));
    const consumed = new Set(
      [...css.matchAll(/var\((--font-[a-z-]+)\)/g)].map((m) => m[1]),
    );
    // --font-sans/display/mono are defined in @theme; the leaf variables they
    // point at must come from next/font.
    const leaves = [...consumed].filter((v) =>
      new RegExp(`${v}:\\s*var\\(`).test(css) === false && !/^--font-(sans|display)$/.test(v),
    );
    const unbound = leaves.filter((v) => !layout.includes(`variable: "${v}"`));
    assert.deepEqual(unbound, [], "consumed by globals.css but never bound in layout.tsx");
  });
});

describe("voice interview", () => {
  const src = read(join(ROOT, "app", "interview", "voice", "page.tsx"));

  test("the announced question count matches the questions actually scripted", () => {
    // The script grew 7 -> 11 and both prompt arrays were rewritten, but the
    // spoken greeting still promised "7 quick questions". The advisor opened by
    // announcing a count it contradicted four questions later, and users who
    // took it at its word hung up before the budget question.
    const numbered = [...src.matchAll(/"(\d+)\.\s/g)].map((m) => Number(m[1]));
    const asked = Math.max(...numbered);
    const announced = [
      ...src.matchAll(
        /(?:exactly|all|tepat|semua)\s+(\d+)\s+(?:questions|soalan)|(\d+)\s+(?:quick questions|soalan pantas)/g,
      ),
    ].map((m) => Number(m[1] ?? m[2]));

    // en + bm, each stating the count when opening the list, when closing it,
    // and once more in the greeting.
    assert.ok(announced.length >= 6, `only ${announced.length} count statements found`);
    for (const n of announced) {
      assert.equal(n, asked, `prompt announces ${n} questions but scripts ${asked}`);
    }
    for (let i = 1; i <= asked; i++) {
      assert.ok(numbered.filter((n) => n === i).length >= 2, `question ${i} missing from a language`);
    }
  });

  test("no second speech recognizer runs alongside Gemini's transcription", () => {
    // Android Chrome plays a system chime on every SpeechRecognition start and
    // abort. The advisor's playback aborted one and restarted it on every turn,
    // so the whole interview beeped on Honor and Pixel handsets, where those
    // chimes ring at notification volume. Desktop Chrome plays them quietly,
    // which is why it survived. The session already sets inputAudioTranscription
    // and reads serverContent.inputTranscription, so the local recognizer bought
    // slightly faster interim text and cost a beep per exchange.
    assert.ok(
      !/webkitSpeechRecognition|new SpeechRecognition/.test(src),
      "the voice page constructs a SpeechRecognition again",
    );
    assert.match(src, /inputTranscription/, "server transcription must remain the source");
  });

  test("a live session holds a screen wake lock and gives it back", () => {
    // iOS auto-locks the display after a short idle and the interview is minutes
    // of deliberately not touching the screen, so the phone blanked mid-answer
    // and took the AudioContexts and the socket with it.
    assert.match(src, /wakeLock\.request\(\s*["']screen["']\s*\)/, "no wake lock is requested");
    // Releasing only when the interview finishes normally would leave the screen
    // awake on whatever the user opened after walking away mid-interview.
    // The definition reads `const releaseWakeLock = useCallback(...)`, so a match
    // on the call syntax counts invocations only.
    assert.match(src, /^\s*releaseWakeLock\(\);/m, "releaseWakeLock is defined but never called");
    assert.match(src, /cleanupRef\.current\(\)/, "session teardown is not wired to unmount");
  });

  test("the voice script covers every field /interview/form collects", () => {
    // The two intakes feed the same scoring engine. A field the form asks for
    // and the voice interview does not is not a missing question — it is a
    // profile that scores against the engine's fallback anchor instead of the
    // user's own numbers, silently, with no way to tell from the result.
    const topics = {
      workplace_charging: [/charge at your workplace/i, /mengecas di tempat kerja/i],
      grid_region: [/Peninsular grid/i, /grid Semenanjung/i],
      electricity_bill: [/monthly electricity bill/i, /bil elektrik bulanan/i],
      budget: [/maximum budget/i, /bajet maksimum/i],
    };
    const missing = Object.entries(topics)
      .filter(([, [en, bm]]) => !en.test(src) || !bm.test(src))
      .map(([k]) => k);
    assert.deepEqual(missing, [], "asked on the form but not in the voice script");
  });
});

describe("routes", () => {
  const ROUTES = ["/", "/methodology", "/analysis", "/sliders", "/interview/form"];
  let up = false;

  before(async () => {
    try {
      const r = await fetch(BASE, { signal: AbortSignal.timeout(4000) });
      up = r.ok;
    } catch { up = false; }
    if (!up) console.log(`  (dev server not on ${BASE} — route checks skipped)`);
  });

  for (const route of ROUTES) {
    test(`${route} renders`, async (t) => {
      if (!up) return t.skip("dev server not running");
      const res = await fetch(BASE + route, { signal: AbortSignal.timeout(30000) });
      assert.equal(res.status, 200, `${route} returned ${res.status}`);

      const html = await res.text();
      // Content must exist in the server-rendered HTML. Scrub animations may
      // reveal it, but they must never be the reason it exists — a no-JS or
      // reduced-motion visitor has to get the finished page.
      assert.ok(html.length > 5000, `${route} served a suspiciously small page`);
      assert.match(html, /__variable_/, `${route} is missing the next/font class bindings`);
    });
  }
});

describe("api error handling", () => {
  test("every ApiError kind has copy in both languages", async () => {
    // The pages render t(err.messageKey), so a kind without a key shows the raw
    // key to the user — and a missing BM half shows English to half the market.
    const S = strings();
    const kinds = ["offline", "timeout", "rate_limited", "not_found", "invalid", "server", "unknown"];
    for (const k of kinds) {
      const entry = S[`err.${k}`];
      assert.ok(entry, `no copy for err.${k}`);
      assert.ok(entry[0]?.trim() && entry[1]?.trim(), `err.${k} is missing a language`);
    }
  });

  test("a failed fetch becomes an ApiError, not a raw TypeError", async () => {
    // The blank-screen bug: an unreachable backend rejected out of api() as
    // "TypeError: Failed to fetch" and no page had anything to render.
    const { apiService, ApiError } = await import("../lib/api.ts");
    const original = globalThis.fetch;
    globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
    try {
      await apiService.getConfigSolar?.() ?? await apiService.getInterviewScript();
      assert.fail("expected a rejection");
    } catch (err) {
      assert.ok(err instanceof ApiError, `got ${err?.constructor?.name}`);
      assert.equal(err.kind, "offline");
      assert.equal(err.messageKey, "err.offline");
    } finally {
      globalThis.fetch = original;
    }
  });

  test("a 429 carries a retry hint the page can show", async () => {
    const { apiService, ApiError } = await import("../lib/api.ts");
    const original = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ retry_after_seconds: 30 }), {
        status: 429, headers: { "Retry-After": "30", "Content-Type": "application/json" },
      });
    try {
      await apiService.getInterviewScript();
      assert.fail("expected a rejection");
    } catch (err) {
      assert.equal(err.kind, "rate_limited");
      assert.equal(err.retryAfterSeconds, 30);
    } finally {
      globalThis.fetch = original;
    }
  });
});
