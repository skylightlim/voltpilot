import { test, expect } from "@playwright/test";

/* Horizontal overflow.
 *
 * Reported as "the website is offset to the right": at ~1024-1100px the navbar
 * needed 1151px (EN) and the excess was clipped off the right edge rather than
 * scrolled to, so the CTA was cut in half. Nothing in the nav can wrap or
 * shrink — flex-nowrap plus whitespace-nowrap — so it must be made to fit.
 *
 * 1023/1024 and 1279/1280 are here on purpose: they bracket the `lg` and `xl`
 * breakpoints, where a row gains items without gaining width. A sweep that
 * only samples round numbers walks straight past it, which is how this
 * survived a 375px check and a 1440px screenshot.
 */

const WIDTHS = [1920, 1440, 1366, 1280, 1279, 1100, 1024, 1023, 900, 768, 600, 414, 375, 320];
const ROUTES = ["/", "/calculators", "/sliders"];
const PROFILE_KEY = "atp.profile";

for (const lang of ["en", "bm"] as const) {
  test.describe(`no horizontal overflow [${lang}]`, () => {
    test(`across ${WIDTHS.length} widths on ${ROUTES.length} routes`, async ({ page }) => {
      // Malay runs 15-20% longer than English (DESIGN.md §6), and it is longer
      // in the nav CTA specifically, so it can overflow where English fits.
      await page.goto("/");
      await page.evaluate(
        ([k, l]) => sessionStorage.setItem(k, JSON.stringify({ language: l })),
        [PROFILE_KEY, lang],
      );

      const failures: string[] = [];
      for (const route of ROUTES) {
        for (const width of WIDTHS) {
          await page.setViewportSize({ width, height: 900 });
          await page.goto(route, { waitUntil: "domcontentloaded" });
          await page.waitForTimeout(150);

          const { over, culprit, navClipped } = await page.evaluate(() => {
            const de = document.documentElement;
            const nav = document.querySelector("nav");
            const last = nav?.lastElementChild?.getBoundingClientRect();
            let culprit: string | null = null;
            const over = de.scrollWidth - de.clientWidth;
            if (over > 0) {
              // A marquee is deliberately wider than the viewport and is
              // contained by an ancestor that clips it, so it is never the
              // cause — but it is the widest box on the page and will win any
              // naive "widest element" search, sending the reader after the
              // wrong thing. Skip anything an ancestor already clips.
              const clippedByAncestor = (el: Element) => {
                for (let a = el.parentElement; a && a !== de; a = a.parentElement) {
                  if (getComputedStyle(a).overflowX !== "visible") return true;
                }
                return false;
              };
              let widest = 0;
              for (const el of document.querySelectorAll("body *")) {
                const r = el.getBoundingClientRect();
                if (r.width <= de.clientWidth + 1) continue;
                if (getComputedStyle(el).position === "fixed") continue;
                if (clippedByAncestor(el)) continue;
                if (r.width > widest) {
                  widest = r.width;
                  culprit = (el.className?.toString?.() || el.tagName).slice(0, 60);
                }
              }
            }
            return {
              over,
              culprit,
              navClipped: last ? Math.round(last.right) > de.clientWidth : false,
            };
          });

          if (over > 0) failures.push(`${route} @${width}px overflows ${over}px${culprit ? ` (${culprit})` : ""}`);
          // Clipped-but-not-scrollable is the nastier half: the document
          // reports no overflow at all while content sits past the edge.
          if (navClipped) failures.push(`${route} @${width}px nav is clipped at the right edge`);
        }
      }
      expect(failures, failures.join("\n")).toEqual([]);
    });
  });
}
