"use client";

/* The range input used everywhere on the site.
 *
 * A native <input type="range"> gives CSS no handle on its own position, so the
 * track cannot show how far along the value is — the one thing a slider is for.
 * This writes that position out as a custom property; globals.css turns it into
 * the fill (and corrects it for the thumb's real travel, which is inset by half
 * a thumb at each end).
 *
 * Everything else is a plain range input on purpose: keyboard stepping, arrow
 * keys, Home/End, screen-reader value announcements and touch handling all come
 * free and are hard to reproduce faithfully on a div.
 */

import * as React from "react";

export function Slider({
  min,
  max,
  value,
  className = "",
  style,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  const lo = Number(min ?? 0);
  const hi = Number(max ?? 100);
  const span = hi - lo;

  // A zero or inverted span would divide by zero or send the fill backwards;
  // both are caller bugs, but an empty track is a better failure than a NaN in
  // the style attribute, which drops the declaration silently.
  const p = span > 0 ? (Number(value ?? lo) - lo) / span : 0;

  return (
    <input
      type="range"
      min={min}
      max={max}
      value={value}
      className={`slider ${className}`}
      style={{ ["--slider-p" as string]: Math.min(1, Math.max(0, p)), ...style }}
      {...rest}
    />
  );
}
