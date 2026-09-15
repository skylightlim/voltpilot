import { test, expect } from "@playwright/test";

/* The motion added for the 2026-09-15 pass. Each of these has a failure mode
   that is invisible in review: a fill that drifts from its thumb only at the
   ends, a tween that restarts instead of retargeting, and reduced-motion
   guards that quietly stop applying. */

const figures = async (page: import("@playwright/test").Page) =>
  ((await page.locator("#calculator").innerText()).match(/RM [\d,]+/g) ?? []).slice(0, 3).join(" ");

test.describe("slider", () => {
  test("the fill lands on the thumb's centre at both ends, not the track's", async ({ page }) => {
    // The thumb's centre travels inset by half a thumb at each end, so filling
    // to a raw percentage misses it by up to 14px — visible only at 0 and 100,
    // which is exactly where a reviewer is least likely to drag.
    await page.goto("/");
    const el = page.locator("input.slider").first();
    await el.waitFor();
    const width = (await el.boundingBox())!.width;
    const THUMB = 28;

    const resolve = (v: string) => {
      const m = v.match(/^calc\((-?[\d.]+)%\s*([+-])\s*(-?[\d.]+)px\)$/);
      if (m) return (parseFloat(m[1]) / 100) * width + (m[2] === "-" ? -1 : 1) * parseFloat(m[3]);
      return v.endsWith("px") ? parseFloat(v) : (parseFloat(v) / 100) * width;
    };

    const min = Number(await el.getAttribute("min"));
    const max = Number(await el.getAttribute("max"));
    await el.focus();

    for (const key of ["Home", "End"]) {
      await page.keyboard.press(key);
      await expect
        .poll(async () => Number(await el.inputValue()))
        .toBe(key === "Home" ? min : max);
      const fill = await el.evaluate((n) =>
        getComputedStyle(n).getPropertyValue("--slider-fill").trim(),
      );
      const frac = (Number(await el.inputValue()) - min) / (max - min);
      const expected = THUMB / 2 + frac * (width - THUMB);
      expect(Math.abs(resolve(fill) - expected)).toBeLessThan(1);
    }
  });

  test("the fill actually moves when the value does", async ({ page }) => {
    // Guards the wiring, not the maths: a stale bundle once left --slider-p
    // pinned at its mount value while the input's own value tracked fine.
    await page.goto("/");
    const el = page.locator("input.slider").first();
    await el.focus();
    await page.keyboard.press("Home");
    const atMin = await el.evaluate((n) => getComputedStyle(n).getPropertyValue("--slider-p"));
    await page.keyboard.press("End");
    await expect
      .poll(async () => el.evaluate((n) => getComputedStyle(n).getPropertyValue("--slider-p")))
      .not.toBe(atMin);
  });
});

test.describe("live figures", () => {
  test("a figure glides to its new value rather than snapping", async ({ page }) => {
    await page.goto("/");
    const el = page.locator("input.slider").first();
    const box = (await el.boundingBox())!;
    const before = await figures(page);

    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();

    await page.waitForTimeout(80);
    const inFlight = await figures(page);
    await page.waitForTimeout(700);
    const settled = await figures(page);

    expect(settled).not.toBe(before);
    // Mid-flight it must be somewhere other than its destination, or nothing
    // is animating and the tween is decorative.
    expect(inFlight).not.toBe(settled);
  });
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("figures arrive immediately", async ({ page }) => {
    await page.goto("/");
    const el = page.locator("input.slider").first();
    const box = (await el.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.85, box.y + box.height / 2);
    await page.waitForTimeout(60);
    const quick = await figures(page);
    await page.waitForTimeout(600);
    expect(await figures(page)).toBe(quick);
  });

  test("the slider drops its transitions", async ({ page }) => {
    await page.goto("/");
    const el = page.locator("input.slider").first();
    await el.waitFor();
    // The global reduced-motion reset neutralises transitions by collapsing the
    // duration to 1e-5s rather than zeroing it, so assert "effectively off"
    // rather than "exactly 0" — which would fail on a correct implementation.
    const { property, duration } = await el.evaluate((n) => {
      const cs = getComputedStyle(n);
      return { property: cs.transitionProperty, duration: cs.transitionDuration };
    });
    const off =
      property === "none" || duration.split(",").every((d) => parseFloat(d) < 0.05);
    expect(off).toBe(true);
  });
});

test.describe("button press", () => {
  test("the press compresses and returns", async ({ page }) => {
    await page.goto("/calculators");
    const btn = page.getByRole("button", { name: /^Hybrid$/ }).first();
    await btn.waitFor();
    const box = (await btn.boundingBox())!;
    const scale = () => btn.evaluate((n) => new DOMMatrix(getComputedStyle(n).transform).a);

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect.poll(scale).toBeLessThan(0.99);
    // Release off-target: letting go on the pill fires onClick, and it
    // re-renders with new classes, which restarts the transition.
    await page.mouse.move(box.x + box.width / 2, box.y - 120);
    await page.mouse.up();
    await expect.poll(scale).toBeCloseTo(1, 3);
  });

  test("transform is driven by the spring curve, not an ease", async ({ page }) => {
    // Deliberately NOT sampling the live animation: the overshoot on a 4%
    // press peaks at ~1.0018 for ~100ms, and polling for it flakes under
    // parallel workers. The overshoot maths is proven exactly in
    // tests/spring.test.mjs; what can only be checked in a browser is whether
    // that curve is wired to `transform` on a real button, which is a static
    // read. Two failure modes it catches: a Tailwind utility outranking
    // .pressable, and the @supports upgrade not applying so the token stays a
    // plain cubic-bezier.
    await page.goto("/calculators");
    const btn = page.getByRole("button", { name: /^Hybrid$/ }).first();
    await btn.waitFor();

    const { props, easings } = await btn.evaluate((n) => {
      const cs = getComputedStyle(n);
      return {
        props: cs.transitionProperty.split(", "),
        easings: cs.transitionTimingFunction.split(/,(?![^(]*\))/).map((e) => e.trim()),
      };
    });

    const i = props.indexOf("transform");
    expect(i, "transform is not in the transition list").toBeGreaterThanOrEqual(0);

    const curve = easings[i];
    expect(curve).toContain("linear(");
    // A spring is exactly a curve with a sample above its endpoint. An ease-out
    // never exceeds 1, so this one number separates the two.
    const peak = Math.max(...curve.slice(7, -1).split(",").map((v) => parseFloat(v)));
    expect(peak).toBeGreaterThan(1);
  });

  test("no .pressable element lets a utility outrank the press transition", async ({ page }) => {
    // The failure this guards is invisible: the button still highlights, it
    // just stops moving, because the competing utility's property list has no
    // `transform` in it.
    for (const route of ["/", "/calculators", "/sliders"]) {
      await page.goto(route);
      await page.waitForTimeout(400);
      const bad = await page.evaluate(() =>
        [...document.querySelectorAll(".pressable")]
          .filter((n) => !getComputedStyle(n).transitionProperty.split(", ").includes("transform"))
          .map((n) => (n as HTMLElement).className.slice(0, 70)),
      );
      expect(bad, `on ${route}`).toEqual([]);
    }
  });
});
