"use client";

import React, { useState } from "react";
import { useT } from "@/lib/i18n";

export type TcoCategory = {
  name: string;
  variant?: string;
  type: "ev" | "hybrid" | "petrol";
  purchasePrice: number;
  energyCost10Yr: number;
  maintenance10Yr: number;
  insurance10Yr: number;
  roadTax10Yr: number;
  resaleValue10Yr: number;
};

interface TcoChartProps {
  items: TcoCategory[];
  title?: string;
  className?: string;
}

export function TcoChart({ items, title, className = "" }: TcoChartProps) {
  const t = useT();
  const [activeItem, setActiveItem] = useState<number | null>(null);

  if (!items || items.length === 0) return null;

  // Calculate gross and net 10-yr cost for scale
  const enriched = items.map((item) => {
    const grossCost =
      item.purchasePrice +
      item.energyCost10Yr +
      item.maintenance10Yr +
      item.insurance10Yr +
      item.roadTax10Yr;
    const netCost = grossCost - item.resaleValue10Yr;
    return { ...item, grossCost, netCost };
  });

  const maxGross = Math.max(...enriched.map((e) => e.grossCost), 1);

  return (
    <div className={`rounded-[22px] border border-line bg-white p-5 sm:p-7 card-highlight ${className}`}>
      {title && (
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-[18px] sm:text-[20px] font-semibold text-ink">{title}</h3>
            <p className="text-[13px] text-muted">{t("tc.sub")}</p>
          </div>
          <span className="mono-label rounded-md bg-pine-tint px-2.5 py-1 text-primary border border-pine/15 self-start sm:self-auto">
            10-Year Horizon
          </span>
        </div>
      )}

      {/* Stacked Bars */}
      <div className="space-y-6">
        {enriched.map((item, idx) => {
          const isSelected = activeItem === idx;
          return (
            <div
              key={item.name}
              onMouseEnter={() => setActiveItem(idx)}
              onMouseLeave={() => setActiveItem(null)}
              className={`rounded-2xl p-3 sm:p-4 border transition-all duration-200 ${
                isSelected ? "border-primary bg-pine-tint/20 shadow-xs" : "border-line/60 bg-paper-2"
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      item.type === "ev" ? "bg-emerald-500" : item.type === "hybrid" ? "bg-slate-700" : "bg-amber-600"
                    }`}
                  />
                  <span className="font-display font-semibold text-[15px] text-ink">{item.name}</span>
                  <span className="text-[11px] font-mono uppercase rounded-full bg-white px-2 py-0.5 border border-line text-muted">
                    {item.type.toUpperCase()}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[11px] font-mono uppercase text-muted mr-1.5">{t("tc.net")}</span>
                  <span className="figure text-[16px] sm:text-[18px] font-bold text-primary">
                    RM {Math.round(item.netCost).toLocaleString("en-MY")}
                  </span>
                </div>
              </div>

              {/* Progress Bar Segments */}
              <div className="h-6 w-full rounded-full bg-line/30 overflow-hidden flex shadow-inner">
                <div
                  style={{ width: `${(item.purchasePrice / maxGross) * 100}%` }}
                  className="h-full bg-primary relative group cursor-pointer transition-all hover:brightness-110"
                  title={`Purchase: RM ${Math.round(item.purchasePrice).toLocaleString("en-MY")}`}
                />
                <div
                  style={{ width: `${(item.energyCost10Yr / maxGross) * 100}%` }}
                  className="h-full bg-emerald-500 relative group cursor-pointer transition-all hover:brightness-110"
                  title={`Energy: RM ${Math.round(item.energyCost10Yr).toLocaleString("en-MY")}`}
                />
                <div
                  style={{ width: `${(item.maintenance10Yr / maxGross) * 100}%` }}
                  className="h-full bg-cyan-600 relative group cursor-pointer transition-all hover:brightness-110"
                  title={`Maintenance: RM ${Math.round(item.maintenance10Yr).toLocaleString("en-MY")}`}
                />
                <div
                  style={{ width: `${(item.insurance10Yr / maxGross) * 100}%` }}
                  className="h-full bg-slate-500 relative group cursor-pointer transition-all hover:brightness-110"
                  title={`Insurance: RM ${Math.round(item.insurance10Yr).toLocaleString("en-MY")}`}
                />
                <div
                  style={{ width: `${(item.roadTax10Yr / maxGross) * 100}%` }}
                  className="h-full bg-amber-500 relative group cursor-pointer transition-all hover:brightness-110"
                  title={`Road Tax: RM ${Math.round(item.roadTax10Yr).toLocaleString("en-MY")}`}
                />
              </div>

              {/* Breakdown numbers */}
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2 text-[12px] pt-2 border-t border-line/40">
                <div>
                  <p className="text-muted text-[11px]">{t("tc.otr")}</p>
                  <p className="font-mono font-medium text-ink">RM {Math.round(item.purchasePrice).toLocaleString("en-MY")}</p>
                </div>
                <div>
                  <p className="text-muted text-[11px]">10-Yr Energy/Fuel</p>
                  <p className="font-mono font-medium text-emerald-700">RM {Math.round(item.energyCost10Yr).toLocaleString("en-MY")}</p>
                </div>
                <div>
                  <p className="text-muted text-[11px]">Maintenance</p>
                  <p className="font-mono font-medium text-cyan-800">RM {Math.round(item.maintenance10Yr).toLocaleString("en-MY")}</p>
                </div>
                <div>
                  <p className="text-muted text-[11px]">{t("tc.tax10")}</p>
                  <p className="font-mono font-medium text-amber-800">RM {Math.round(item.roadTax10Yr).toLocaleString("en-MY")}</p>
                </div>
                <div>
                  <p className="text-muted text-[11px]">{t("tc.resale")}</p>
                  <p className="font-mono font-medium text-emerald-800">(-RM {Math.round(item.resaleValue10Yr).toLocaleString("en-MY")})</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-[12px] text-muted">
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-primary" />
          <span>{t("tc.price")}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-emerald-500" />
          <span>{t("tc.energy")}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-cyan-600" />
          <span>Maintenance</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-slate-500" />
          <span>Insurance</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-amber-500" />
          <span>{t("tc.tax")}</span>
        </div>
      </div>
    </div>
  );
}