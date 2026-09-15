import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { springEase, springLinear } from "../lib/spring.ts";

const sample = (ease, n = 400) => Array.from({ length: n + 1 }, (_, i) => ease(i / n));

describe("spring easing", () => {
  test("lands exactly on its endpoints", () => {
    // GSAP reads the return value as progress and CSS linear() interpolates
    // between samples: a curve that ends at 0.997 leaves the element visibly
    // short of its target, with no error anywhere to say why.
    for (const bounce of [0, 0.12, 0.25, 0.3, 0.4, 1]) {
      const ease = springEase({ bounce });
      assert.equal(ease(0), 0, `bounce ${bounce} start`);
      assert.equal(ease(1), 1, `bounce ${bounce} end`);
    }
  });

  test("bounce 0 never overshoots", () => {
    // Critically damped is the whole point of asking for 0 — it is what a
    // dropdown or a tooltip wants, where an overshoot reads as a glitch.
    const peak = Math.max(...sample(springEase({ bounce: 0 })));
    assert.ok(peak <= 1 + 1e-9, `peaked at ${peak}`);
  });

  test("more bounce overshoots further", () => {
    const peaks = [0, 0.15, 0.25, 0.4].map((b) => Math.max(...sample(springEase({ bounce: b }))));
    for (let i = 1; i < peaks.length; i++) {
      assert.ok(peaks[i] > peaks[i - 1], `peak did not grow: ${peaks.join(" -> ")}`);
    }
    assert.ok(peaks.at(-1) > 1.05, `bounce 0.4 barely moved: ${peaks.at(-1)}`);
  });

  test("it settles rather than ringing on past the end", () => {
    // The tail is what separates a spring from a wobble: by the last quarter
    // the curve must be within a whisker of its target.
    const tail = sample(springEase({ bounce: 0.3 })).slice(300);
    const worst = Math.max(...tail.map((v) => Math.abs(v - 1)));
    assert.ok(worst < 0.01, `still ${(worst * 100).toFixed(1)}% off in the last quarter`);
  });

  test("it rises before it overshoots, with no early reversal", () => {
    const s = sample(springEase({ bounce: 0.3 }));
    const peakAt = s.indexOf(Math.max(...s));
    for (let i = 1; i <= peakAt; i++) {
      assert.ok(s[i] >= s[i - 1] - 1e-9, `dipped at ${i / 400}`);
    }
  });

  test("the CSS string is a well-formed linear() with pinned ends", () => {
    const css = springLinear({ bounce: 0.3, steps: 22 });
    assert.match(css, /^linear\((?:-?\d+(?:\.\d+)?, ){22}-?\d+(?:\.\d+)?\)$/);
    const pts = css.slice(7, -1).split(", ").map(Number);
    assert.equal(pts[0], 0);
    assert.equal(pts.at(-1), 1);
    assert.ok(pts.every(Number.isFinite), "a NaN would drop the whole declaration");
  });

  test("the tokens checked into globals.css still match the generator", async () => {
    // These are pasted, not computed at build time, so nothing but this test
    // stops the CSS drifting from lib/spring.ts after a parameter is retuned.
    const { readFileSync } = await import("node:fs");
    const css = readFileSync("app/globals.css", "utf8");
    for (const [name, opts] of [
      ["--ease-spring", { bounce: 0.3, steps: 22 }],
      ["--ease-spring-soft", { bounce: 0.12, steps: 18 }],
      ["--ease-spring-firm", { bounce: 0, steps: 14 }],
    ]) {
      const m = css.match(new RegExp(`${name}:\\s*(linear\\([^;]*\\));`));
      assert.ok(m, `${name} is not defined in globals.css`);
      assert.equal(m[1], springLinear(opts), `${name} has drifted from lib/spring.ts`);
    }
  });
});
