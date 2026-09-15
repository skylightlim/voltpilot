"use client";

/* Shared numeric control: a slider with the value still editable beside it.
 *
 * Lifted out of app/interview/form/page.tsx when the calculators page needed
 * the same control. Copying it would have put the same widget in two files
 * with two sets of styling to keep in step — the shape of problem issue 14 is
 * about — so it moved here and the form imports it.
 *
 * The editable number is the point: a track has to pick a band, and the rare
 * driver outside it (a 300 km e-hailing day, a RM750k budget) must not be
 * locked out by where the ends happen to sit. `hardMax` bounds what can be
 * typed; `max` only bounds the track.
 */

import * as React from "react";
import { Slider } from "@/components/Slider";

export function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-[12px] font-semibold text-muted">
      {children}
    </label>
  );
}

/**
 * Slider-first numeric field, shaped like the weighting studio's sliders:
 * label + value on top, track, then the band's end captions. The value itself
 * stays editable so the rare driver outside the band (an e-hailing 300 km day,
 * a RM 750k budget) is never locked out by the track's ends.
 */
export function RangeField({
  id,
  label,
  min,
  max,
  step,
  hardMax,
  value,
  onChange,
  caption,
  zeroLabel,
}: {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  hardMax: number;
  value: number;
  onChange: (v: number) => void;
  caption: (v: number) => string;
  zeroLabel?: string;
}) {
  /* The box hugs its value instead of sitting in a fixed 128px well. The face is
     mono with tabular-nums, so every digit is exactly 1ch and this is exact
     rather than approximate. 1.5rem covers px-2.5 on both sides plus the border. */
  const shown = value ? String(value) : (zeroLabel ?? "");
  const chars = Math.max(shown.length, 3);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <input
          type="number"
          inputMode="numeric"
          aria-label={label}
          min={0}
          max={hardMax}
          step={step}
          placeholder={zeroLabel}
          value={value || ""}
          onChange={(e) =>
            onChange(Math.min(hardMax, Math.max(0, Number(e.target.value))))
          }
          style={{ width: `calc(${chars}ch + 1.5rem)` }}
          className="max-w-full shrink-0 rounded-md border border-transparent bg-parchment px-2.5 py-1 text-center font-mono text-[15px] font-bold text-primary tabular-nums outline-none transition-[width,background-color,border-color] duration-150 placeholder:font-semibold placeholder:text-muted focus:border-primary focus:bg-card [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </div>
      <Slider
        id={id}
        min={min}
        max={max}
        step={step}
        aria-label={label}
        // a value typed past the band pins the thumb at that end
        value={Math.min(max, Math.max(min, value))}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-3"
      />
      <div className="mt-1.5 flex justify-between font-mono text-[10px] uppercase tracking-wider text-muted">
        <span>{caption(min)}</span>
        <span>{caption(max)}+</span>
      </div>
    </div>
  );
}
