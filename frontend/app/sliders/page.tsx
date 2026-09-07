"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Banknote, Leaf, Gauge, ShieldCheck, Sparkles } from "lucide-react";
import { Button, Card, SectionLabel } from "@/components/ui";
import { ScrollRefresh } from "@/components/motion";
import { RadarChart } from "@/components/charts/RadarChart";
import { useT, type StrKey } from "@/lib/i18n";
import { ApiError, SESSION, apiService, type Weights } from "@/lib/api";

const SLIDERS: { key: keyof Weights; icon: React.ReactNode; p: string; color: string }[] = [
  { key: "future_proofing", icon: <ShieldCheck className="h-4.5 w-4.5" />, p: "fut", color: "text-amber-600" },
  { key: "environment", icon: <Leaf className="h-4.5 w-4.5" />, p: "env", color: "text-green-600" },
  { key: "convenience", icon: <Gauge className="h-4.5 w-4.5" />, p: "conv", color: "text-cyan-600" },
  { key: "save_money", icon: <Banknote className="h-4.5 w-4.5" />, p: "money", color: "text-emerald-600" },
] as const;

/** Axis labels carry a "|" that only RadarChart understands; strip it for prose. */
const plain = (s: string) => s.replace(/\s*\|\s*/g, " ");

type PresetKey = "balanced" | "budget" | "highway" | "green";

export default function SlidersPage() {
  const t = useT();
  const router = useRouter();
  const [weights, setWeights] = useState<Weights>(() => SESSION.loadWeights());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const profile = useMemo(() => SESSION.loadProfile(), []);

  const presets: Record<PresetKey, { label: StrKey; values: Weights }> = {
    balanced: {
      label: "sl.p_balanced",
      values: { save_money: 50, environment: 50, convenience: 50, future_proofing: 50 },
    },
    budget: {
      label: "sl.p_economist",
      values: { save_money: 100, environment: 20, convenience: 40, future_proofing: 50 },
    },
    highway: {
      label: "sl.p_cruiser",
      values: { save_money: 40, environment: 30, convenience: 100, future_proofing: 60 },
    },
    green: {
      label: "sl.p_eco",
      values: { save_money: 30, environment: 100, convenience: 40, future_proofing: 70 },
    },
  };

  const activePreset = Object.entries(presets).find(
    ([_, p]) =>
      p.values.save_money === weights.save_money &&
      p.values.environment === weights.environment &&
      p.values.convenience === weights.convenience &&
      p.values.future_proofing === weights.future_proofing
  )?.[0] as PresetKey | undefined;

  const radarAxes = useMemo(() => {
    return SLIDERS.map((s) => ({
      key: s.key,
      label: t(`sl.${s.p}.t` as StrKey),
      value: weights[s.key],
    }));
  }, [weights, t]);

  const run = () => {
    // Hand over immediately. Scoring took about five seconds, and waiting for it
    // here left the visitor on a dead button before the waiting screen appeared.
    // /analysis owns the whole pipeline now — profile, score, analyst, results —
    // so there is one wait, on the page built to hold it.
    SESSION.saveWeights(weights);
    setBusy(true);
    setError("");
    router.push("/analysis");
  };

  return (
    <main className="app-shell mx-auto flex min-h-[100svh] w-full max-w-md flex-col px-5 pt-6">
      <ScrollRefresh />
      {/* Both labels are longer in BM ("Kembali ke diagnostik" / "Langkah 2 · Studio
          Pemberat") than the 335px of a 375px phone allows side by side. Wrapping the
          row rather than the phrases lets them drop onto separate lines intact instead
          of each breaking mid-phrase. */}
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <button
          className="pressable tap-target -ml-1 flex shrink-0 items-center gap-1.5 whitespace-nowrap px-1 text-[16px] font-medium text-muted transition-colors hover:text-ink"
          onClick={() => router.push("/interview/form")}
        >
          <ArrowLeft className="h-4 w-4 shrink-0" /> {t("sl.back")}
        </button>
        <span className="mono-label shrink-0 whitespace-nowrap font-semibold text-accent">
          {t("sl.step")}
        </span>
      </header>

      <section className="mt-6">
        <SectionLabel>{t("sl.label")}</SectionLabel>
        <h1 className="apple-display-2 mt-2 text-[26px] sm:text-[28px] text-ink">
          {t("sl.t1")} <span className="text-primary">{t("sl.t2")}</span>
        </h1>
        <p className="mt-2 text-[16px] leading-relaxed text-muted">{t("sl.sub")}</p>
      </section>

      {/* Radar Chart Weight Visualization */}
      <Card className="mt-6 flex flex-col items-center justify-center bg-card p-4 overflow-hidden border border-line">
        <RadarChart axes={radarAxes} size={220} showLabels={true} />
      </Card>

      {/* Preset Buttons */}
      <div className="mt-6">
        <p className="mono-label text-[10px] text-muted tracking-widest uppercase mb-2.5">{t("sl.presets")}</p>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(presets).map(([key, p]) => {
            const isActive = activePreset === key;
            return (
              <button
                key={key}
                onClick={() => setWeights(p.values)}
                className={`pressable inline-flex min-h-11 items-center rounded-full px-4 text-[13px] font-semibold transition-all border ${
                  isActive
                    ? "bg-primary border-primary text-white"
                    : "bg-white border-line text-muted hover:text-ink"
                }`}
              >
                {isActive && <Sparkles className="inline-block mr-1 h-3.5 w-3.5" />}
                {t(p.label)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Plain container, not ScrubStagger. A scrub reveal binds opacity to
          scroll position, which left these four sliders parked at 0.23 / 0.13 /
          0.03 / 0 opacity on load — measured. Editorial blocks can afford to
          arrive on scroll; the controls this page exists for cannot. */}
      <div className="mt-6 space-y-3 pb-8">
        {SLIDERS.map((s) => (
          <Card key={s.key} className="!p-5 border-line bg-card">
            <div className="flex items-center gap-2">
              <span className={`p-1.5 rounded-full bg-parchment ${s.color}`}>
                {s.icon}
              </span>
              <h2 className="text-[16px] font-bold text-ink">{plain(t(`sl.${s.p}.t` as StrKey))}</h2>
              <span className="ml-auto font-mono text-[16px] font-bold text-primary tabular-nums">
                {Math.round(weights[s.key])}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              aria-label={plain(t(`sl.${s.p}.t` as StrKey))}
              value={weights[s.key]}
              className="slider mt-4"
              onChange={(e) => setWeights((w) => ({ ...w, [s.key]: Number(e.target.value) }))}
            />
            <div className="mt-1.5 flex justify-between font-mono text-[10px] uppercase text-muted tracking-wider">
              <span>{t(`sl.${s.p}.low` as StrKey)}</span>
              <span>{t(`sl.${s.p}.high` as StrKey)}</span>
            </div>
            <p className="mt-2.5 text-[15px] leading-relaxed text-muted">{t(`sl.${s.p}.hint` as StrKey)}</p>
          </Card>
        ))}
      </div>

      {error && (
        <p className="mt-4 rounded-xl bg-red-50/80 px-4 py-3 text-sm font-medium text-red-600 border border-red-200/50">{error}</p>
      )}

      <div className="thumb-zone mx-auto max-w-md">
        <Button size="lg" className="w-full text-base font-semibold" onClick={run} disabled={busy}>
          {busy ? t("sl.running") : (
            <>
              {t("sl.cta")} <ArrowRight className="h-4.5 w-4.5" />
            </>
          )}
        </Button>
      </div>
    </main>
  );
}
