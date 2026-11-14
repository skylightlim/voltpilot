"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { CostCurvePoint, FuelScenario } from "@/lib/api";

/* The fuel-subsidy panel's two figures (components/FuelScenario.tsx).

   CostByMileage: five-year cost of the best EV and the best hybrid at every
   annual mileage, with the hybrid drawn twice, at RM1.99 (solid) and at the
   unsubsidised price (dashed). The subsidy is the gap between the two hybrid
   lines; the BUDI95 quota is the bend in the solid one; "You" marks the buyer.

   RankShift: a slope chart of the shortlist, today's rank on the left and the
   no-subsidy rank on the right. It replaced a top-three list that stayed
   identical whenever the top three were all EVs, which read as a broken toggle.

   Colours are validated (dataviz validate_palette.js, light, on the panel's
   #fbf8ec, all pairs): worst CVD ΔE 9.4. They follow the drivetrain, never the
   rank. Text stays in ink tokens; colour only marks lines and dots. */

export const SERIES = {
  ev: "#0a8f5e",
  hybrid: "#c45a0c",
  phev: "#5a4fe0",
} as const;

const SURFACE = "#fbf8ec";
const GRID = "#e6e0cc";
const INK = "#15221c";
const MUTED = "#5c6b62";

const rmK = (n: number) => `RM${Math.round(n / 1000)}k`;
const rm = (n: number) => `RM${Math.round(n).toLocaleString("en-MY")}`;
const kmK = (n: number) => (n === 0 ? "0" : `${Math.round(n / 1000)}k`);

