"use client";

import { useEffect, useState } from "react";
import { Receipt, ExternalLink } from "lucide-react";
import { apiService, type ResaleEvidence as Evidence } from "@/lib/api";

/** The real used listings behind a car's resale figure.
 *
 *  Resale retention is a scored criterion, so this number already moves the
 *  ranking. The platform holds 14,164 scraped listings and has never shown a
 *  user one of them. Showing them turns an assertion into evidence, and makes
 *  the coverage honest: only 22 of 184 trims are fitted from their own
 *  listings, and the rest carry their drivetrain's average. FEATURES.md P2. */

const rm = (n: number) => `RM${Math.round(n).toLocaleString("en-MY")}`;

export function ResaleEvidencePanel({ token, slug }: { token: string; slug: string }) {
  const [data, setData] = useState<Evidence | null>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    let live = true;
    setData(null);
    setGone(false);
    apiService
      .getEvidence(token, slug)
      .then((r) => live && setData(r))
      .catch(() => live && setGone(true));
    return () => {
      live = false;
    };
  }, [token, slug]);

  if (gone) return null;
  if (!data) return <div className="h-20 animate-pulse rounded-xl bg-slate-100" />;

  const measured = data.basis === "measured";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Receipt className="h-4 w-4 text-slate-400" />
        What it should still be worth
      </h3>

      <p className="mt-1 text-sm text-slate-700">
        About <strong className="tabular-nums">{data.retained_5yr_pct}%</strong> of{" "}
        {rm(data.price_rm)} after five years, which is{" "}
        <strong className="tabular-nums">
          {rm((data.price_rm * data.retained_5yr_pct) / 100)}
        </strong>
        .
      </p>

      <p className="mt-1 text-xs text-slate-500">
        {measured ? (
          <>Fitted from {data.total_listings} real listings of this model.</>
        ) : (
          <>
            Estimated from how this drivetrain holds value across the market. There are not enough
            listings of this model on its own yet.
          </>
        )}
      </p>

      {data.by_age.length > 0 && (
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-slate-400">
              <th className="pb-1 font-medium">Year</th>
              <th className="pb-1 font-medium">Listed</th>
              <th className="pb-1 text-right font-medium">Asking</th>
            </tr>
          </thead>
          <tbody className="text-slate-700">
            {data.by_age.slice(0, 5).map((a) => (
              <tr key={a.year} className="border-t border-slate-100">
                <td className="py-1 tabular-nums">{a.year}</td>
                <td className="py-1 tabular-nums text-slate-500">{a.count}</td>
                <td className="py-1 text-right tabular-nums">{rm(a.avg_price_rm)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {data.listings.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-slate-100 pt-2">
          {data.listings.slice(0, 3).map((l) => (
            <li key={l.url} className="flex items-baseline justify-between gap-3 text-xs">
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-w-0 items-center gap-1 truncate text-slate-600 hover:text-slate-900"
              >
                <span className="truncate">{l.title}</span>
                <ExternalLink className="h-3 w-3 shrink-0 text-slate-300" />
              </a>
              <span className="shrink-0 tabular-nums text-slate-900">{rm(l.price_rm)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
