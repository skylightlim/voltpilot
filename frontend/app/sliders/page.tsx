"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Banknote, Leaf, Gauge, ShieldCheck, Sparkles } from "lucide-react";
import { Button, Card, SectionLabel } from "@/components/ui";
import { Stagger } from "@/components/motion";
import { RadarChart } from "@/components/charts/RadarChart";
import { useT, type StrKey } from "@/lib/i18n";
import { SESSION, apiService, type Weights } from "@/lib/api";

const SLIDERS: { key: keyof Weights; icon: React.ReactNode; p: string; color: string }[] = [
  { key: "future_proofing", icon: <ShieldCheck className="h-4.5 w-4.5" />, p: "fut", color: "text-amber-600" },
  { key: "environment", icon: <Leaf className="h-4.5 w-4.5" />, p: "env", color: "text-green-600" },
  { key: "convenience", icon: <Gauge className="h-4.5 w-4.5" />, p: "conv", color: "text-cyan-600" },
  { key: "save_money", icon: <Banknote className="h-4.5 w-4.5" />, p: "money", color: "text-emerald-600" },
] as const;

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

  const run = async () => {
    SESSION.saveWeights(weights);
    setBusy(true);
    setError("");
    try {
      const p = await apiService.postProfile(profile);
      if (p.missing_required.length) {
        router.push("/interview/form");
        return;
      }
      SESSION.saveToken(p.token);
      const r = await apiService.postScore(p.token, profile, weights);
      router.push(`/analysis?token=${r.token}`);
    } catch (e) {
      setError((e as Error).message || t("sl.err"));
      setBusy(false);
    }
  };

  return (
    <main className="app-shell mx-auto flex min-h-[100svh] w-full max-w-md flex-col px-5 pt-6">
      <header className="flex items-center justify-between">
        <button
          className="pressable tap-target flex items-center gap-1.5 text-[14px] font-medium text-muted transition-colors hover:text-ink"
          onClick={() => router.push("/interview/form")}
        >
          <ArrowLeft className="h-4 w-4" /> {t("sl.back")}
        </button>
        <span className="mono-label text-accent font-semibold">{t("sl.step")}</span>
      </header>

      <section className="mt-6">
        <SectionLabel>{t("sl.label")}</SectionLabel>
        <h1 className="apple-display-2 mt-2 text-[26px] sm:text-[28px] text-ink">
          {t("sl.t1")} <span className="text-primary">{t("sl.t2")}</span>
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">{t("sl.sub")}</p>
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
                className={`pressable rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-all border ${
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

      <Stagger className="mt-6 space-y-3 pb-8" stagger={0.05}>
        {SLIDERS.map((s) => (
          <Card key={s.key} className="!p-5 border-line bg-card">
            <div className="flex items-center gap-2">
              <span className={`p-1.5 rounded-full bg-parchment ${s.color}`}>
                {s.icon}
              </span>
              <h2 className="text-[15px] font-bold text-ink">{t(`sl.${s.p}.t` as StrKey)}</h2>
              <span className="ml-auto font-mono text-[14px] font-bold text-primary tabular-nums">
                {Math.round(weights[s.key])}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              aria-label={t(`sl.${s.p}.t` as StrKey)}
              value={weights[s.key]}
              className="slider mt-4"
              onChange={(e) => setWeights((w) => ({ ...w, [s.key]: Number(e.target.value) }))}
            />
            <div className="mt-1.5 flex justify-between font-mono text-[10px] uppercase text-muted tracking-wider">
              <span>{t(`sl.${s.p}.low` as StrKey)}</span>
              <span>{t(`sl.${s.p}.high` as StrKey)}</span>
            </div>
            <p className="mt-2.5 text-[13px] leading-relaxed text-muted">{t(`sl.${s.p}.hint` as StrKey)}</p>
          </Card>
        ))}
      </Stagger>

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
