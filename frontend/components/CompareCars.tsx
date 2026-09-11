"use client";

import { useEffect, useState } from "react";
import { GitCompareArrows } from "lucide-react";
import { apiService, type ComparedCar } from "@/lib/api";

/** Two cars held against each other, which is how the decision is made.
 *
 *  The product asks a binary question and answers it with a ranked list of 184.
 *  Nothing in the interface let a buyer put two candidates side by side.
 *  FEATURES.md P5. */

const rm = (n: number) => `RM${Math.round(n).toLocaleString("en-MY")}`;

const CRITERION: Record<string, { label: string; lowerIsBetter: boolean; fmt: (n: number) => string }> = {
  total_cost_10yr_rm: { label: "Total cost, 10-year basis", lowerIsBetter: true, fmt: rm },
  resale_retained_pct: { label: "Holds value", lowerIsBetter: false, fmt: (n) => `${n.toFixed(0)}%` },
  behaviour_score: { label: "Fits your driving", lowerIsBetter: false, fmt: (n) => n.toFixed(0) },
  infrastructure_score: { label: "Refuelling access", lowerIsBetter: false, fmt: (n) => n.toFixed(0) },
  co2_kg_yr: { label: "CO2 a year", lowerIsBetter: true, fmt: (n) => `${Math.round(n)} kg` },
};

function Row({ label, a, b, better }: { label: string; a: string; b: string; better: 0 | 1 | null }) {
  const cell = (text: string, mine: 0 | 1) =>
    better === mine ? (
      <span className="font-semibold text-emerald-700">{text}</span>
    ) : (
      <span className="text-slate-700">{text}</span>
    );
  return (
    <tr className="border-t border-slate-100">
      <td className="py-2 pr-2 text-sm text-slate-500">{label}</td>
      <td className="py-2 text-right text-sm tabular-nums">{cell(a, 0)}</td>
      <td className="py-2 pl-4 text-right text-sm tabular-nums">{cell(b, 1)}</td>
    </tr>
  );
}

export function CompareCars({
  token,
  options,
}: {
  token: string;
  options: { slug: string; label: string; type: string }[];
}) {
  const evDefault = options.find((o) => o.type === "ev")?.slug ?? options[0]?.slug;
  const hyDefault =
    options.find((o) => o.type !== "ev" && o.slug !== evDefault)?.slug ?? options[1]?.slug;

  const [a, setA] = useState(evDefault);
  const [b, setB] = useState(hyDefault);
  const [cars, setCars] = useState<ComparedCar[] | null>(null);

  useEffect(() => {
    if (!a || !b || a === b) return;
    let live = true;
    setCars(null);
    apiService
      .getCompare(token, a, b)
      .then((r) => live && setCars(r.cars))
      .catch(() => live && setCars(null));
    return () => {
      live = false;
    };
  }, [token, a, b]);

  if (options.length < 2 || !a || !b) return null;
  const [x, y] = cars ?? [];

  const picker = (value: string, onChange: (v: string) => void, exclude: string) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
    >
      {options
        .filter((o) => o.slug !== exclude)
        .map((o) => (
          <option key={o.slug} value={o.slug}>
            {o.label}
          </option>
        ))}
    </select>
  );

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <GitCompareArrows className="h-4.5 w-4.5 text-slate-400" />
        Put two of them side by side
      </h2>

      <div className="mt-3 grid grid-cols-2 gap-3">
        {picker(a, setA, b)}
        {picker(b, setB, a)}
      </div>

      {!cars ? (
        <div className="mt-3 h-40 animate-pulse rounded-lg bg-slate-100" />
      ) : x && y ? (
        <table className="mt-3 w-full">
          <tbody>
            <Row
              label="Five-year cost, all in"
              a={rm(x.costs.total_rm)}
              b={rm(y.costs.total_rm)}
              better={x.costs.total_rm < y.costs.total_rm ? 0 : 1}
            />
            <Row
              label="Price now"
              a={rm(x.price_rm)}
              b={rm(y.price_rm)}
              better={x.price_rm < y.price_rm ? 0 : 1}
            />
            <Row
              label="Value lost in 5 years"
              a={rm(x.costs.lines.find((l) => l.key === "depreciation")?.amount_rm ?? 0)}
              b={rm(y.costs.lines.find((l) => l.key === "depreciation")?.amount_rm ?? 0)}
              better={
                (x.costs.lines.find((l) => l.key === "depreciation")?.amount_rm ?? 0) <
                (y.costs.lines.find((l) => l.key === "depreciation")?.amount_rm ?? 0)
                  ? 0
                  : 1
              }
            />
            {Object.entries(CRITERION).map(([key, meta]) => {
              const av = x.criteria[key];
              const bv = y.criteria[key];
              if (av == null || bv == null) return null;
              const aWins = meta.lowerIsBetter ? av < bv : av > bv;
              return (
                <Row
                  key={key}
                  label={meta.label}
                  a={meta.fmt(av)}
                  b={meta.fmt(bv)}
                  better={av === bv ? null : aWins ? 0 : 1}
                />
              );
            })}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
