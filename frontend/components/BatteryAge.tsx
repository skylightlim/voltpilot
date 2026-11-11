"use client";

/* Battery-age visualiser: the results page's "what happens to the battery"
 * card. A pack drawn to scale loses capacity as the age slider moves, and the
 * top EV's kWh and range shrink with it, so "1.6% a year" reads as kilometres.
 *
 * The model is the one this card always used, and it stays a warning only
 * (D7, data/policy/malaysia-incentives.md): it never feeds the ranking.
 *
 * One value drives everything: `age`, a float. The slider sets a whole-year
 * target and `age` glides to it, the way AnimatedNumber glides a figure; Play
 * runs it to 15 at a constant rate. Fill, figures and the slider thumb all read
 * `age`, so nothing on the card can disagree with anything else mid-animation.
 * The fill is a clip-path, not scaleX: scaling would squash its rounded end.
 *
 * Reduced motion: drags land at once, and Play steps a year at a time rather
 * than sweeping. The time-lapse is the explanation, so it is kept, not dropped.
 */

import * as React from "react";
import gsap from "gsap";
import { Pause, Play, RotateCcw, BatteryWarning } from "lucide-react";
import { Slider } from "@/components/Slider";
import { useT } from "@/lib/i18n";

const MAX_AGE = 15;
const LOSS_PER_YR = 1.6; // % of capacity a year; the analyst quotes 1-2%
const FLOOR = 65; // the old card's cap on the estimate; unreachable within 15 years
const WARRANTY_YRS = 8; // "8 years / 160,000 km", per the FAQ (faq.a4)
const WARRANTY_SOH = 70;
const PLAY_S = 6; // a year every 0.4 s

