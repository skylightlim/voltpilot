"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { ArrowRight, Sparkles, CheckCircle2, Zap, Fuel, TrendingDown, Shield } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { useT } from "@/lib/i18n";

export function Hero() {
  const t = useT();
  const [dailyKm, setDailyKm] = useState<number>(50);

  // Malaysian Cost Economics Calculation
  // RON95 @ RM 2.05/L, average consumption 7.2 L/100km
  // TNB EV Tariff off-peak @ RM 0.25/kWh, average consumption 15.5 kWh/100km
  const annualKm = dailyKm * 365;

  const annualPetrolRm = useMemo(() => {
    return Math.round((annualKm * 7.2) / 100 * 2.05);
  }, [annualKm]);

  const annualEvRm = useMemo(() => {
    return Math.round((annualKm * 15.5) / 100 * 0.25);
  }, [annualKm]);

  const annualSavingsRm = annualPetrolRm - annualEvRm;
  const tenYearSavingsRm = annualSavingsRm * 10;
  const annualCo2Kg = Math.round((annualKm * 7.2 / 100) * 2.31 - (annualKm * 15.5 / 100) * 0.58);

  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-10 pb-20 sm:pb-28">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
        {/* Left Column: Core Value Proposition */}
        <div className="lg:col-span-7 flex flex-col items-start">
          <div className="inline-flex items-center gap-2 rounded-full border border-pine/20 bg-pine-tint px-3.5 py-1 text-primary">
            <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
            <span className="font-mono text-[11px] font-semibold tracking-wider uppercase">
              Malaysian EV & Hybrid Decision Engine
            </span>
          </div>

          <h1 className="apple-display mt-5 text-[42px] sm:text-[56px] lg:text-[62px] text-ink font-bold leading-[1.05]">
            {t("hero.t1")}
            <br />
            <span className="text-primary">{t("hero.t2")}</span>
          </h1>

          <p className="mt-5 max-w-xl text-[16px] sm:text-[18px] leading-relaxed text-fog">
            {t("hero.sub")}
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 w-full sm:w-auto">
            <Link href="/interview/form" className="w-full sm:w-auto">
              <Button variant="primary" size="lg" className="w-full sm:w-auto px-7 shadow-md">
                <span>{t("hero.cta")}</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/interview/voice" className="w-full sm:w-auto">
              <Button variant="secondary" size="lg" className="w-full sm:w-auto px-6">
                <Sparkles className="h-4 w-4 text-emerald-600" />
                <span>{t("hero.voiceCta")}</span>
              </Button>
            </Link>
          </div>

          <div className="mt-8 flex items-center gap-2 text-[13px] font-medium text-muted">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{t("hero.trust")}</span>
          </div>
        </div>

        {/* Right Column: Live Commute Economics Calculator Widget */}
        <div id="calculator" className="lg:col-span-5">
          <div className="rounded-[26px] border border-line bg-white p-6 sm:p-7 shadow-xl card-highlight">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div>
                <p className="mono-label text-primary">{t("calc.title")}</p>
                <p className="text-[12px] text-muted mt-0.5">{t("calc.sub")}</p>
              </div>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 font-mono text-xs font-bold border border-emerald-200">
                MY
              </span>
            </div>

            {/* Daily Distance Slider */}
            <div className="mt-5 rounded-2xl bg-paper-2 p-4 border border-line">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[13px] font-semibold text-ink">{t("calc.daily")}</span>
                <span className="figure text-[20px] font-bold text-primary">
                  {dailyKm} <span className="text-[13px] font-normal text-muted">km/day</span>
                </span>
              </div>
              <input
                type="range"
                min={10}
                max={200}
                step={5}
                value={dailyKm}
                onChange={(e) => setDailyKm(Number(e.target.value))}
                className="slider"
                aria-label="Daily commute distance"
              />
              <div className="flex justify-between text-[11px] font-mono text-muted mt-1.5">
                <span>10 km (Urban)</span>
                <span>50 km (Commute)</span>
                <span>200 km (Field/Sales)</span>
              </div>
            </div>

            {/* Side-by-side Fuel vs EV Comparison */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-line bg-paper-2 p-3">
                <div className="flex items-center gap-1.5 text-muted mb-1">
                  <Fuel className="h-3.5 w-3.5 text-amber-600" />
                  <span className="text-[11px] font-mono uppercase">{t("calc.petrol")}</span>
                </div>
                <p className="figure text-[18px] font-bold text-ink">
                  RM {annualPetrolRm.toLocaleString("en-MY")}
                  <span className="text-[11px] font-normal text-muted">/yr</span>
                </p>
                <p className="text-[10.5px] text-muted mt-0.5">RON95 @ RM2.05/L</p>
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                <div className="flex items-center gap-1.5 text-emerald-800 mb-1">
                  <Zap className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="text-[11px] font-mono uppercase">{t("calc.ev")}</span>
                </div>
                <p className="figure text-[18px] font-bold text-emerald-800">
                  RM {annualEvRm.toLocaleString("en-MY")}
                  <span className="text-[11px] font-normal text-emerald-700">/yr</span>
                </p>
                <p className="text-[10.5px] text-emerald-700 mt-0.5">TNB ToU @ RM0.25/kWh</p>
              </div>
            </div>

            {/* Big Net Savings Callout */}
            <div className="mt-4 rounded-2xl bg-pine-deep p-4 text-white dark-card-highlight">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[12px] font-mono uppercase text-emerald-400 font-semibold">
                    {t("calc.annualSave")}
                  </p>
                  <p className="figure text-[26px] sm:text-[30px] font-bold text-white mt-0.5">
                    RM {annualSavingsRm.toLocaleString("en-MY")}
                    <span className="text-[13px] font-normal text-white/70"> / year</span>
                  </p>
                </div>
                <div className="h-10 w-10 rounded-full bg-emerald-500/20 grid place-items-center text-emerald-400 border border-emerald-500/30">
                  <TrendingDown className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between text-[12px] text-white/80">
                <span>{t("calc.tenYearSave")}: <b>RM {tenYearSavingsRm.toLocaleString("en-MY")}</b></span>
                <span className="text-emerald-400">-{annualCo2Kg.toLocaleString("en-MY")} kg CO₂/yr</span>
              </div>
            </div>

            <div className="mt-4">
              <Link href="/interview/form" className="block w-full">
                <Button variant="primary" size="md" className="w-full text-[14px]">
                  <span>Calculate with 184 exact models</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}