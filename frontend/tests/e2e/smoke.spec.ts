import { test, expect, type Page } from "@playwright/test";

/* Every assertion here is a failure that actually shipped or nearly did.
 * Backend responses are stubbed, so a failure means the PAGE is wrong. */

const MONEY = /RM\s?[\d,]+/;

/** Minimal shapes of the six calculator endpoints, enough to render. */
const STUBS: Record<string, unknown> = {
  vehicles: {
    count: 2,
    vehicles: [
      { slug: "toyota-vios", label: "Toyota Vios", type: "hybrid",
        price_rm: 90600, engine_cc: 1496, road_tax_rm: 90, loan_rate_pct: 2.0 },
      { slug: "byd-m6", label: "BYD M6", type: "ev",
        price_rm: 109800, engine_cc: 0, road_tax_rm: 60, loan_rate_pct: 1.75 },
    ],
  },
  loan: {
    price_rm: 90600, down_payment_rm: 9060, down_payment_pct: 10, financed_rm: 81540,
    flat_rate_pct: 2, tenure_years: 7, monthly_rm: 1106.61, total_interest_rm: 11415.6,
    total_payable_rm: 102015.6, effective_rate_pct: 3.8, basis: "stub",
  },
  insurance: {
    sum_insured_rm: 90600, vehicle_type: "hybrid", region: "peninsular",
    policy_year: 1, ncd_pct: 0, premium_rm: 2635.1, basis: "stub",
  },
  "road-tax": { engine_cc: 1496, non_saloon: false, road_tax_rm: 90, basis: "stub" },
  affordability: {
    monthly_budget_rm: 1500, down_payment_rm: 15000, tenure_years: 7, flat_rate_pct: 1.75,
    max_price_rm: 127249, financed_rm: 112249, total_interest_rm: 13750,
    cars_in_range: 28, catalog_total: 184,
    examples: [{ slug: "byd-m6", label: "BYD M6", type: "ev", price_rm: 109800 }],
    basis: "stub",
  },
  depreciation: {
    price_rm: 90600, vehicle_type: "hybrid", slug: null, years: 5, k_per_year: 0.139,
    basis: "type_curve", value_rm: 45213, total_depreciation_rm: 45387,
    basis_note: "stub",
    schedule: [1, 2, 3, 4, 5].map((year) => ({
      year, retained_pct: 90 - year * 10, value_rm: 90600 - year * 9000, lost_rm: year * 9000,
    })),
  },
  ownership: {
    slug: "toyota-vios", label: "Toyota Vios", type: "hybrid", price_rm: 90600,
    annual_km: 15000, can_charge_home: true, fuel_scenario: "subsidised",
    running_cost_rm_yr: 3725, co2_kg_yr: 1800, years: 5, total_rm: 67484,
    per_month_rm: 1125, per_km_rm: 0.9, resale_value_rm: 45213,
    retained_pct: 49.9, retained_basis: "type_curve", maintenance_basis: "estimated",
    lines: [
      { key: "depreciation", amount_rm: 45387, share: 0.67 },
      { key: "energy", amount_rm: 18625, share: 0.28 },
    ],
  },
};

/** Serve the stubs and record which endpoints the page actually called. */
async function stubBackend(page: Page): Promise<string[]> {
  const called: string[] = [];
  // A predicate, not a glob: Playwright globs treat "?" as a single-character
  // wildcard, so a pattern that matched /vehicles quietly missed every URL
  // carrying a query string — and the page then reached the real backend
  // instead, which is exactly the thing this test must not depend on.
  await page.route(
    (url) => url.pathname.startsWith("/api/proxy/calculators/"),
    async (route) => {
      const name = new URL(route.request().url()).pathname.split("/").pop()!;
      called.push(name);
      let body = STUBS[name];
      if (!body) return route.fulfill({ status: 404, body: "{}" });
      // Vary with the input, or a test of the home-charging control asserts
      // nothing: a fixed stub returns the same total whatever is ticked.
      if (name === "ownership") {
        const home = new URL(route.request().url()).searchParams.get("can_charge_home") !== "false";
        body = { ...(body as object), total_rm: home ? 67484 : 73599, can_charge_home: home };
      }
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    },
  );
  return called;
}

test.describe("calculators", () => {
  test("every panel renders a figure, not an empty card", async ({ page }) => {
    // The defect this exists for: on 2026-09-14 a stale dev bundle left the
    // page rendering its inputs and never calling the API. Panels were blank
    // and nothing in the repository could tell.
    const called = await stubBackend(page);
    await page.goto("/calculators");

    // Assert on a figure only the API can produce. A generic /RM[\d,]+/ passes
    // on the slider captions ("RM500", "RM6,000+"), which are static text — so
    // it never waits for the network and would go green on the very blank page
    // this test exists to catch.
    await expect(page.getByRole("heading", { name: /What can I afford/i })).toBeVisible();
    await expect(page.locator("body")).toContainText("RM127,249");   // max_price_rm
    await expect(page.locator("body")).toContainText("28 / 184");    // cars_in_range

    // and it must genuinely call the backend, not merely look complete
    expect(called).toContain("vehicles");
    expect(called).toContain("affordability");
  });

  test("picking a car fills the car-owned panels", async ({ page }) => {
    await stubBackend(page);
    await page.goto("/calculators");
    await page.selectOption("select", "toyota-vios");

    // a car's price is a fact, not a control: issue.md issue 5b's UX note
    await expect(page.locator("body")).toContainText("RM90,600");
    for (const panel of [/Car loan/i, /^Insurance/i, /Road tax/i, /Five-year cost/i]) {
      const card = page.locator("div.rounded-lg").filter({ has: page.getByRole("heading", { name: panel }) });
      await expect(card).toContainText(MONEY);
    }
  });

  test("a custom car refuses the panels it cannot answer", async ({ page }) => {
    await stubBackend(page);
    await page.goto("/calculators");
    await page.selectOption("select", "custom");

    const five = page.locator("div.rounded-lg")
      .filter({ has: page.getByRole("heading", { name: /Five-year cost/i }) });
    await expect(five).toContainText(/needs a car from the catalogue/i);
  });
});

