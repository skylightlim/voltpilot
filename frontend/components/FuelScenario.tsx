"use client";

import { useEffect, useState } from "react";
import { Fuel, AlertTriangle } from "lucide-react";
import {
  apiService,
  type Breakeven,
  type CostCurvePoint,
  type FuelFacts,
  type FuelScenario as Scenario,
} from "@/lib/api";
import { CostByMileage, RankShift, type RankedCar } from "@/components/charts/SubsidyCharts";

/** What the recommendation assumes about petrol, and what happens if it changes.
 *
 *  RON95 is subsidised to RM1.99 under BUDI95, up to 300 litres a month, while
 *  its market price is about RM3.87 (both live from data/fuel.json now).
 *  At the pump price an efficient hybrid costs about RM7.16 per 100 km against
 *  a small EV's RM8.44, so the EV is dearer to run; at the market price the
 *  hybrid costs RM13.57 and the ordering reverses. The ranking presents this as
 *  a property of the cars when it is a policy decision, and a five-year
 *  ownership period is long enough for that policy to change. FEATURES.md P3
 *  and P4. */

const rm2 = (n: number) => `RM${n.toFixed(2)}`;
const km = (n: number) => `${Math.round(n).toLocaleString("en-MY")} km`;

function Verdict({ b }: { b: Breakeven }) {
  if (b.verdict === "ev_always") {
    return (
      <p className="text-sm text-slate-700">
        Counting everything, the electric car still works out cheaper at any mileage you are
        likely to drive: what it saves on price and servicing outweighs what it costs to run.
        {b.note && <span className="text-slate-500"> The two are {b.note.replace(/^the two are /, "")}.</span>}
      </p>
    );
  }
  if (b.verdict === "hybrid_always") {
    return (
      <p className="text-sm text-slate-700">
        Counting everything, the hybrid stays cheaper at any mileage you are likely to drive.
        {b.note && <span className="text-slate-500"> The two are {b.note.replace(/^the two are /, "")}.</span>}
      </p>
    );
  }
  // Usually the EV is cheaper at low mileage and the hybrid's cheaper petrol
  // catches up. Past the BUDI95 quota the hybrid's petrol jumps to market
  // price, so the reverse order is real too; the engine says which it is.
  const low = b.cheaper_below === "hybrid" ? "hybrid" : "electric car";
  const high = low === "hybrid" ? "electric car" : "hybrid";
  return (
    <p className="text-sm text-slate-700">
      The {low} works out cheaper below{" "}
      <strong className="tabular-nums">{km(b.breakeven_km_per_year ?? 0)}</strong> a year, and the{" "}
      {high} above it. You drive about{" "}
      <strong className="tabular-nums">{km(b.your_km_per_year)}</strong>, so the{" "}
      {b.you_are_past_it ? high : low} suits your mileage.
    </p>
  );
}

const carName = (c: RankedCar) => `${c.brand} ${c.model}`;

/** One sentence on what the subsidy ending does to this shortlist, so a list
 *  that does not move says why instead of looking broken. */
function shiftSummary(today: RankedCar[], ended: RankedCar[]): string {
  const rankIn = (list: RankedCar[], slug: string) => list.find((c) => c.slug === slug)?.rank;
  const sameTop = today.slice(0, 3).every((c, i) => ended[i]?.slug === c.slug);
  const hybrid = today.find((c) => c.type !== "ev");
  const hybridMove = hybrid && rankIn(ended, hybrid.slug) !== hybrid.rank
    ? `${carName(hybrid)}, your best hybrid, goes from #${hybrid.rank} to #${rankIn(ended, hybrid.slug)}.`
    : "";
  if (sameTop) {
    const allEv = today.slice(0, 3).every((c) => c.type === "ev");
    return `Your top three stay the same either way${
      allEv ? ": they are all electric, so the price of petrol does not touch them" : ""
    }. ${hybridMove}`.trim();
  }
  const newTop = ended[0];
  const lead = newTop.slug !== today[0].slug
    ? `Without the subsidy, ${carName(newTop)} moves up to #1 from #${rankIn(today, newTop.slug)}.`
    : "Without the subsidy, the order below #1 changes.";
  return `${lead} ${hybridMove}`.trim();
}

