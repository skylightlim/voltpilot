"use client";

import { useEffect, useState } from "react";
import { TrendingDown, Info } from "lucide-react";
import { apiService, type CarCosts, type CostLine } from "@/lib/api";

/** Five-year cost of ownership, itemised, largest line first.
 *
 *  The engine has always computed these components and the results page has
 *  never rendered one, so a reader could reasonably conclude that fuel is what
 *  separates an EV from a hybrid. It is not. Depreciation is 60 to 75 percent
 *  of the five-year cost, and at RON95's subsidised RM1.99 the energy gap
 *  between a small EV and an efficient hybrid is about RM60 across five years,
 *  against a depreciation gap of RM10,906. See FEATURES.md P1.
 *
 *  Five years rather than ten because that is where the resale data ends and
 *  where Malaysia's four-to-six year replacement rate sits. */

const LABEL: Record<string, string> = {
  depreciation: "Value lost",
  loan_interest: "Loan interest",
  insurance: "Insurance",
  energy: "Fuel or charging",
  maintenance: "Servicing",
  road_tax: "Road tax",
  opportunity_cost: "Deposit tied up",
};

const TINT: Record<string, string> = {
  depreciation: "bg-rose-500",
  loan_interest: "bg-amber-500",
  insurance: "bg-sky-500",
  energy: "bg-emerald-500",
  maintenance: "bg-violet-500",
  road_tax: "bg-slate-400",
  opportunity_cost: "bg-slate-300",
};

const rm = (n: number) => `RM${Math.round(n).toLocaleString("en-MY")}`;

function Bar({ lines }: { lines: CostLine[] }) {
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
      {lines.map((l) => (
        <div
          key={l.key}
          className={TINT[l.key] ?? "bg-slate-300"}
          style={{ width: `${Math.max(l.share * 100, 0.5)}%` }}
          title={`${LABEL[l.key] ?? l.key}: ${rm(l.amount_rm)}`}
        />
      ))}
    </div>
  );
}

function Car({ car }: { car: CarCosts }) {
  const [open, setOpen] = useState(false);
  const energy = car.lines.find((l) => l.key === "energy");
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="font-semibold text-slate-900">
            {car.brand} {car.model}
          </span>
          <span className="ml-2 text-xs uppercase tracking-wide text-slate-500">{car.type}</span>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold tabular-nums text-slate-900">{rm(car.total_rm)}</div>
          <div className="text-xs text-slate-500">over {car.years} years</div>
        </div>
      </div>

      <div className="mt-3">
        <Bar lines={car.lines} />
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-3 text-xs font-medium text-slate-600 underline underline-offset-2 hover:text-slate-900"
      >
        {open ? "Hide the breakdown" : "Where does that go?"}
      </button>

      {open && (
        <dl className="mt-3 space-y-1.5">
          {car.lines.map((l) => (
            <div key={l.key} className="flex items-center justify-between gap-3 text-sm">
              <dt className="flex items-center gap-2 text-slate-600">
                <span className={`h-2 w-2 rounded-full ${TINT[l.key] ?? "bg-slate-300"}`} />
                {LABEL[l.key] ?? l.key}
              </dt>
              <dd className="tabular-nums text-slate-900">
                {rm(l.amount_rm)}
                <span className="ml-2 text-xs text-slate-400">{Math.round(l.share * 100)}%</span>
              </dd>
            </div>
          ))}
          <div className="flex justify-between border-t border-slate-100 pt-2 text-sm">
            <dt className="text-slate-600">Still worth after {car.years} years</dt>
            <dd className="tabular-nums text-slate-900">
              {rm(car.resale_value_rm)}
              <span className="ml-2 text-xs text-slate-400">
                {car.retained_pct}%
                {car.retained_basis !== "measured" && " (estimated)"}
              </span>
            </dd>
          </div>
        </dl>
      )}

      {energy && energy.share < 0.12 && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-500">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          Fuel or charging is only {Math.round(energy.share * 100)}% of what this car costs you.
        </p>
      )}
    </div>
  );
}

export function CostBreakdown({ token }: { token: string }) {
  const [cars, setCars] = useState<CarCosts[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    apiService
      .getCosts(token, 5)
      .then((r) => live && setCars(r.cars))
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [token]);

  if (error || (cars && cars.length === 0)) return null;

  return (
    <section className="space-y-3">
      <header>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <TrendingDown className="h-5 w-5 text-rose-500" />
          What each one actually costs you
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Five years of ownership, every ringgit accounted for. The largest cost of running a car in
          Malaysia is not fuel, it is the value the car loses while you own it.
        </p>
      </header>

      {!cars ? (
        <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
      ) : (
        <div className="space-y-3">
          {cars.map((c) => (
            <Car key={c.slug} car={c} />
          ))}
        </div>
      )}
    </section>
  );
}