test.describe("interview", () => {
  test("the derived annual mileage is shown back", async ({ page }) => {
    // issue.md issue 19: daily_km x trips_per_week x 52 is the multiplier behind
    // every running-cost figure, and a buyer never saw the product.
    await page.goto("/intake/1");
    await page.getByRole("button", { name: "40 km" }).click();
    await page.getByRole("button", { name: /next step/i }).click();
    await page.selectOption("select", "5");
    await expect(page.locator("body")).toContainText("10,400 km a year");
  });

  test("Singapore is offered as a long-trip destination", async ({ page }) => {
    // issue.md issue 18: ProfileIn accepted it, the interview never offered it.
    await page.goto("/intake/4");
    await expect(page.locator("body")).toContainText(/Singapore/i);
  });
});

test("the language toggle reaches the interview and sets the lang attribute", async ({ page }) => {
  // issue.md issue 22: Malay pages declared themselves English, and the flow
  // that matters had no toggle at all.
  await page.goto("/intake/1");
  // aria-label wins over the visible "BM" as the accessible name
  await page.getByRole("button", { name: "Bahasa Melayu" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "ms");
});

test.describe("under abuse", () => {
  /* Reported as "the calculator breaks when I press the button too often".
   * Every input is a slider, so one drag was hundreds of requests against a
   * 120/minute limit, and each 429 blanked a panel for the 47 seconds the
   * Retry-After asked for. */

  test("a hard drag costs a handful of requests, not hundreds", async ({ page }) => {
    const called = await stubBackend(page);
    await page.goto("/calculators");
    await page.selectOption("select", "custom");
    await page.waitForTimeout(600);

    const before = called.length;
    // Spaced across task ticks, the way a real drag arrives. A synchronous loop
    // is not a faithful simulation: React batches it into a single update, so
    // it fires few requests even with no debounce at all and guards nothing.
    await page.locator("#calc-price").evaluate(async (el: HTMLInputElement) => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      for (let v = 60_000; v <= 100_000; v += 1_000) {
        set.call(el, String(v));
        el.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise((r) => setTimeout(r, 10));
      }
    });
    await page.waitForTimeout(1_200);

    // 40 steps drive loan, insurance and depreciation — 120 requests undebounced
    const fired = called.length - before;
    expect(fired, `a 40-step drag fired ${fired} requests`).toBeLessThan(15);
  });

  test("a rate-limited reply keeps the figure already on screen", async ({ page }) => {
    let reject = false;
    await page.route(
      (url) => url.pathname.startsWith("/api/proxy/calculators/"),
      async (route) => {
        const name = new URL(route.request().url()).pathname.split("/").pop()!;
        if (reject) {
          return route.fulfill({
            status: 429,
            contentType: "application/json",
            body: JSON.stringify({ detail: "Too many requests.", retry_after_seconds: 47 }),
          });
        }
        const body = STUBS[name];
        if (!body) return route.fulfill({ status: 404, body: "{}" });
        await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
      },
    );

    await page.goto("/calculators");
    await page.selectOption("select", "toyota-vios");
    const loan = page.locator("div.rounded-lg")
      .filter({ has: page.getByRole("heading", { name: /Car loan/i }) });
    await expect(loan).toContainText("RM1,106.61");

    // every further request now fails; moving an input must not erase the answer
    reject = true;
    await page.locator("#calc-down").fill("30000");
    await page.waitForTimeout(1_500);
    await expect(loan).toContainText("RM1,106.61");
  });
});


test.describe("home charging", () => {
  /* Reported as "this element does not change anything". It was wired
   * correctly and did change an EV's total; it was shown on hybrids too, where
   * it provably cannot act, because a hybrid runs on petrol. Measured at
   * 15,000 km/yr: BYD M6 RM96,361 -> RM102,476, a PHEV RM591,236 -> RM591,821,
   * Toyota Vios RM67,484 either way. */

  const fiveYear = (page: Page) =>
    page.locator("div.rounded-lg").filter({ has: page.getByRole("heading", { name: /Five-year cost/i }) });

  test("an electric car offers it, and it moves the total", async ({ page }) => {
    await stubBackend(page);
    await page.goto("/calculators");
    await page.selectOption("select", "byd-m6");

    const box = fiveYear(page).locator('input[type="checkbox"]');
    await expect(box).toBeChecked();
    await expect(fiveYear(page)).toContainText("RM67,484");

    await box.uncheck();
    await expect(fiveYear(page)).toContainText("RM73,599");
  });

  test("a hybrid is told why it is not offered, rather than shown a dead control", async ({ page }) => {
    await stubBackend(page);
    await page.goto("/calculators");
    await page.selectOption("select", "toyota-vios");

    await expect(fiveYear(page).locator('input[type="checkbox"]')).toHaveCount(0);
    await expect(fiveYear(page)).toContainText(/runs on petrol/i);
  });
});
