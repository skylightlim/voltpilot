"use client";

import React from "react";

export type RadarAxis = {
  key: string;
  label: string;
  value: number; // 0 to 100
  maxValue?: number;
};

interface RadarChartProps {
  axes: RadarAxis[];
  size?: number;
  className?: string;
  showLabels?: boolean;
}

export function RadarChart({
  axes,
  size = 280,
  className = "",
  showLabels = true,
}: RadarChartProps) {
  if (!axes || axes.length < 3) return null;

  const count = axes.length;
  const radius = (size / 2) * 0.72;
  const center = size / 2;

  // The left/right labels read outward from the chart, so they need drawing room
  // beyond the square the rings occupy. Widen the viewBox instead of letting them
  // spill past the SVG, where the card's overflow-hidden clips them.
  const padX = Math.round(size * 0.34);
  const viewWidth = size + padX * 2;

  const angleStep = (Math.PI * 2) / count;

  // Grid concentric rings (20%, 40%, 60%, 80%, 100%)
  const rings = [0.25, 0.5, 0.75, 1.0];

  const getCoordinates = (value: number, index: number, maxVal = 100) => {
    const angle = index * angleStep - Math.PI / 2;
    const r = (Math.min(Math.max(value, 0), maxVal) / maxVal) * radius;
    const x = center + r * Math.cos(angle);
    const y = center + r * Math.sin(angle);
    return { x, y };
  };

  const getLabelCoordinates = (index: number) => {
    const angle = index * angleStep - Math.PI / 2;
    // Side labels extend sideways from their anchor, so a large radial offset
    // pushes them off-canvas. Keep them tucked closer to the rings than the
    // top/bottom labels, which only extend vertically.
    const isSide = Math.abs(Math.cos(angle)) > 0.5;
    const labelRadius = radius + (isSide ? 12 : 26);
    const x = center + labelRadius * Math.cos(angle);
    const y = center + labelRadius * Math.sin(angle);
    return { x, y, angle };
  };

  // Polygon points
  const points = axes
    .map((axis, i) => {
      const { x, y } = getCoordinates(axis.value, i, axis.maxValue || 100);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className={`relative flex flex-col items-center justify-center ${className}`}>
      <svg
        width={viewWidth}
        height={size}
        viewBox={`${-padX} 0 ${viewWidth} ${size}`}
        className="h-auto w-full max-w-full"
      >
        {/* Background Concentric Webs */}
        {rings.map((ring, idx) => {
          const ringPoints = axes
            .map((_, i) => {
              const angle = i * angleStep - Math.PI / 2;
              const r = radius * ring;
              return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
            })
            .join(" ");

          return (
            <polygon
              key={idx}
              points={ringPoints}
              fill={idx === rings.length - 1 ? "#f8faf8" : "none"}
              stroke="#ded9ca"
              strokeWidth="1"
              strokeDasharray={idx < rings.length - 1 ? "2 2" : "none"}
              opacity="0.8"
            />
          );
        })}

        {/* Radial Axis Spokes */}
        {axes.map((_, i) => {
          const { x, y } = getCoordinates(100, i, 100);
          return (
            <line
              key={i}
              x1={center}
              y1={center}
              x2={x}
              y2={y}
              stroke="#ded9ca"
              strokeWidth="1"
            />
          );
        })}

        {/* Data Shape */}
        <polygon
          points={points}
          fill="rgba(27, 67, 50, 0.25)"
          stroke="#1b4332"
          strokeWidth="2.5"
          className="transition-all duration-300"
        />

        {/* Vertex Points */}
        {axes.map((axis, i) => {
          const { x, y } = getCoordinates(axis.value, i, axis.maxValue || 100);
          return (
            <g key={i}>
              <circle
                cx={x}
                cy={y}
                r="4.5"
                fill="#10b981"
                stroke="#1b4332"
                strokeWidth="2"
                className="transition-all duration-300"
              />
            </g>
          );
        })}

        {/* Axis Labels */}
        {showLabels &&
          axes.map((axis, i) => {
            const { x, y } = getLabelCoordinates(i);
            const anchor = Math.abs(x - center) < 10 ? "middle" : x > center ? "start" : "end";

            return (
            <text
              key={i}
              x={x}
              y={y}
              textAnchor={anchor}
              dominantBaseline="central"
              className="fill-ink font-mono text-[10.5px] font-semibold tracking-wider uppercase"
            >
              {axis.label.includes("|") ? axis.label.split("|").map((word, wi, arr) => (
                <tspan key={wi} x={x} dy={wi === 0 ? `${-(arr.length - 1) * 0.6}em` : "1.1em"}>
                  {word}
                </tspan>
              )) : axis.label}
            </text>
            );
          })}
      </svg>
    </div>
  );
}