export const stateOfHealth = (age: number) => Math.max(FLOOR, 100 - LOSS_PER_YR * age);

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function BatteryAge({
  car,
  rangeKm,
  batteryKwh,
}: {
  /** The top-ranked EV; absent when the list holds no EV. */
  car?: string;
  rangeKm?: number;
  batteryKwh?: number;
}) {
  const t = useT();
  const [year, setYear] = React.useState(0); // the slider's whole-year target
  const [age, setAge] = React.useState(0); // what is drawn
  const [playing, setPlaying] = React.useState(false);
  // The tween's scratch value. Not state: GSAP writes it every frame.
  const shown = React.useRef({ v: 0 });
  const tween = React.useRef<gsap.core.Tween | null>(null);

  React.useEffect(() => () => void tween.current?.kill(), []);

  const glideTo = (target: number) => {
    tween.current?.kill();
    setPlaying(false);
    setYear(target);
    if (reducedMotion()) {
      shown.current.v = target;
      setAge(target);
      return;
    }
    tween.current = gsap.to(shown.current, {
      v: target,
      duration: 0.34,
      ease: "power2.out",
      onUpdate: () => setAge(shown.current.v),
    });
  };

  const togglePlay = () => {
    if (playing) {
      glideTo(Math.round(shown.current.v));
      return;
    }
    tween.current?.kill();
    const from = year >= MAX_AGE ? 0 : shown.current.v;
    shown.current.v = from;
    setAge(from);
    setPlaying(true);
    tween.current = gsap.to(shown.current, {
      v: MAX_AGE,
      duration: ((MAX_AGE - from) / MAX_AGE) * PLAY_S,
      // constant motion is linear; reduced motion ticks once a year instead
      ease: reducedMotion() ? `steps(${Math.max(1, Math.ceil(MAX_AGE - from))})` : "none",
      onUpdate: () => setAge(shown.current.v),
      onComplete: () => {
        setPlaying(false);
        setYear(MAX_AGE);
      },
    });
  };

  const soh = stateOfHealth(age);
  const pct = Math.round(soh);
  const yr = Math.round(age);
  const inWarranty = yr <= WARRANTY_YRS;
  const done = !playing && year >= MAX_AGE;
  const lostKm = rangeKm ? rangeKm * (1 - soh / 100) : 0;
  const asNew = pct >= 100; // "−0% since new" says nothing

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between text-[16px]">
        <span className="text-muted">{t("r.assumed")}</span>
        <span className="figure text-ink">{t("bat.yrs", { n: yr })}</span>
      </div>
      <Slider
        min={0}
        max={MAX_AGE}
        // a float while playing, so the thumb sweeps with the fill instead of
        // jumping once a year behind it
        step={playing ? "any" : 1}
        className="mt-3"
        aria-label={t("r.batteryAge")}
        aria-valuetext={t("bat.yrs", { n: yr })}
        value={playing ? age : year}
        onChange={(e) => glideTo(Math.round(Number(e.target.value)))}
      />

      {car && <p className="mt-5 text-[15px] text-muted">{t("bat.car", { car })}</p>}

      {/* The pack. Body and caption share one column so 70% means the same x. */}
      <div className={`${car ? "mt-2" : "mt-5"} flex items-start gap-[3px]`} aria-hidden="true">
        <div className="min-w-0 flex-1">
          <div className="relative h-16 rounded-[12px] border-2 border-ink/75 bg-paper-2">
            <div className="absolute inset-[3px] overflow-hidden rounded-[8px]">
              {/* lost capacity: amber hatching the fill uncovers as it recedes */}
              <div
                className="absolute inset-0"
                style={{
                  backgroundColor: "var(--color-amber-tint)",
                  backgroundImage:
                    "repeating-linear-gradient(135deg, rgba(201,127,16,0.38) 0 2px, transparent 2px 7px)",
                }}
              />
              <div
                className="absolute inset-0 bg-primary"
                style={{ clipPath: `inset(0 ${100 - soh}% 0 0 round 8px)` }}
              />
              {/* ten cells, so the eye can count tenths */}
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(to right, transparent 0 calc(10% - 1px), rgba(244,243,236,0.28) calc(10% - 1px) 10%)",
                }}
              />
              <div
                className="absolute inset-y-0 border-l-2 border-dashed border-amber"
                style={{ left: `${WARRANTY_SOH}%` }}
              />
              {/* its own pine plate, so the cell lines stop at the figure instead of striking through it */}
              <span className="figure absolute left-2 top-1/2 -translate-y-1/2 rounded-[6px] bg-primary px-1.5 py-1 text-[28px] leading-none text-primary-foreground">
                {pct}%
              </span>
            </div>
          </div>
          <div className="relative mx-[5px] h-6">
            <span
              className="absolute top-0 whitespace-nowrap border-r-2 border-dashed border-amber pt-1 pr-1.5 text-[14px] leading-none text-amber-800"
              style={{ right: `${100 - WARRANTY_SOH}%` }}
            >
              {t("bat.floor")}
            </span>
          </div>
        </div>
        <div className="mt-5 h-6 w-[7px] shrink-0 rounded-r-[3px] bg-ink/75" />
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-x-4 border-t border-line pt-3">
        <div>
          <dt className="text-[14px] text-muted">{t("bat.capacity")}</dt>
          <dd className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
            <span className="figure text-[22px] text-ink">
              {batteryKwh ? ((batteryKwh * soh) / 100).toFixed(1) : `${pct}%`}
            </span>
            {batteryKwh && (
              <span className="text-[14px] text-muted">
                {t("bat.of", { n: `${batteryKwh.toFixed(1)} kWh` })}
              </span>
            )}
          </dd>
          <dd className="figure mt-0.5 text-[14px] text-amber-800">
            {asNew ? t("bat.asNew") : `−${100 - pct}% ${t("bat.since")}`}
          </dd>
        </div>
        {rangeKm ? (
          <div>
            <dt className="text-[14px] text-muted">{t("bat.range")}</dt>
            <dd className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
              <span className="figure text-[22px] text-ink">
                {Math.round((rangeKm * soh) / 100)} km
              </span>
              <span className="text-[14px] text-muted">{t("bat.of", { n: `${rangeKm} km` })}</span>
            </dd>
            <dd className="figure mt-0.5 text-[14px] text-amber-800">
              {asNew ? t("bat.asNew") : `−${Math.round(lostKm)} km ${t("bat.since")}`}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <p className="flex items-center gap-2 text-[14px] text-ink-2">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${inWarranty ? "bg-primary" : "bg-amber"}`}
          />
          {t(inWarranty ? "bat.inWarranty" : "bat.outWarranty")}
        </p>
        <button
          type="button"
          onClick={togglePlay}
          className="pressable tap-target inline-flex items-center gap-2 rounded-full border border-border bg-white px-4 py-2.5 text-[15px] font-medium text-ink hover:bg-parchment/50 cursor-pointer"
        >
          {playing ? (
            <Pause className="h-4 w-4" />
          ) : done ? (
            <RotateCcw className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          {t(playing ? "bat.pause" : done ? "bat.replay" : "bat.play")}
        </button>
      </div>

      <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-300/40 bg-amber-50/60 p-4">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-amber-500/15">
          <BatteryWarning className="h-4 w-4 text-amber-700" />
        </span>
        <p className="text-[15px] leading-relaxed text-ink">{yr === 0 ? t("bat.note0") : t("bat.note", { n: yr, pct })}</p>
      </div>
    </div>
  );
}
