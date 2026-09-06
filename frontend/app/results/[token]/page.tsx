"use client";

export const runtime = "edge";

import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  BatteryWarning,
  CheckCircle2,
  ChevronDown,
  Download,
  Leaf,
  Loader2,
  MessageCircle,
  Sparkles,
  Sun,
  X,
  TrendingDown,
  Zap,
  MapPin,
  Calculator,
} from "lucide-react";
import { Badge, Button, Card, SectionLabel } from "@/components/ui";
import { InfrastructureAccess } from "@/components/InfrastructureAccess";
import { CountUp, ScrollRefresh, ScrubReveal, Stagger } from "@/components/motion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { apiService } from "@/lib/api";
import { useT } from "@/lib/i18n";

gsap.registerPlugin(ScrollTrigger);

type Row = {
  rank: number;
  slug: string;
  brand: string;
  model: string;
  variant: string;
  type: "ev" | "hybrid";
  body: string;
  price_rm: number;
  running_cost_rm_yr: number;
  tco_excluding_rm: number;
  topsis_score: number;
  financial_score: number;
  behaviour_score: number;
  infrastructure_score: number;
  energy_score: number;
  co2_kg_yr: number;
  source?: string;
};

const CRITERIA: { key: keyof Row; label: string; icon: typeof Calculator; accent: string }[] = [
  { key: "financial_score", label: "Financial", icon: Calculator, accent: "text-emerald-600" },
  { key: "behaviour_score", label: "Range fit", icon: TrendingDown, accent: "text-blue-600" },
  { key: "infrastructure_score", label: "Infrastructure", icon: MapPin, accent: "text-amber-600" },
  { key: "energy_score", label: "Energy & CO₂", icon: Zap, accent: "text-violet-600" },
];

