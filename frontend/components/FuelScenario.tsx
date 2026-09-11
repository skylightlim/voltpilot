"use client";

import { useEffect, useState } from "react";
import { Fuel, AlertTriangle } from "lucide-react";
import { apiService, type Breakeven, type FuelScenario as Scenario } from "@/lib/api";

/** What the recommendation assumes about petrol, and what happens if it changes.
 *
 *  RON95 is subsidised to RM1.99 under BUDI95 while its market price is RM3.77.
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
  return (
    <p className="text-sm text-slate-700">
      The electric car works out cheaper below{" "}
      <strong className="tabular-nums">{km(b.breakeven_km_per_year ?? 0)}</strong> a year, and the
      hybrid above it. You drive about{" "}
      <strong className="tabular-nums">{km(b.your_km_per_year)}</strong>, so the{" "}
      {b.you_are_past_it ? "hybrid" : "electric car"} suits your mileage.
    </p>
  );
}

export function FuelScenarioPanel({ token }: { token: string }) {
  const [data, setData] = useState<Record<Scenario, Breakeven> | null>(null);
  const [scenario, setScenario] = useState<Scenario>("subsidised");
  const [gone, setGone] = useState(false);
  const [ranks, setRanks] = useState<Record<string, { slug: string; model: string; type: string }[]>>({});

  // The ranking under each scenario, so the panel can show the answer changing
  // rather than only the cost per kilometre changing.
  useEffect(() => {
    let live = true;
    Promise.all(
      (["subsidised", "market"] as Scenario[]).map((s) =>
        apiService
          .getScenario(token, s, 5)
          .then((r) => [s, r.ranking.map((x) => ({ slug: x.slug, model: `${x.brand} ${x.model}`, type: x.type }))] as const)
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
        if (r.available && r.scenarios) setData(r.scenarios);
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
        RON95 costs RM1.99 today because BUDI95 subsidises it. Without that subsidy it would cost
        RM3.77. You will own this car for about five years.
      </p>

      <div className="mt-3 inline-flex rounded-lg border border-amber-300 bg-white p-0.5">
        {(["subsidised", "market"] as Scenario[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setScenario(s)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
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
          {ranks[scenario]?.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-white/70 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Your shortlist {scenario === "market" ? "without the subsidy" : "today"}
              </p>
              <ol className="mt-1.5 space-y-0.5">
                {ranks[scenario].slice(0, 3).map((r, i) => {
                  const other = ranks[scenario === "market" ? "subsidised" : "market"] ?? [];
                  const moved = other[i]?.slug !== r.slug;
                  return (
                    <li key={r.slug} className="flex items-center gap-2 text-sm">
                      <span className="w-4 tabular-nums text-slate-400">{i + 1}</span>
                      <span className={moved ? "font-semibold text-amber-900" : "text-slate-700"}>
                        {r.model}
                      </span>
                      <span className="text-xs uppercase tracking-wide text-slate-400">
                        {r.type}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

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