/** Width of an element, tracked, so the SVG draws at its real pixel size and
 *  type stays the same size on a phone and a desktop. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    setWidth(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function niceStep(span: number) {
  const raw = span / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const unit = [1, 2, 2.5, 5, 10].find((m) => m * pow >= raw) ?? 10;
  return unit * pow;
}

type Series = { key: "ev_rm" | "hybrid_subsidised_rm" | "hybrid_market_rm"; label: string; name: string; color: string; dashed?: boolean };

export function CostByMileage({
  curve,
  names,
  yourKm,
  scenario,
  breakevenKm,
}: {
  curve: CostCurvePoint[];
  names: { ev: string; hybrid: string };
  yourKm: number;
  scenario: FuelScenario;
  breakevenKm: number | null;
}) {
  const [wrap, width] = useWidth<HTMLDivElement>();
  const [idx, setIdx] = useState<number | null>(null);

  const series: Series[] = [
    { key: "ev_rm", label: "Electric", name: names.ev, color: SERIES.ev },
    { key: "hybrid_subsidised_rm", label: "Hybrid at RM1.99", name: names.hybrid, color: SERIES.hybrid },
    { key: "hybrid_market_rm", label: "Hybrid, no subsidy", name: names.hybrid, color: SERIES.hybrid, dashed: true },
  ];
  const active = scenario === "market" ? "hybrid_market_rm" : "hybrid_subsidised_rm";

  const H = 220;
  const m = { l: 48, r: 12, t: 16, b: 30 };
  const W = Math.max(width, 260);
  const pw = W - m.l - m.r;
  const ph = H - m.t - m.b;

  const maxKm = curve[curve.length - 1]?.km ?? 1;
  const values = curve.flatMap((p) => series.map((s) => p[s.key]));
  const step = niceStep(Math.max(...values) - Math.min(...values) || 1);
  const lo = Math.floor(Math.min(...values) / step) * step;
  const hi = Math.ceil(Math.max(...values) / step) * step;
  const x = (km: number) => m.l + (km / maxKm) * pw;
  const y = (v: number) => m.t + ph - ((v - lo) / (hi - lo || 1)) * ph;
  const yTicks: number[] = [];
  for (let v = lo; v <= hi + 1; v += step) yTicks.push(v);
  const xStep = niceStep(maxKm);
  const xTicks: number[] = [];
  for (let k = 0; k <= maxKm + 1; k += xStep) xTicks.push(k);

  const path = (key: Series["key"]) =>
    curve.map((p, i) => `${i ? "L" : "M"}${x(p.km).toFixed(1)},${y(p[key]).toFixed(1)}`).join("");

  const nearest = (px: number) => {
    const km = ((px - m.l) / pw) * maxKm;
    let best = 0;
    curve.forEach((p, i) => {
      if (Math.abs(p.km - km) < Math.abs(curve[best].km - km)) best = i;
    });
    return best;
  };
  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setIdx(nearest(e.clientX - r.left + m.l));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const start = idx ?? nearest(x(yourKm));
    setIdx(Math.min(curve.length - 1, Math.max(0, start + (e.key === "ArrowRight" ? 1 : -1))));
  };

  const hover = idx != null ? curve[idx] : null;
  const yourInRange = yourKm > 0 && yourKm <= maxKm;
  const crossing = breakevenKm != null && breakevenKm <= maxKm ? breakevenKm : null;
  // y of the active hybrid line at the crossing, by interpolation
  const crossingY = (() => {
    if (crossing == null) return null;
    const i = curve.findIndex((p) => p.km >= crossing);
    if (i <= 0) return null;
    const a = curve[i - 1], b = curve[i];
    const t = (crossing - a.km) / (b.km - a.km || 1);
    return y(a[active] + t * (b[active] - a[active]));
  })();

  return (
    <figure className="mt-3">
      <figcaption className="text-sm font-medium text-slate-900">
        Five-year cost at every mileage
      </figcaption>
      {/* legend: line keys, the active hybrid line first in weight */}
      <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {series.map((s) => (
          <li key={s.key} className={`flex items-center gap-1.5 ${s.key !== "ev_rm" && s.key !== active ? "opacity-60" : ""}`}>
            <svg width="18" height="6" aria-hidden="true">
              <line x1="1" y1="3" x2="17" y2="3" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeDasharray={s.dashed ? "4 3" : undefined} />
            </svg>
            {s.label}
            <span className="text-slate-400">· {s.name}</span>
          </li>
        ))}
      </ul>

      <div
        ref={wrap}
        className="relative mt-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        tabIndex={0}
        role="img"
        aria-label={`Five-year cost against yearly mileage up to ${kmK(maxKm)} km: ${names.ev} electric, and ${names.hybrid} with and without the RON95 subsidy. Use the arrow keys to read values.`}
        onKeyDown={onKey}
        onBlur={() => setIdx(null)}
      >
        {width > 0 && (
          <svg width={W} height={H} className="block select-none" aria-hidden="true">
            {yTicks.map((v) => (
              <g key={v}>
                <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth="1" />
                <text x={m.l - 6} y={y(v)} dy="0.32em" textAnchor="end" fontSize="11" fill={MUTED} style={{ fontVariantNumeric: "tabular-nums" }}>
                  {rmK(v)}
                </text>
              </g>
            ))}
            {xTicks.map((k) => (
              <text key={k} x={x(k)} y={H - m.b + 16} textAnchor="middle" fontSize="11" fill={MUTED} style={{ fontVariantNumeric: "tabular-nums" }}>
                {kmK(k)}
              </text>
            ))}
            <text x={W - m.r} y={H - 2} textAnchor="end" fontSize="10.5" fill={MUTED}>
              km a year
            </text>

            {yourInRange && (
              <g>
                <line x1={x(yourKm)} x2={x(yourKm)} y1={m.t} y2={m.t + ph} stroke={INK} strokeOpacity="0.35" strokeWidth="1" />
                <text x={x(yourKm)} y={m.t - 4} textAnchor="middle" fontSize="10.5" fontWeight="600" fill={INK}>
                  You
                </text>
              </g>
            )}

            {series.map((s) => (
              <path
                key={s.key}
                d={path(s.key)}
                fill="none"
                stroke={s.color}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeDasharray={s.dashed ? "5 4" : undefined}
                strokeOpacity={s.key === "ev_rm" || s.key === active ? 1 : 0.35}
                className="motion-safe:transition-[stroke-opacity] motion-safe:duration-300"
              />
            ))}

            {crossing != null && crossingY != null && (
              <circle cx={x(crossing)} cy={crossingY} r="4.5" fill={INK} stroke={SURFACE} strokeWidth="2" />
            )}

            {hover && (
              <g>
                <line x1={x(hover.km)} x2={x(hover.km)} y1={m.t} y2={m.t + ph} stroke={INK} strokeOpacity="0.5" strokeWidth="1" />
                {series.map((s) => (
                  <circle key={s.key} cx={x(hover.km)} cy={y(hover[s.key])} r="4" fill={s.color} stroke={SURFACE} strokeWidth="2" />
                ))}
              </g>
            )}

            <rect
              x={m.l}
              y={m.t}
              width={pw}
              height={ph}
              fill="transparent"
              onPointerMove={onMove}
              onPointerDown={onMove}
              onPointerLeave={() => setIdx(null)}
            />
          </svg>
        )}

        {hover && (
          <div
            className="pointer-events-none absolute top-1 z-10 w-max max-w-[220px] rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-sm"
            style={x(hover.km) > W / 2 ? { right: W - x(hover.km) + 10 } : { left: x(hover.km) + 10 }}
          >
            <p className="font-medium text-slate-500">{Math.round(hover.km).toLocaleString("en-MY")} km a year</p>
            {series.map((s) => (
              <p key={s.key} className="mt-1 flex items-center gap-1.5">
                <svg width="12" height="6" aria-hidden="true">
                  <line x1="1" y1="3" x2="11" y2="3" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeDasharray={s.dashed ? "3 2" : undefined} />
                </svg>
                <span className="font-semibold tabular-nums text-slate-900">{rm(hover[s.key])}</span>
                <span className="text-slate-500">{s.label}</span>
              </p>
            ))}
          </div>
        )}
      </div>

      <p className="mt-1 text-xs text-slate-500">
        The gap between the two orange lines is what the subsidy is worth to you over five years
        {crossing != null ? "; the dot is where the cheaper car changes" : ""}.
      </p>

      <details className="mt-1 text-xs text-slate-600">
        <summary className="cursor-pointer underline underline-offset-2">Show the numbers</summary>
        <table className="mt-2 w-full tabular-nums">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-1 font-medium">km a year</th>
              {series.map((s) => (
                <th key={s.key} className="py-1 text-right font-medium">{s.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {curve.filter((_, i) => i % 2 === 0).map((p) => (
              <tr key={p.km} className="border-t border-slate-100">
                <td className="py-1">{Math.round(p.km).toLocaleString("en-MY")}</td>
                {series.map((s) => (
                  <td key={s.key} className="py-1 text-right">{rm(p[s.key])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

export type RankedCar = { slug: string; brand: string; model: string; type: string; rank: number };

const shortName = (c: RankedCar) => {
  const full = `${c.brand} ${c.model}`;
  return full.length > 17 ? c.model : full;
};

const TYPE_LABEL: Record<string, string> = { ev: "Electric", hybrid: "Hybrid", phev: "Plug-in hybrid" };

export function RankShift({
  today,
  ended,
  scenario,
}: {
  today: RankedCar[];
  ended: RankedCar[];
  scenario: FuelScenario;
}) {
  const [wrap, width] = useWidth<HTMLDivElement>();
  const [focus, setFocus] = useState<string | null>(null);

  const endedRank = new Map(ended.map((c) => [c.slug, c.rank]));
  const todayRank = new Map(today.map((c) => [c.slug, c.rank]));
  // Cars in either top five, plus today's best hybrid wherever it lands: when
  // the top five are all EVs, the hybrid is the car the subsidy moves.
  const pick = new Map<string, RankedCar>();
  for (const c of [...today.slice(0, 5), ...ended.slice(0, 5)]) pick.set(c.slug, c);
  const bestHybrid = today.find((c) => c.type !== "ev");
  if (bestHybrid) pick.set(bestHybrid.slug, bestHybrid);
  const rows = [...pick.values()]
    .map((c) => ({ ...c, a: todayRank.get(c.slug) ?? 99, b: endedRank.get(c.slug) ?? 99 }))
    .sort((p, q) => p.a - q.a)
    .slice(0, 9);
  const leftOrder = rows.map((r) => r.slug);
  const rightOrder = [...rows].sort((p, q) => p.b - q.b).map((r) => r.slug);

  const rowH = 26;
  const top = 30;
  const H = top + rows.length * rowH + 4;
  const W = Math.max(width, 280);
  const gap = Math.min(110, Math.max(56, W * 0.22));
  const lx = (W - gap) / 2; // left line end
  const rx = (W + gap) / 2; // right line end
  const yAt = (i: number) => top + i * rowH + rowH / 2;
  const types = [...new Set(rows.map((r) => r.type))];

  return (
    <figure className="mt-4">
      <figcaption className="text-sm font-medium text-slate-900">Where your cars rank</figcaption>
      <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {types.map((t) => (
          <li key={t} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: SERIES[t as keyof typeof SERIES] ?? MUTED }} />
            {TYPE_LABEL[t] ?? t}
          </li>
        ))}
      </ul>
      <div ref={wrap} className="mt-2">
        {width > 0 && (
          <svg width={W} height={H} className="block" role="list" aria-label="Rank of each car today and if the RON95 subsidy ends">
            <text x={lx - 8} y={14} textAnchor="end" fontSize="11" fontWeight={scenario === "subsidised" ? 700 : 500} fill={scenario === "subsidised" ? INK : MUTED}>
              RON95 at RM1.99
            </text>
            <text x={rx + 8} y={14} textAnchor="start" fontSize="11" fontWeight={scenario === "market" ? 700 : 500} fill={scenario === "market" ? INK : MUTED}>
              If the subsidy ends
            </text>
            {rows.map((r) => {
              const y1 = yAt(leftOrder.indexOf(r.slug));
              const y2 = yAt(rightOrder.indexOf(r.slug));
              const color = SERIES[r.type as keyof typeof SERIES] ?? MUTED;
              const dim = focus != null && focus !== r.slug;
              const moved = r.a !== r.b;
              const label = `${shortName(r)}: number ${r.a} today, number ${r.b} if the subsidy ends`;
              return (
                <g
                  key={r.slug}
                  role="listitem"
                  aria-label={label}
                  tabIndex={0}
                  onPointerEnter={() => setFocus(r.slug)}
                  onPointerLeave={() => setFocus(null)}
                  onFocus={() => setFocus(r.slug)}
                  onBlur={() => setFocus(null)}
                  style={{ opacity: dim ? 0.25 : 1, outline: "none" }}
                  className="motion-safe:transition-opacity motion-safe:duration-200"
                >
                  {/* generous hit area: the whole row on both sides */}
                  <rect x={0} y={Math.min(y1, y2) - rowH / 2} width={W} height={Math.abs(y2 - y1) + rowH} fill="transparent" />
                  <line x1={lx} y1={y1} x2={rx} y2={y2} stroke={color} strokeWidth="2" strokeLinecap="round" />
                  <circle cx={lx} cy={y1} r="4" fill={color} stroke={SURFACE} strokeWidth="2" />
                  <circle cx={rx} cy={y2} r="4" fill={color} stroke={SURFACE} strokeWidth="2" />
                  <text x={lx - 10} y={y1} dy="0.32em" textAnchor="end" fontSize="12" fill={INK}>
                    <tspan fill={MUTED} style={{ fontVariantNumeric: "tabular-nums" }}>#{r.a} </tspan>
                    {shortName(r)}
                  </text>
                  <text x={rx + 10} y={y2} dy="0.32em" textAnchor="start" fontSize="12" fill={INK} fontWeight={moved ? 600 : 400}>
                    <tspan fill={MUTED} fontWeight={400} style={{ fontVariantNumeric: "tabular-nums" }}>#{r.b} </tspan>
                    {shortName(r)}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </figure>
  );
}
