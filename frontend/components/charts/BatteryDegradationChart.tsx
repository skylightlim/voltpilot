"use client";

import React, { useState } from "react";
import { ShieldCheck, BatteryWarning, Zap } from "lucide-react";

interface BatteryDegradationChartProps {
  initialRangeKm?: number;
  initialBatteryKwh?: number;
  chemistry?: string; // "LFP" | "NMC"
  className?: string;
}

export function BatteryDegradationChart({
  initialRangeKm = 420,
  initialBatteryKwh = 60.5,
  chemistry = "LFP",
  className = "",
}: BatteryDegradationChartProps) {
  const [selectedYear, setSelectedYear] = useState<number>(5);

  // Degradation model: LFP degrades ~1.4% per year, NMC ~1.7% per year
  const degradationRate = chemistry === "LFP" ? 1.4 : 1.7;

  // 15 years data points
  const years = Array.from({ length: 16 }, (_, i) => {
    // Initial drop in year 1 (~2.5%), then linear decline
    const loss = i === 0 ? 0 : Math.min(32, 2.5 + (i - 1) * degradationRate);
    const capacityPct = Math.round(100 - loss);
    const rangeKm = Math.round((initialRangeKm * capacityPct) / 100);
    const usableKwh = ((initialBatteryKwh * capacityPct) / 100).toFixed(1);
    const inWarranty = i <= 8;
    return { year: i, capacityPct, rangeKm, usableKwh, inWarranty };
  });

  const current = years[selectedYear];

  // SVG Chart dimensions
  const width = 540;
  const height = 180;
  const padding = { top: 20, right: 30, bottom: 30, left: 45 };
  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;

  const minCapacity = 65;
  const maxCapacity = 100;

  const getX = (year: number) => padding.left + (year / 15) * graphWidth;
  const getY = (capacity: number) =>
    padding.top +
    graphHeight -
    ((capacity - minCapacity) / (maxCapacity - minCapacity)) * graphHeight;

  // SVG Line path
  const linePoints = years.map((d) => `${getX(d.year)},${getY(d.capacityPct)}`).join(" ");

  // Area under curve
  const areaPoints = `${linePoints} ${getX(15)},${padding.top + graphHeight} ${getX(0)},${
    padding.top + graphHeight
  }`;

  return (
    <div className={`rounded-[22px] border border-line bg-white p-5 sm:p-7 card-highlight ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-line">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-display text-[18px] sm:text-[20px] font-semibold text-ink">
              15-Year Battery State of Health (SoH)
            </h3>
            <span className="rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 font-mono text-[10px] font-bold">
              {chemistry} Chemistry
            </span>
          </div>
          <p className="text-[13px] text-muted mt-0.5">
            Electrochemical capacity retention curve under Malaysian tropical climate
          </p>
        </div>

        {/* Selected Year Badge */}
        <div className="flex items-center gap-2 rounded-xl bg-pine-tint px-3.5 py-1.5 border border-pine/15 self-start sm:self-auto">
          <span className="text-[12px] font-mono uppercase text-muted">Year {selectedYear}:</span>
          <span className="figure text-[18px] font-bold text-primary">{current.capacityPct}%</span>
          <span className="text-[12px] text-primary font-medium">({current.rangeKm} km)</span>
        </div>
      </div>

      {/* SVG Retention Graph */}
      <div className="my-5 relative overflow-hidden">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
          <defs>
            <linearGradient id="sohGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[100, 90, 80, 70].map((level) => (
            <g key={level}>
              <line
                x1={padding.left}
                y1={getY(level)}
                x2={width - padding.right}
                y2={getY(level)}
                stroke="#ded9ca"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <text
                x={padding.left - 8}
                y={getY(level)}
                textAnchor="end"
                dominantBaseline="central"
                className="fill-muted font-mono text-[10px]"
              >
                {level}%
              </text>
            </g>
          ))}

          {/* 8-Year Warranty Vertical Marker */}
          <line
            x1={getX(8)}
            y1={padding.top}
            x2={getX(8)}
            y2={padding.top + graphHeight}
            stroke="#d97706"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
          <text
            x={getX(8)}
            y={padding.top - 8}
            textAnchor="middle"
            className="fill-amber-800 font-mono text-[9.5px] font-semibold uppercase"
          >
            8-Yr Warranty Threshold
          </text>

          {/* Area Fill */}
          <polygon points={areaPoints} fill="url(#sohGradient)" />

          {/* Line Curve */}
          <polyline
            points={linePoints}
            fill="none"
            stroke="#1b4332"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Selected Year Pin Indicator */}
          <g>
            <line
              x1={getX(selectedYear)}
              y1={padding.top}
              x2={getX(selectedYear)}
              y2={padding.top + graphHeight}
              stroke="#10b981"
              strokeWidth="2"
            />
            <circle
              cx={getX(selectedYear)}
              cy={getY(current.capacityPct)}
              r="6"
              fill="#10b981"
              stroke="#ffffff"
              strokeWidth="2.5"
              className="shadow-sm"
            />
          </g>

          {/* X Axis Labels */}
          {[0, 3, 5, 8, 10, 12, 15].map((yr) => (
            <text
              key={yr}
              x={getX(yr)}
              y={height - 8}
              textAnchor="middle"
              className="fill-muted font-mono text-[10px]"
            >
              Yr {yr}
            </text>
          ))}
        </svg>
      </div>

      {/* Interactive Year Scrubber */}
      <div className="rounded-xl bg-paper-2 p-4 border border-line">
        <div className="flex items-center justify-between text-[13px] font-medium text-ink mb-2">
          <span>Simulate Vehicle Ownership Duration:</span>
          <span className="font-mono text-primary font-bold">{selectedYear} Years</span>
        </div>
        <input
          type="range"
          min={0}
          max={15}
          step={1}
          value={selectedYear}
          onChange={(e) => setSelectedYear(Number(e.target.value))}
          className="slider"
        />
        <div className="flex justify-between text-[11px] font-mono text-muted mt-1">
          <span>Delivery (Yr 0)</span>
          <span>Warranty End (Yr 8)</span>
          <span>Long-Term (Yr 15)</span>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-line bg-paper-2 p-3.5">
          <p className="text-[11px] font-mono uppercase text-muted">Usable Range</p>
          <p className="figure text-[20px] font-bold text-ink mt-1">{current.rangeKm} km</p>
          <p className="text-[12px] text-muted mt-0.5">From original {initialRangeKm} km</p>
        </div>

        <div className="rounded-xl border border-line bg-paper-2 p-3.5">
          <p className="text-[11px] font-mono uppercase text-muted">Remaining Pack</p>
          <p className="figure text-[20px] font-bold text-ink mt-1">{current.usableKwh} kWh</p>
          <p className="text-[12px] text-muted mt-0.5">From original {initialBatteryKwh} kWh</p>
        </div>

        <div className="rounded-xl border border-line bg-paper-2 p-3.5">
          <p className="text-[11px] font-mono uppercase text-muted">Factory Warranty</p>
          <div className="flex items-center gap-1.5 mt-1">
            {current.inWarranty ? (
              <>
                <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0" />
                <span className="text-[14px] font-semibold text-emerald-700">Fully Covered</span>
              </>
            ) : (
              <>
                <BatteryWarning className="h-5 w-5 text-amber-600 shrink-0" />
                <span className="text-[14px] font-semibold text-amber-700">Post-Warranty (70%+ SoH)</span>
              </>
            )}
          </div>
          <p className="text-[12px] text-muted mt-0.5">8-Year / 160,000 km standard</p>
        </div>
      </div>
    </div>
  );
}