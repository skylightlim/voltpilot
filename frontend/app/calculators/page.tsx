"use client";

/* Standalone calculators.
 *
 * The page is in two parts, because the questions are two different shapes.
 *
 * "What can I afford?" takes no car — it OUTPUTS cars, so it is the entry
 * point and its results link into the second part.
 *
 * Everything below is about one specific car, and there the car is the
 * authority. An earlier version let you pick a car and then drag the price
 * slider anywhere, which made the selection meaningless: the loan panel would
 * show figures for RM300,000 while the five-year panel, which reads the
 * catalogue directly, still answered for the RM109,800 car named at the top.
 * Two panels on one page describing different cars is worse than not offering
 * the choice.
 *
 * So a car's price, drivetrain and engine are shown as facts, not controls.
 * What stays adjustable is what belongs to the BUYER rather than the car:
 * deposit, tenure, policy year, region, annual mileage, home charging. To move
 * a car-owned number you switch to "your own figures", which is honest —
 * once you change the price it is not that car's price any more.
 */

import * as React from "react";
import {
  Calculator, Landmark, ShieldCheck, ReceiptText, Wallet, TrendingDown, Coins, Car,
} from "lucide-react";
import { Card, Footer, Navbar, SectionLabel } from "@/components/ui";
import { RangeField } from "@/components/RangeField";
import {
  apiService, type CalcVehicle, type LoanResult, type InsuranceResult, type RoadTaxResult,
  type Affordability, type DepreciationResult, type OwnershipResult,
} from "@/lib/api";
import { useT, type StrKey } from "@/lib/i18n";

type Drivetrain = "ev" | "hybrid" | "phev";

const rm = (n: number | null | undefined, digits = 0) =>
  n === null || n === undefined
    ? "—"
    : `RM${n.toLocaleString("en-MY", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

const selectCls =
  "w-full rounded-xl border border-line bg-parchment px-3.5 py-2.5 text-[15px] text-ink outline-none focus:border-primary";

function Readout({ label, value, big = false }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/60 py-2 last:border-0">
      <span className="text-[13px] text-muted">{label}</span>
      <span className={big ? "text-[22px] font-bold text-ink" : "text-[15px] font-semibold text-ink"}>
        {value}
      </span>
    </div>
  );
}

/** A number the CAR owns. Rendered flat so it cannot be mistaken for a control. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="block text-[11.5px] font-semibold uppercase tracking-wide text-muted">{label}</span>
      <span className="mt-0.5 block text-[17px] font-bold text-ink">{value}</span>
    </div>
  );
}

/** One labelled bar. Used by the depreciation schedule and the cost breakdown. */
function Bar({ label, pct, value, wide = false }: {
  label: string; pct: number; value: string; wide?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={`${wide ? "w-28 text-[11.5px] capitalize" : "w-8 font-mono text-[11px]"} shrink-0 text-muted`}>
        {label}
      </span>
      <div className="h-4 flex-1 overflow-hidden rounded-full bg-line/40">
        <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.max(1, pct)}%` }} />
      </div>
      <span className="w-24 shrink-0 text-right font-mono text-[11.5px] tabular-nums text-ink">{value}</span>
    </div>
  );
}

/** Card + heading, the shape every calculator shares. */
function Panel({ icon: Icon, title, className = "", children }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string; className?: string; children: React.ReactNode;
}) {
  return (
    <Card className={`mt-5 p-5 ${className}`}>
      <h2 className="flex items-center gap-2 text-[17px] font-bold text-ink">
        <Icon className="h-4.5 w-4.5 text-primary" /> {title}
      </h2>
      {children}
    </Card>
  );
}

function Basis({ text }: { text: string }) {
  return <p className="mt-3 text-[11.5px] leading-relaxed text-muted">{text}</p>;
}

/** Heading for the buyer-owned inputs, so the two kinds never read alike. */
function TermsLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 mt-4 text-[11.5px] font-semibold uppercase tracking-wide text-muted">{children}</p>
  );
}

