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