export function FuelScenarioPanel({ token }: { token: string }) {
  const [data, setData] = useState<Record<Scenario, Breakeven> | null>(null);
  const [scenario, setScenario] = useState<Scenario>("subsidised");
  const [gone, setGone] = useState(false);
  const [fuel, setFuel] = useState<FuelFacts | null>(null);
  const [ranks, setRanks] = useState<Partial<Record<Scenario, RankedCar[]>>>({});
  const [curve, setCurve] = useState<CostCurvePoint[] | null>(null);
  const [names, setNames] = useState<{ ev: string; hybrid: string } | null>(null);

  // The whole ranking under each scenario. It used to fetch the top five and
  // show the top three, which for a buyer whose top three are all EVs is the
  // same list either way: the toggle looked broken while hybrids further down
  // fell several places. The slope chart needs every car's rank on both sides.
  useEffect(() => {
    let live = true;
    Promise.all(
      (["subsidised", "market"] as Scenario[]).map((s) =>
        apiService
          .getScenario(token, s, 100)
          .then((r) => [s, r.ranking.map((x) => ({ slug: x.slug, brand: x.brand, model: x.model, type: x.type, rank: x.rank }))] as const)
          .catch(() => [s, []] as const),
      ),
    ).then((pairs) => live && setRanks(Object.fromEntries(pairs)));
    return () => {
      live = false;
    };
  }, [token]);

  useEffect(() => {
    let live = true;
    apiService
      .getBreakeven(token)
      .then((r) => {
        if (!live) return;
        if (r.available && r.scenarios) {
          setData(r.scenarios);
          setFuel(r.fuel ?? null);
          setCurve(r.curve ?? null);
          setNames(r.names ?? null);
        }
        else setGone(true);
      })
      .catch(() => live && setGone(true));
    return () => {
      live = false;
    };
  }, [token]);

  if (gone) return null;
  const current = data?.[scenario];

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <Fuel className="h-4.5 w-4.5 text-amber-600" />
        Your answer depends on a fuel subsidy
      </h2>
      <p className="mt-1 text-sm text-slate-700">
        RON95 costs {rm2(fuel?.ron95_rm_per_l ?? 1.99)} today because BUDI95 subsidises it. Without
        that subsidy it would cost {rm2(fuel?.ron95_market_rm_per_l ?? 3.87)}. You will own this car
        for about five years.
      </p>
      {fuel?.quota_l_month ? (
        <p className="mt-1.5 text-sm text-slate-700">
          The subsidy covers{" "}
          <strong className="tabular-nums">{Math.round(fuel.quota_l_month)} litres</strong> a month.
          The hybrid on your shortlist would use about{" "}
          <strong className="tabular-nums">{Math.round(fuel.hybrid_litres_month)} litres</strong> at
          your mileage
          {fuel.hybrid_litres_month > fuel.quota_l_month
            ? `, so the rest is priced at ${rm2(fuel.ron95_market_rm_per_l)} a litre, and that is already in its cost.`
            : ", inside the quota."}
        </p>
      ) : null}

      {/* Track and thumb are both fully round with a 4px inset, so the thumb
          sits concentric in the pill. In this theme rounded-lg is 24px (a pill
          at this height) and rounded-md 8px, which left a squared thumb jammed
          against a round track with 2px to spare. */}
      <div className="mt-3 inline-flex gap-0.5 rounded-full border border-amber-300 bg-white p-1">
        {(["subsidised", "market"] as Scenario[]).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={scenario === s}
            onClick={() => setScenario(s)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
              scenario === s ? "bg-amber-500 text-white" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {s === "subsidised" ? "RON95 at RM1.99" : "If the subsidy ends"}
          </button>
        ))}
      </div>

      {!data ? (
        <div className="mt-3 h-12 animate-pulse rounded-lg bg-amber-100/70" />
      ) : current ? (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm tabular-nums">
            <span className="text-slate-600">
              Running cost, electric{" "}
              <strong className="text-slate-900">{rm2(current.ev_rm_per_100km)}</strong> /100 km
            </span>
            <span className="text-slate-600">
              hybrid{" "}
              <strong className="text-slate-900">{rm2(current.hybrid_rm_per_100km)}</strong> /100 km
            </span>
          </div>
          <Verdict b={current} />
          {curve && names && (
            <CostByMileage
              curve={curve}
              names={names}
              yourKm={current.your_km_per_year}
              scenario={scenario}
              breakevenKm={current.breakeven_km_per_year}
            />
          )}

          {ranks.subsidised?.length && ranks.market?.length ? (
            <>
              <p className="mt-2 text-sm text-slate-700">{shiftSummary(ranks.subsidised, ranks.market)}</p>
              <RankShift today={ranks.subsidised} ended={ranks.market} scenario={scenario} />
            </>
          ) : null}

          {scenario === "market" && (
            <p className="flex items-start gap-1.5 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              This is a what-if, not a forecast. It reprices petrol only, and leaves every other
              figure alone.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