function Pills({
  value, onChange, options,
}: {
  value: Drivetrain;
  onChange: (v: Drivetrain) => void;
  options: { value: Drivetrain; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`pressable rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
            value === o.value
              ? "border-primary bg-primary text-white"
              : "border-line bg-parchment text-ink hover:border-line-strong"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Explains why a panel cannot answer, rather than rendering an empty card. */
function Unavailable({ text }: { text: string }) {
  return (
    <p className="mt-3 rounded-xl bg-line/30 p-3 text-[12.5px] leading-relaxed text-muted">{text}</p>
  );
}

/** Fetch into state while `enabled`, null otherwise.
 *
 *  The `live` flag is not ceremony: every input here is a slider, so dragging
 *  one fires a request per step and a slow early response would otherwise land
 *  after a fast late one and show a figure for a value nobody is looking at.
 */
function useCalc<T>(enabled: boolean, fetcher: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = React.useState<T | null>(null);
  React.useEffect(() => {
    if (!enabled) { setData(null); return; }
    let live = true;
    fetcher().then((d) => live && setData(d)).catch(() => live && setData(null));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);
  return data;
}

export default function CalculatorsPage() {
  const t = useT();
  const [cars, setCars] = React.useState<CalcVehicle[]>([]);

  /* "" = a catalogue car has not been chosen; "custom" = own figures. */
  const [slug, setSlug] = React.useState("");
  const custom = slug === "custom";
  const selected = cars.find((c) => c.slug === slug) ?? null;

  /* Car-owned. Set from the catalogue, or typed in custom mode — never both. */
  const [price, setPrice] = React.useState(150_000);
  const [cc, setCc] = React.useState(1_500);
  const [vtype, setVtype] = React.useState<Drivetrain>("ev");

  /* Buyer-owned. Always adjustable, whichever mode the page is in. */
  const [down, setDown] = React.useState(15_000);
  const [tenure, setTenure] = React.useState(7);
  const [policyYear, setPolicyYear] = React.useState(1);
  const [east, setEast] = React.useState(false);
  const [nonSaloon, setNonSaloon] = React.useState(false);
  const [annualKm, setAnnualKm] = React.useState(15_000);
  const [homeCharge, setHomeCharge] = React.useState(true);

  /* Affordability is its own question and keeps its own drivetrain, because it
     runs before a car exists and the loan rate depends on one. */
  const [budget, setBudget] = React.useState(1_500);
  const [affordType, setAffordType] = React.useState<Drivetrain>("ev");
  const [affordDown, setAffordDown] = React.useState(15_000);
  const [affordTenure, setAffordTenure] = React.useState(7);


  const DRIVETRAINS: { value: Drivetrain; label: string }[] = [
    { value: "ev", label: t("calcs.ev") },
    { value: "hybrid", label: t("calcs.hybrid") },
    { value: "phev", label: t("calcs.phev") },
  ];

  React.useEffect(() => {
    apiService.getCalcVehicles().then((r) => setCars(r.vehicles)).catch(() => setCars([]));
  }, []);

  /* Choosing a car replaces every car-owned figure at once. The deposit is
     re-based to 10% because a deposit carried over from a RM70,000 car is
     meaningless against a RM400,000 one. */
  function chooseCar(next: string) {
    setSlug(next);
    if (next === "custom" || next === "") return;
    const car = cars.find((c) => c.slug === next);
    if (!car) return;
    setPrice(car.price_rm);
    setVtype(car.type);
    setCc(car.engine_cc || 0);
    setDown(Math.round(car.price_rm * 0.1));
  }

  const hasCar = Boolean(selected) || custom;
  /* Road tax for an EV needs the JPJ lookup, which only exists per catalogue
     model — so a custom EV genuinely cannot be answered. */
  const taxAvailable = hasCar && (vtype !== "ev" ? cc > 0 : Boolean(selected));

  const afford = useCalc(true, () => apiService.getAffordability({
    monthly_budget_rm: budget, vehicle_type: affordType,
    tenure_years: affordTenure, down_payment_rm: affordDown,
  }), [budget, affordType, affordTenure, affordDown]);

  const loan = useCalc(hasCar, () => apiService.getLoan({
    price_rm: price, vehicle_type: vtype, down_payment_rm: down, tenure_years: tenure,
  }), [price, vtype, down, tenure]);

  const ins = useCalc(hasCar, () => apiService.getInsurance({
    sum_insured_rm: price, vehicle_type: vtype, engine_cc: cc,
    policy_year: policyYear, east_malaysia: east,
  }), [price, vtype, cc, policyYear, east]);

  const tax = useCalc(taxAvailable, () => apiService.getRoadTax(
    vtype === "ev" ? { slug } : { engine_cc: cc, non_saloon: nonSaloon },
  ), [vtype, slug, cc, nonSaloon]);

  /* The per-model curve only applies when the price is that model's price, so
     custom figures fall back to the drivetrain curve deliberately. */
  const dep = useCalc(hasCar, () => apiService.getDepreciation({
    price_rm: price, vehicle_type: vtype,
    slug: selected ? selected.slug : undefined, years: 5,
  }), [price, vtype, selected]);

  const own = useCalc(Boolean(selected), () => apiService.getOwnership({
    slug: selected!.slug, annual_km: annualKm, can_charge_home: homeCharge,
  }), [selected, annualKm, homeCharge]);

  return (
    <main className="min-h-dvh bg-parchment">
      <Navbar />
      <div className="mx-auto w-full max-w-3xl px-5 pb-24 pt-8">
        <SectionLabel>
          <Calculator className="h-4 w-4" /> {t("calcs.title")}
        </SectionLabel>
        {/* Every other page has an h1; this one had only the eyebrow, which
            left the document with no top-level heading for assistive tech or
            crawlers to anchor on. */}
        <h1 className="apple-display-2 mt-3 text-[28px] leading-snug text-ink sm:text-[32px]">
          {t("calcs.h1")}
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">{t("calcs.lede")}</p>

        {/* ============ 1. affordability — no car; it produces one ============ */}
        <Panel icon={Wallet} title={t("calcs.afford")}>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            <RangeField
              id="calc-budget" label={t("calcs.budget")}
              min={500} max={6_000} step={50} hardMax={200_000}
              value={budget} onChange={setBudget}
              caption={(v) => `RM${v.toLocaleString("en-MY")}`}
            />
            <RangeField
              id="calc-afford-down" label={t("calcs.down")}
              min={0} max={100_000} step={1_000} hardMax={5_000_000}
              value={affordDown} onChange={setAffordDown}
              caption={(v) => `RM${Math.round(v / 1000)}k`}
            />
            <RangeField
              id="calc-afford-tenure" label={t("calcs.tenure")}
              min={1} max={9} step={1} hardMax={9}
              value={affordTenure} onChange={setAffordTenure}
              caption={(v) => `${v}y`}
            />
            <div>
              <span className="mb-2 block text-[12px] font-semibold text-muted">
                {t("calcs.drivetrain")}
              </span>
              <Pills value={affordType} onChange={setAffordType} options={DRIVETRAINS} />
            </div>
          </div>
          {afford && (
            <div className="mt-5">
              <Readout label={t("calcs.maxPrice")} value={rm(afford.max_price_rm)} big />
              <Readout
                label={t("calcs.inRange")}
                value={`${afford.cars_in_range} / ${afford.catalog_total}`}
              />
              {afford.examples.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {afford.examples.slice(0, 4).map((e) => (
                    <button
                      key={e.slug}
                      type="button"
                      onClick={() => {
                        chooseCar(e.slug);
                        document.getElementById("a-specific-car")?.scrollIntoView({ behavior: "smooth" });
                      }}
                      className="pressable rounded-full border border-line bg-parchment px-3 py-1.5 text-[12.5px] font-semibold text-ink hover:border-primary"
                    >
                      {e.label} · {rm(e.price_rm)}
                    </button>
                  ))}
                </div>
              )}
              <Basis text={`${t("calcs.basis")}: ${afford.basis}`} />
            </div>
          )}
        </Panel>

        {/* ============ 2. one specific car ============ */}
        <div id="a-specific-car" className="mt-10 scroll-mt-24">
          <SectionLabel>
            <Car className="h-4 w-4" /> {t("calcs.sectionCar")}
          </SectionLabel>
        </div>

        <Card className="mt-4 p-5">
          <span className="mb-1.5 block text-[12.5px] font-semibold uppercase tracking-wide text-muted">
            {t("calcs.which")}
          </span>
          <select className={selectCls} value={slug} onChange={(e) => chooseCar(e.target.value)}>
            <option value="">{t("calcs.pick")}…</option>
            <option value="custom">{t("calcs.notListed")}</option>
            {cars.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label} — {rm(c.price_rm)}
              </option>
            ))}
          </select>

          {selected && (
            <>
              <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Fact label={t("calcs.price")} value={rm(selected.price_rm)} />
                <Fact label={t("calcs.drivetrain")} value={t(`calcs.${selected.type}` as StrKey)} />
                <Fact
                  label={t("calcs.engine")}
                  value={selected.engine_cc ? `${selected.engine_cc} cc` : t("calcs.electricNoEngine")}
                />
              </div>
              <p className="mt-3 text-[11.5px] leading-relaxed text-muted">{t("calcs.priceLockedNote")}</p>
              <button
                type="button"
                onClick={() => setSlug("custom")}
                className="pressable mt-2 text-[12.5px] font-semibold text-primary hover:underline"
              >
                {t("calcs.useOwn")} →
              </button>
            </>
          )}

          {custom && (
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <RangeField
                id="calc-price" label={t("calcs.price")}
                min={30_000} max={500_000} step={1_000} hardMax={5_000_000}
                value={price} onChange={setPrice}
                caption={(v) => `RM${Math.round(v / 1000)}k`}
              />
              <div>
                <span className="mb-2 block text-[12px] font-semibold text-muted">
                  {t("calcs.drivetrain")}
                </span>
                <Pills value={vtype} onChange={setVtype} options={DRIVETRAINS} />
              </div>
              {vtype !== "ev" && (
                <RangeField
                  id="calc-cc" label={t("calcs.cc")}
                  min={800} max={4_000} step={50} hardMax={10_000}
                  value={cc} onChange={setCc}
                  caption={(v) => `${(v / 1000).toFixed(1)}L`}
                />
              )}
              <div className="self-end">
                <button
                  type="button"
                  onClick={() => setSlug("")}
                  className="pressable text-[12.5px] font-semibold text-primary hover:underline"
                >
                  ← {t("calcs.backToCar")}
                </button>
              </div>
            </div>
          )}
        </Card>

        {/* ---- car loan ---- */}
        <Panel icon={Landmark} title={t("calcs.loan")}>
          {!hasCar ? (
            <Unavailable text={t("calcs.pickFirst")} />
          ) : (
            <>
              <TermsLabel>{t("calcs.yourTerms")}</TermsLabel>
              <div className="grid gap-5 sm:grid-cols-2">
                <RangeField
                  id="calc-down" label={t("calcs.down")}
                  min={0} max={Math.max(price, 1)} step={1_000} hardMax={5_000_000}
                  value={down} onChange={setDown}
                  caption={(v) => `RM${Math.round(v / 1000)}k`}
                />
                <RangeField
                  id="calc-tenure" label={t("calcs.tenure")}
                  min={1} max={9} step={1} hardMax={9}
                  value={tenure} onChange={setTenure}
                  caption={(v) => `${v}y`}
                />
              </div>
              {loan && (
                <div className="mt-5">
                  <Readout label={t("calcs.monthly")} value={`${rm(loan.monthly_rm, 2)}${t("calcs.perMonth")}`} big />
                  <Readout label={t("calcs.totalInterest")} value={rm(loan.total_interest_rm)} />
                  <Readout label={t("calcs.totalPayable")} value={rm(loan.total_payable_rm)} />
                  <Readout label={t("calcs.eir")} value={`${loan.effective_rate_pct}%`} />
                  <p className="mt-3 rounded-xl bg-amber-50 p-3 text-[12px] leading-relaxed text-amber-900">
                    {t("calcs.eirNote")}
                  </p>
                  <Basis text={`${t("calcs.basis")}: ${loan.basis}`} />
                </div>
              )}
            </>
          )}
        </Panel>

        {/* ---- insurance ---- */}
        <Panel icon={ShieldCheck} title={t("calcs.insurance")}>
          {!hasCar ? (
            <Unavailable text={t("calcs.pickFirst")} />
          ) : (
            <>
              <TermsLabel>{t("calcs.yourTerms")}</TermsLabel>
              <div className="grid gap-5 sm:grid-cols-2">
                <RangeField
                  id="calc-ncd" label={t("calcs.policyYear")}
                  min={1} max={6} step={1} hardMax={20}
                  value={policyYear} onChange={setPolicyYear}
                  caption={(v) => `yr ${v}`}
                />
                <label className="flex items-center gap-2 self-end pb-2.5 text-[14px] text-ink">
                  <input type="checkbox" checked={east} onChange={(e) => setEast(e.target.checked)} />
                  {t("calcs.east")}
                </label>
              </div>
              {ins && (
                <div className="mt-5">
                  <Readout label={t("calcs.premium")} value={`${rm(ins.premium_rm, 2)}${t("calcs.perYear")}`} big />
                  <Readout label={t("calcs.ncd")} value={`${ins.ncd_pct}%`} />
                  <Readout label={t("calcs.si")} value={rm(ins.sum_insured_rm)} />
                  <Basis text={`${t("calcs.siNote")} ${t("calcs.basis")}: ${ins.basis}`} />
                </div>
              )}
            </>
          )}
        </Panel>

        {/* ---- road tax ---- */}
        <Panel icon={ReceiptText} title={t("calcs.roadTax")}>
          {!hasCar ? (
            <Unavailable text={t("calcs.pickFirst")} />
          ) : !taxAvailable ? (
            <Unavailable text={t("calcs.needsCcForTax")} />
          ) : (
            <>
              {vtype !== "ev" && (
                <>
                  <TermsLabel>{t("calcs.yourTerms")}</TermsLabel>
                  <label className="flex items-center gap-2 text-[14px] text-ink">
                    <input
                      type="checkbox"
                      checked={nonSaloon}
                      onChange={(e) => setNonSaloon(e.target.checked)}
                    />
                    {t("calcs.nonSaloon")}
                  </label>
                </>
              )}
              {tax && (
                <div className="mt-4">
                  <Readout label={t("calcs.annual")} value={`${rm(tax.road_tax_rm, 2)}${t("calcs.perYear")}`} big />
                  <Basis text={`${t("calcs.basis")}: ${tax.basis}`} />
                </div>
              )}
            </>
          )}
        </Panel>

        {/* ---- depreciation ---- */}
        <Panel icon={TrendingDown} title={t("calcs.depreciation")}>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{t("calcs.depNote")}</p>
          {!hasCar ? (
            <Unavailable text={t("calcs.pickFirst")} />
          ) : (
            dep && (
              <div className="mt-4">
                <Readout label={t("calcs.valueThen")} value={rm(dep.value_rm)} big />
                <Readout label={t("calcs.lost")} value={rm(dep.total_depreciation_rm)} />
                <Readout
                  label={t("calcs.afterYears")}
                  value={`${dep.schedule[dep.schedule.length - 1]?.retained_pct}%`}
                />
                <div className="mt-4 space-y-1.5">
                  {dep.schedule.map((y) => (
                    <Bar key={y.year} label={`Y${y.year}`} pct={y.retained_pct} value={rm(y.value_rm)} />
                  ))}
                </div>
                <Basis
                  text={`${t("calcs.basis")}: ${
                    dep.basis === "measured" ? t("calcs.measured") : t("calcs.typeCurve")
                  }`}
                />
              </div>
            )
          )}
        </Panel>

        {/* ---- five-year total: the summary the rest builds to ---- */}
        <Panel icon={Coins} title={t("calcs.ownership")} className="border-primary/30">
          {!selected ? (
            <Unavailable text={custom ? t("calcs.needsCatalogCar") : t("calcs.pickFirst")} />
          ) : (
            <>
              <TermsLabel>{t("calcs.yourTerms")}</TermsLabel>
              <div className="grid gap-5 sm:grid-cols-2">
                <RangeField
                  id="calc-km" label={t("calcs.annualKm")}
                  min={5_000} max={50_000} step={1_000} hardMax={500_000}
                  value={annualKm} onChange={setAnnualKm}
                  caption={(v) => `${Math.round(v / 1000)}k`}
                />
                <label className="flex items-center gap-2 self-end pb-2.5 text-[14px] text-ink">
                  <input
                    type="checkbox"
                    checked={homeCharge}
                    onChange={(e) => setHomeCharge(e.target.checked)}
                  />
                  {t("calcs.homeCharge")}
                </label>
              </div>
              {own && (
                <div className="mt-5">
                  <Readout label={t("calcs.fiveYearTotal")} value={rm(own.total_rm)} big />
                  <Readout label={t("calcs.monthly")} value={`${rm(own.per_month_rm)}${t("calcs.perMonth")}`} />
                  <Readout label={t("calcs.perKm")} value={rm(own.per_km_rm, 2)} />
                  <Readout label={t("calcs.valueThen")} value={rm(own.resale_value_rm)} />
                  <div className="mt-4 space-y-1.5">
                    {own.lines.map((l) => (
                      <Bar
                        key={l.key}
                        wide
                        label={l.key.replace(/_/g, " ")}
                        pct={l.share * 100}
                        value={rm(l.amount_rm)}
                      />
                    ))}
                  </div>
                  <Basis
                    text={`${t("calcs.basis")}: resale ${own.retained_basis}, servicing ${own.maintenance_basis}. Running cost from the same engine the recommendation uses.`}
                  />
                </div>
              )}
            </>
          )}
        </Panel>
      </div>
      <Footer />
    </main>
  );
}