export default function ResultsPage() {
  const t = useT();
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [batteryAge, setBatteryAge] = useState(0);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [pdfSent, setPdfSent] = useState<null | { first: boolean; email: string }>(null);
  const [showPdf, setShowPdf] = useState(false);
  const [heroVisible, setHeroVisible] = useState(false);
  const [bodyFilter, setBodyFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const r = await apiService.getResults(token);
        if (cancelled) return;
        setData(r);
        if (!r.recommendation) {
          await apiService.getRecommendation(token).catch(() => {});
        }
      } catch {
        setError("Result not found — this link may have expired.");
      }
    };
    poll();
    const iv = setInterval(poll, 1500);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [token]);

  const ranking: Row[] = data?.ranking ?? [];

  // Options come from the ranking itself, so they only ever offer values that
  // survived the budget screen — no dead filters that return nothing.
  const bodyOptions = useMemo(
    () => [...new Set(ranking.map((r) => r.body).filter(Boolean))].sort(),
    [ranking],
  );
  const brandOptions = useMemo(
    () => [...new Set(ranking.map((r) => r.brand).filter(Boolean))].sort(),
    [ranking],
  );
  const filteredRanking = useMemo(
    () =>
      ranking.filter(
        (r) =>
          (bodyFilter === "all" || r.body === bodyFilter) &&
          (brandFilter === "all" || r.brand === brandFilter),
      ),
    [ranking, bodyFilter, brandFilter],
  );
  const filtersOn = bodyFilter !== "all" || brandFilter !== "all";

  const top: Row | undefined = data?.ranking?.[0];
  const rec = data?.recommendation;

  const batteryWarning = useMemo(() => {
    const estLoss = Math.min(35, Math.round(batteryAge * 1.6));
    return {
      loss: estLoss,
      text: `After roughly ${batteryAge || 0} years a lithium pack typically holds ~${Math.max(65, 100 - estLoss)}% of original capacity. This is a warning only — your ranking above does not change.`,
    };
  }, [batteryAge]);

  const sendReport = async () => {
    setPdfBusy(true);
    setPdfError("");
    try {
      const r = await apiService.postReport(token, email);
      setPdfSent(r);
      setShowPdf(false);
    } catch (e: any) {
      setPdfError(e.detail && typeof e.detail === "string" ? e.detail : "Could not send the report.");
    } finally {
      setPdfBusy(false);
    }
  };

  if (!data) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-background">
      <ScrollRefresh />
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="mt-3 text-[14px] text-muted">{t("r.compiling")}</p>
        </div>
      </main>
    );
  }

  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  return (
    <main className="app-shell mx-auto min-h-[100dvh] w-full max-w-2xl bg-background px-4 sm:px-5 pb-32">
      {/* ── Frosted Glass Header ──────────────────────────────────────── */}
      <header className="sticky top-0 z-30 -mx-4 sm:-mx-5 mb-8 border-b border-white/40 bg-background/65 px-4 sm:px-5 py-4 backdrop-blur-2xl supports-[backdrop-filter]:bg-background/40">
        <div className="flex items-center justify-between">
          <SectionLabel>{t("r.your")}</SectionLabel>
          <Link
            href="/"
            className="tap-target inline-flex items-center gap-1.5 rounded-full border border-border bg-white/50 px-3.5 py-2 text-[13px] font-medium text-muted transition-colors hover:border-primary/30 hover:bg-pine-tint/50 hover:text-ink"
          >
            {t("r.restart")}
          </Link>
        </div>
      </header>

      {/* ── AI Recommendation Hero ────────────────────────────────────── */}
      {rec && top && (
        <ScrubReveal className="mb-10">
          <div className="group relative overflow-hidden rounded-[28px] bg-pine-deep text-white">
            {/* outer bezel */}
            <div className="absolute inset-0 rounded-[28px] ring-1 ring-inset ring-white/[0.08]" />
            {/* ambient glow */}
            <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl" />
            <div className="absolute -bottom-16 -left-16 h-40 w-40 rounded-full bg-primary/20 blur-2xl" />
            {/* inner card */}
            <div className="relative m-[3px] rounded-[calc(28px-3px)] bg-gradient-to-br from-pine-deep via-pine-deep to-[#0a1f18] p-5 sm:p-8 shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-emerald-500/20 ring-1 ring-emerald-500/30">
                  <Sparkles className="h-4.5 w-4.5 text-emerald-400" />
                </span>
                <p className="mono-label text-emerald-400/80">{t("r.ai")}</p>
              </div>
              <h1 className="apple-display mt-4 sm:mt-5 text-[26px] sm:text-[38px] text-white leading-[1.08]">
                {rec.headline}
              </h1>
              <p className="mt-3 text-[14px] sm:text-[16px] leading-relaxed text-white/60 max-w-prose">
                {rec.summary}
              </p>
              <Stagger className="mt-7 flex flex-wrap gap-2.5" selector="> *" stagger={0.06}>
                <button
                  onClick={() => router.push(`/recommendation/${token}`)}
                  className="pressable tap-target group/btn relative inline-flex items-center gap-2.5 overflow-hidden rounded-full bg-white px-6 py-3 text-[14px] font-semibold text-pine-deep transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97]"
                >
                  {t("r.roadmap")}
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-pine-deep/10 transition-transform group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5">
                    <span className="text-[12px]">↗</span>
                  </span>
                </button>
                <button
                  onClick={() => router.push(`/chat/${token}`)}
                  className="pressable tap-target inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-3 text-[14px] font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/10 active:scale-[0.97]"
                >
                  <MessageCircle className="h-4 w-4" /> Ask AI
                </button>
                <button
                  onClick={() => setShowPdf(true)}
                  className="pressable tap-target inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-3 text-[14px] font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/10 active:scale-[0.97]"
                >
                  <Download className="h-4 w-4" /> {t("r.pdf")}
                </button>
              </Stagger>
            </div>
          </div>
        </ScrubReveal>
      )}

      {/* ── Key Metrics Bento ─────────────────────────────────────────── */}
      {top && (
        <ScrubReveal className="mb-10">
          <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
            {/* Price card — spans full width */}
            <div className="col-span-2">
              <div className="group relative overflow-hidden rounded-[20px] sm:rounded-[22px] border border-white/40 bg-white/70 p-4 sm:p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)] backdrop-blur-sm transition-all hover:border-primary/20 hover:shadow-md">
                <div className="absolute inset-0 rounded-[22px] ring-1 ring-inset ring-black/[0.03]" />
                <p className="mono-label text-fog">{t("r.price")}</p>
                <p className="figure mt-2 text-[36px] sm:text-[44px] text-ink leading-none">
                  RM{top.price_rm.toLocaleString()}
                </p>
                <p className="mt-2 text-[13px] text-muted">
                  {t("r.energy")} <span className="font-semibold text-ink">RM{top.running_cost_rm_yr.toLocaleString()}/yr</span>
                  {" · "}
                  {t("r.tco10")} <span className="font-semibold text-ink">RM{top.tco_excluding_rm.toLocaleString()}</span>
                </p>
              </div>
            </div>

            {/* CO₂ savings */}
            <div className="col-span-1">
              <div className="group relative overflow-hidden rounded-[20px] sm:rounded-[22px] border border-white/40 bg-white/70 p-4 sm:p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] backdrop-blur-sm transition-all hover:border-emerald-500/20 hover:shadow-md">
                <div className="absolute inset-0 rounded-[22px] ring-1 ring-inset ring-black/[0.03]" />
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/20">
                  <Leaf className="h-5 w-5 text-emerald-600" />
                </div>
                <p className="mono-label text-fog">{t("r.co2s")}</p>
                <p className="figure mt-1.5 text-[28px] text-ink leading-none">
                  <CountUp value={Math.round(top.co2_kg_yr)} /> <span className="text-[16px] text-muted font-normal">{t("r.kgyr")}</span>
                </p>
              </div>
            </div>

            {/* TOPSIS score */}
            <div className="col-span-1">
              <div className="group relative overflow-hidden rounded-[20px] sm:rounded-[22px] border border-white/40 bg-white/70 p-4 sm:p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] backdrop-blur-sm transition-all hover:border-violet-500/20 hover:shadow-md">
                <div className="absolute inset-0 rounded-[22px] ring-1 ring-inset ring-black/[0.03]" />
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-violet-500/10 ring-1 ring-violet-500/20">
                  <Sparkles className="h-5 w-5 text-violet-600" />
                </div>
                <p className="mono-label text-fog">{t("r.topsis")}</p>
                <p className="figure mt-1.5 text-[28px] text-ink leading-none">
                  {top.topsis_score.toFixed(3)}
                </p>
              </div>
            </div>
          </div>
        </ScrubReveal>
      )}

      {/* ── Live Infrastructure Look-up ────────────────────────────────── */}
      <InfrastructureAccess token={token} />

      {/* ── Solar Bonus Banner ────────────────────────────────────────── */}
      {data.solar && (
        <ScrubReveal className="mb-10">
          <div className="group relative overflow-hidden rounded-[20px] sm:rounded-[22px] border border-amber-300/40 bg-gradient-to-br from-[#fffbeb] via-[#fef3c7] to-[#fff9ec] p-4 sm:p-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-all hover:shadow-md">
            <div className="absolute inset-0 rounded-[22px] ring-1 ring-inset ring-amber-500/[0.08]" />
            <div className="flex items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-amber-500/15 ring-1 ring-amber-500/25">
                <Sun className="h-5 w-5 text-amber-700" />
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-ink">{t("r.solar")}</p>
                <p className="mt-1 text-[14px] leading-relaxed text-muted">
                  Add rooftop solar (avg MY: capex{" "}
                  <span className="font-semibold text-ink">RM{data.solar.capex_rm.toLocaleString()}</span>,
                  savings{" "}
                  <span className="font-semibold text-ink">~RM{data.solar.savings_rm_per_year.toLocaleString()}/year</span>,
                  payback{" "}
                  <span className="font-semibold text-ink">{data.solar.payback_years} years</span>
                  ). Daytime charging becomes near-free.
                </p>
              </div>
            </div>
          </div>
        </ScrubReveal>
      )}

      {/* ── Dashboard Section ─────────────────────────────────────────── */}
      <section className="space-y-2.5 sm:space-y-3">
        <SectionLabel className="mb-3 sm:mb-4 block">{t("r.dash")}</SectionLabel>

        {/* Ranking Table */}
        <DashboardCard
          label={
            data.budget?.applied
              ? `TOPSIS ranking — ${ranking.length} models within RM${Number(
                  data.budget.max_rm,
                ).toLocaleString()}`
              : `TOPSIS ranking — all ${ranking.length} models`
          }
          icon={<Sparkles className="h-4 w-4" />}
          isOpen={!!open.ranking}
          onClick={() => toggle("ranking")}
        >
          {data.budget?.applied && (
            <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
              {data.budget.catalog_total - ranking.length} of {data.budget.catalog_total} models
              cost more than your budget and were excluded before ranking.
            </p>
          )}

          {/* Body / brand filters — display only, they never re-rank */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              aria-label={t("r.filterBody")}
              value={bodyFilter}
              onChange={(e) => setBodyFilter(e.target.value)}
              className="rounded-full border border-line bg-parchment px-3.5 py-1.5 text-[12.5px] font-semibold text-ink outline-none focus:border-primary"
            >
              <option value="all">{t("r.allBody")}</option>
              {bodyOptions.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <select
              aria-label={t("r.filterBrand")}
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="rounded-full border border-line bg-parchment px-3.5 py-1.5 text-[12.5px] font-semibold text-ink outline-none focus:border-primary"
            >
              <option value="all">{t("r.allBrands")}</option>
              {brandOptions.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            {filtersOn && (
              <>
                <span className="text-[12.5px] text-muted">
                  {filteredRanking.length} of {ranking.length}
                </span>
                <button
                  onClick={() => {
                    setBodyFilter("all");
                    setBrandFilter("all");
                  }}
                  className="pressable rounded-full px-3 py-1.5 text-[12.5px] font-semibold text-primary hover:underline"
                >
                  Clear
                </button>
              </>
            )}
          </div>

          <div className="mt-4 overflow-x-auto -mx-1 px-1">
            <table className="w-full min-w-[440px] border-collapse text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.1em] text-muted">
                  <th className="pb-3 pr-3 font-semibold">#</th>
                  <th className="pb-3 pr-3 font-semibold">Model</th>
                  <th className="pb-3 pr-3 font-semibold">Body</th>
                  <th className="pb-3 pr-3 font-semibold">Score</th>
                  <th className="pb-3 pr-3 text-right font-semibold">Price</th>
                  <th className="pb-3 text-right font-semibold">Energy/yr</th>
                </tr>
              </thead>
              <tbody>
                {filteredRanking.map((r: Row) => (
                  <tr
                    key={r.slug}
                    className={`transition-colors ${
                      r.rank === 1
                        ? "bg-emerald-500/[0.06] font-semibold"
                        : "border-t border-border/60 hover:bg-parchment/40"
                    }`}
                  >
                    <td className="py-2.5 pr-3 tabular-nums text-muted">{r.rank}</td>
                    <td className="py-2.5 pr-3">
                      <span className="flex items-center gap-2">
                        <span className="text-ink">{r.brand} {r.model}</span>
                        <Badge tone={r.type === "ev" ? "ev" : "hybrid"}>{r.type === "ev" ? "EV" : "Hybrid"}</Badge>
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-muted">{r.body || "—"}</td>
                    <td className="py-2.5 pr-3 tabular-nums text-ink">{r.topsis_score.toFixed(3)}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-ink">RM{r.price_rm.toLocaleString()}</td>
                    <td className="py-2.5 text-right tabular-nums text-muted">RM{r.running_cost_rm_yr.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredRanking.length === 0 && (
            <p className="mt-4 text-[13px] text-muted">
              {t("r.noMatch")}
            </p>
          )}
          <p className="mt-4 text-[12px] leading-relaxed text-muted">
            <b className="text-ink">Energy/yr</b> is the fuel and electricity cost of driving your
            stated mileage for a year — petrol for hybrids, charging for EVs, blended for PHEVs. It
            excludes servicing, insurance, road tax and depreciation, which are counted separately
            in the 10-year cost of ownership.
          </p>
        </DashboardCard>

        {/* Criteria Breakdown */}
        <DashboardCard
          label={`Criteria — ${top ? `${top.brand} ${top.model}` : ""}`}
          icon={<Calculator className="h-4 w-4" />}
          isOpen={!!open.criteria}
          onClick={() => toggle("criteria")}
        >
          {top && (
            <div className="mt-4 space-y-4">
              {CRITERIA.map(({ key, label, icon: Icon, accent }) => {
                const value = Math.round(top[key] as number);
                return (
                  <div key={key} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-[13px] text-muted">
                        <Icon className={`h-3.5 w-3.5 ${accent}`} />
                        {label}
                      </span>
                      <span className="figure text-[14px] text-ink">{value}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[#e8e8ed]">
                      <div
                        className="h-full rounded-full transition-all duration-700 ease-out"
                        style={{
                          width: `${value}%`,
                          background: `linear-gradient(90deg, var(--color-primary), var(--color-emerald-500, #10b981))`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DashboardCard>

        {/* Battery Age Visualiser */}
        <DashboardCard
          label="Battery-age visualiser"
          icon={<BatteryWarning className="h-4 w-4" />}
          isOpen={!!open.battery}
          onClick={() => toggle("battery")}
        >
          <div className="mt-4">
            <div className="flex items-center justify-between text-[14px]">
              <span className="text-muted">{t("r.assumed")}</span>
              <span className="figure text-ink">{batteryAge} yrs</span>
            </div>
            <input
              type="range"
              min={0}
              max={15}
              step={1}
              className="slider mt-3"
              aria-label={t("r.batteryAge")}
              value={batteryAge}
              onChange={(e) => setBatteryAge(Number(e.target.value))}
            />
            <div className="mt-4 flex items-start gap-3 rounded-[16px] border border-amber-300/40 bg-amber-50/60 p-4">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-amber-500/15">
                <BatteryWarning className="h-4 w-4 text-amber-700" />
              </span>
              <p className="text-[13px] leading-relaxed text-ink">{batteryWarning.text}</p>
            </div>
            <button
              onClick={() => router.push(`/chat/${token}?ask=battery`)}
              className="pressable tap-target mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-border bg-white px-5 py-3 text-[14px] font-medium text-ink transition-colors hover:bg-parchment/50 active:scale-[0.98]"
            >
              <MessageCircle className="h-4 w-4" /> {t("r.askbat")}
            </button>
          </div>
        </DashboardCard>

        {/* AI Trade-off Notes */}
        {rec?.tradeoffs && (
          <DashboardCard
            label="AI trade-off notes"
            icon={<CheckCircle2 className="h-4 w-4" />}
            isOpen={!!open.tradeoffs}
            onClick={() => toggle("tradeoffs")}
          >
            <ul className="mt-4 space-y-3">
              {rec.tradeoffs.map((t: string, i: number) => (
                <li key={i} className="flex items-start gap-3 text-[13px] leading-relaxed text-muted">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-500/10">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </DashboardCard>
        )}
      </section>

      {/* ── Bottom Spacer ─────────────────────────────────────────────── */}
      <div className="h-8" />

      {/* ── PDF Modal ─────────────────────────────────────────────────── */}
      {showPdf && (
        <div
          className="fixed inset-0 z-50 grid place-items-end sm:place-items-center bg-black/40 backdrop-blur-md supports-[backdrop-filter]:bg-black/30"
          onClick={() => setShowPdf(false)}
        >
          <div
            className="w-full max-w-md rounded-t-[28px] sm:rounded-[28px] border-t sm:border border-white/20 bg-white/95 p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6 shadow-2xl backdrop-blur-xl enter-rise"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="apple-display-2 text-[22px] text-ink">{t("r.emailT")}</h2>
              <button
                className="tap-target -mr-2 grid h-10 w-10 place-items-center rounded-full bg-parchment/60 text-muted transition-colors hover:bg-parchment hover:text-ink cursor-pointer"
                onClick={() => setShowPdf(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
              {t("r.emailSub")}
            </p>
            <input
              type="email"
              inputMode="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-5 w-full rounded-[16px] border border-border bg-parchment/40 px-4 py-3.5 text-[15px] text-ink outline-none placeholder:text-line-strong/70 focus:border-primary/50 focus:bg-white transition-colors"
            />
            {emailError && <p className="mt-2 text-[13px] font-medium text-red-600">{emailError}</p>}
            <button
              disabled={pdfBusy || !email.includes("@")}
              onClick={async () => {
                setEmailError("");
                if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
                  setEmailError("That doesn't look like an email address.");
                  return;
                }
                await sendReport();
              }}
              className="pressable tap-target mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3.5 text-[15px] font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary-hover active:bg-primary-hover disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
            >
              {pdfBusy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Sending…
                </>
              ) : (
                "Send report"
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── PDF Sent Toast ────────────────────────────────────────────── */}
      {pdfSent && (
        <div className="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 flex items-start gap-3 rounded-[20px] bg-pine-deep px-5 py-4 text-white shadow-2xl shadow-black/20 enter-rise">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-500/20 ring-1 ring-emerald-500/30">
            <Leaf className="h-4 w-4 text-emerald-400" />
          </span>
          <div>
            <p className="text-[15px] font-semibold">
              {pdfSent.first ? "Report sent" : "Re-sent to the bound address"}
            </p>
            <p className="text-[13px] text-white/60">The PDF went to {pdfSent.email}.</p>
          </div>
        </div>
      )}
    </main>
  );
}

/* ── Dashboard Card (Double-Bezel) ─────────────────────────────────────── */
function DashboardCard({
  label,
  icon,
  children,
  isOpen,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  isOpen: boolean;
  onClick?: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-[20px] sm:rounded-[22px] border border-white/40 bg-white/70 backdrop-blur-sm shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all hover:shadow-md">
      <button
        className="tap-target flex w-full items-center gap-3 px-4 sm:px-5 py-3.5 sm:py-4 text-left cursor-pointer"
        onClick={onClick}
      >
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors ${isOpen ? "bg-primary text-white" : "bg-parchment/80 text-muted"}`}>
          {icon}
        </span>
        <span className="text-[15px] font-semibold text-ink flex-1">{label}</span>
        <span className="tap-target grid h-11 w-11 shrink-0 place-items-center rounded-full bg-parchment/60 text-muted">
          <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
        </span>
      </button>
      {isOpen && <div className="border-t border-border/60 px-5 pb-5">{children}</div>}
    </div>
  );
}
