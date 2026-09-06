"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Battery,
  CheckCircle2,
  ChevronDown,
  Gauge,
  Leaf,
  Route,
  ShieldCheck,
  Sparkles,
  Wallet,
  Zap,
  Cpu,
  Layers,
  Scale,
  Compass,
} from "lucide-react";
import { Badge, Button, Card, Footer, Navbar, SectionLabel } from "@/components/ui";
import { PartnerMarquee } from "@/components/PartnerMarquee";
import { SupportingInitiatives } from "@/components/SupportingInitiatives";
import {
  CountUp,
  Parallax,
  Reveal,
  ScrollMarquee,
  ScrollRefresh,
  ScrubCount,
  ScrubReveal,
  ScrubStagger,
  Stagger,
} from "@/components/motion";
import { Hero } from "@/components/animated-hero";
import { useT, type StrKey } from "@/lib/i18n";

type BenchmarkCar = {
  name: string;
  variant: string;
  type: "ev" | "hybrid";
  priceRm: number;
  rangeKm: number;
  homeChargeHours: number;
  runningCostYr: number;
  topsisScore: number;
  category: "under100k" | "mainstream" | "premium";
};

const BENCHMARK_MODELS: BenchmarkCar[] = [
  {
    name: "Dongfeng Box",
    variant: "E2 Pro EV",
    type: "ev",
    priceRm: 100700,
    rangeKm: 430,
    homeChargeHours: 6.5,
    runningCostYr: 1580,
    topsisScore: 9.5,
    category: "mainstream",
  },
  {
    name: "Wuling Bingo",
    variant: "Premium Range EV",
    type: "ev",
    priceRm: 99800,
    rangeKm: 410,
    homeChargeHours: 5.5,
    runningCostYr: 1420,
    topsisScore: 9.4,
    category: "under100k",
  },
  {
    name: "BYD Dolphin",
    variant: "Dynamic Standard EV",
    type: "ev",
    priceRm: 100530,
    rangeKm: 410,
    homeChargeHours: 6.2,
    runningCostYr: 1610,
    topsisScore: 9.3,
    category: "mainstream",
  },
  {
    name: "Toyota Corolla Cross",
    variant: "1.8 Hybrid HEV",
    type: "hybrid",
    priceRm: 143000,
    rangeKm: 850,
    homeChargeHours: 0,
    runningCostYr: 3840,
    topsisScore: 9.2,
    category: "mainstream",
  },
  {
    name: "Honda City",
    variant: "1.5 e:HEV RS Hybrid",
    type: "hybrid",
    priceRm: 111900,
    rangeKm: 820,
    homeChargeHours: 0,
    runningCostYr: 3420,
    topsisScore: 9.2,
    category: "mainstream",
  },
  {
    name: "Chery Omoda E5",
    variant: "Long Range EV",
    type: "ev",
    priceRm: 146800,
    rangeKm: 430,
    homeChargeHours: 7.0,
    runningCostYr: 1740,
    topsisScore: 9.2,
    category: "mainstream",
  },
  {
    name: "Tesla Model 3",
    variant: "RWD Highland EV",
    type: "ev",
    priceRm: 189000,
    rangeKm: 513,
    homeChargeHours: 7.5,
    runningCostYr: 1980,
    topsisScore: 9.1,
    category: "premium",
  },
  {
    name: "BYD Seal",
    variant: "Premium Extended EV",
    type: "ev",
    priceRm: 179800,
    rangeKm: 570,
    homeChargeHours: 8.5,
    runningCostYr: 2150,
    topsisScore: 9.1,
    category: "premium",
  },
];

export default function LandingPage() {
  const t = useT();
  const [filterType, setFilterType] = useState<"all" | "ev" | "hybrid" | "under100k" | "premium">("all");
  const [showAll, setShowAll] = useState(false);
  const PREVIEW_COUNT = 6;

  const filteredCars = BENCHMARK_MODELS.filter((car) => {
    if (filterType === "all") return true;
    if (filterType === "ev") return car.type === "ev";
    if (filterType === "hybrid") return car.type === "hybrid";
    if (filterType === "under100k") return car.priceRm <= 105000;
    if (filterType === "premium") return car.category === "premium";
    return true;
  });

  return (
    <main className="min-h-[100svh] bg-background">
      <ScrollRefresh />
      <Navbar />

      {/* Hero Section */}
      <Hero />

      {/* Trust & Telemetry Strip */}
      <section className="border-y border-line bg-paper-2">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Stagger className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-line">
            <div className="px-6 py-8 sm:py-10 text-center">
              <p className="apple-display text-[38px] sm:text-[44px] text-ink font-bold">
                <ScrubCount value={184} />
              </p>
              <p className="mx-auto mt-1 max-w-[240px] text-[13px] text-muted">
                {t("ts.count.sub")}
              </p>
            </div>

            <div className="px-6 py-8 sm:py-10 text-center">
              <p className="apple-display text-[38px] sm:text-[44px] text-primary font-bold">
                10 Years
              </p>
              <p className="mx-auto mt-1 max-w-[240px] text-[13px] text-muted">
                {t("ts.yr.sub")}
              </p>
            </div>

            <div className="px-6 py-8 sm:py-10 text-center">
              <p className="apple-display text-[38px] sm:text-[44px] text-ink font-bold">
                JPJ & TNB
              </p>
              <p className="mx-auto mt-1 max-w-[240px] text-[13px] text-muted">
                {t("ts.rm.sub")}
              </p>
            </div>
          </Stagger>
        </div>
      </section>

      {/* Live Market Leaderboard Preview */}
      <section id="cars" className="mx-auto max-w-6xl px-4 sm:px-6 py-20 sm:py-28">
        <Reveal>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <SectionLabel>{t("lr.label")}</SectionLabel>
              <h2 className="apple-display mt-2 text-[32px] sm:text-[42px] text-ink font-bold">
                {t("lr.title")}
              </h2>
              <p className="mt-2.5 max-w-2xl text-[15px] text-muted leading-relaxed">
                {t("lr.sub")}
              </p>
            </div>

            {/* Filter Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-2xl bg-parchment border border-line self-start md:self-auto">
              <button
                onClick={() => setFilterType("all")}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  filterType === "all" ? "bg-primary text-white shadow-xs" : "text-muted hover:text-ink"
                }`}
              >
                {t("lr.all")}
              </button>
              <button
                onClick={() => setFilterType("ev")}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  filterType === "ev" ? "bg-primary text-white shadow-xs" : "text-muted hover:text-ink"
                }`}
              >
                {t("lr.ev")}
              </button>
              <button
                onClick={() => setFilterType("hybrid")}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  filterType === "hybrid" ? "bg-primary text-white shadow-xs" : "text-muted hover:text-ink"
                }`}
              >
                {t("lr.hybrid")}
              </button>
              <button
                onClick={() => setFilterType("under100k")}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  filterType === "under100k" ? "bg-primary text-white shadow-xs" : "text-muted hover:text-ink"
                }`}
              >
                {t("lr.under100k")}
              </button>
            </div>
          </div>
        </Reveal>

        {/* Model Cards Grid */}
        <ScrubStagger className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" selector="> div">
          {(showAll ? filteredCars : filteredCars.slice(0, PREVIEW_COUNT)).map((car, idx) => (
            <div
              key={car.name + car.variant}
              className="rounded-[22px] border border-line bg-white p-5 card-highlight hover:border-primary/40 transition-all group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <Badge tone={car.type === "ev" ? "ev" : "hybrid"}>
                    {car.type === "ev" ? "100% Electric" : "Full Hybrid"}
                  </Badge>
                  <span className="font-mono text-[11px] text-muted font-bold">#{idx + 1}</span>
                </div>

                <div className="mt-4">
                  <h3 className="font-display text-[18px] font-bold text-ink group-hover:text-primary transition-colors">
                    {car.name}
                  </h3>
                  <p className="text-[12px] text-muted">{car.variant}</p>
                </div>

                <div className="mt-4 pt-3 border-t border-line/60 grid grid-cols-2 gap-2 text-[12px]">
                  <div>
                    <span className="text-muted text-[11px] block">OTR Price</span>
                    <span className="font-mono font-bold text-ink text-[13px]">
                      RM {car.priceRm.toLocaleString("en-MY")}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted text-[11px] block">Range (WLTP)</span>
                    <span className="font-mono font-bold text-primary text-[13px]">
                      {car.rangeKm} km
                    </span>
                  </div>
                  <div>
                    <span className="text-muted text-[11px] block">Running / yr</span>
                    <span className="font-mono font-medium text-emerald-800 text-[12px]">
                      RM {car.runningCostYr.toLocaleString("en-MY")}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted text-[11px] block">Home Charge</span>
                    <span className="font-mono font-medium text-ink text-[12px]">
                      {car.homeChargeHours > 0 ? `${car.homeChargeHours} hrs` : "N/A"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-line flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase text-muted">Fit Rating</span>
                <span className="figure text-[18px] font-bold text-primary">{car.topsisScore.toFixed(1)} / 10</span>
              </div>
            </div>
          ))}
        </ScrubStagger>

        {filteredCars.length > PREVIEW_COUNT && (
          <div className="mt-8 flex justify-center">
            <button
              onClick={() => setShowAll((v) => !v)}
              className="tap-target rounded-full border border-line-strong bg-paper-2 px-6 py-2.5 font-mono text-[12px] font-semibold uppercase tracking-wider text-ink transition-colors hover:border-primary hover:text-primary cursor-pointer"
            >
              {showAll
                ? t("lr.showLess")
                : t("lr.showAll").replace("{n}", String(filteredCars.length))}
            </button>
          </div>
        )}

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl bg-pine-tint p-5 border border-pine/20">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary grid place-items-center text-white shrink-0">
              <Compass className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[14px] font-bold text-primary">Need exact math for your personal commute?</p>
              <p className="text-[12px] text-ink/70">
                Our 5 decision engines rank all 184 Malaysian models tailored to your daily route and charging access.
              </p>
            </div>
          </div>
          <Link href="/interview/form" className="shrink-0 w-full sm:w-auto">
            <Button variant="primary" size="md" className="w-full sm:w-auto">
              <span>{t("lr.cta")}</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Scroll-linked claim band. Choreography borrowed from the reference
          site; copy is factual and verifiable, not brand noise (DESIGN.md §2).
          aria-hidden because every claim here is stated in full elsewhere on
          the page — a screen reader should not hear it three times. */}
      <section className="border-y border-pine/25 bg-pine-deep py-7 sm:py-9">
        <ScrollMarquee distance={260} repeat={3}>
          {(["mq.a", "mq.b", "mq.c", "mq.d"] as const).map((k) => (
            <span key={k} className="flex items-center gap-10">
              <span className="apple-display whitespace-nowrap text-[26px] sm:text-[38px] font-bold text-pearl">
                {t(k)}
              </span>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber" />
            </span>
          ))}
        </ScrollMarquee>
      </section>

      {/* Five Decision Engines Bento Grid */}
      <section id="method" className="border-t border-line bg-parchment/60 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <SectionLabel>{t("hw.label")}</SectionLabel>
            <h2 className="apple-display mt-2 text-[32px] sm:text-[42px] text-ink font-bold">
              {t("hw.title")}
            </h2>
            <p className="mt-2.5 max-w-2xl text-[15px] text-muted leading-relaxed">
              We evaluate every car through 5 specialized domain engines before synthesizing with TOPSIS multi-criteria optimization.
            </p>
          </Reveal>

          <ScrubStagger className="mt-12 grid grid-cols-1 md:grid-cols-12 gap-5" selector="> div">
            {/* Bento Card 1: TCO Engine */}
            <div className="md:col-span-7 rounded-[26px] border border-line bg-white p-7 card-highlight flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-pine-tint text-primary">
                    <Wallet className="h-5 w-5" />
                  </div>
                  <span className="mono-label text-primary bg-pine-tint px-2.5 py-1 rounded-md border border-pine/15">
                    Engine 01
                  </span>
                </div>
                <h3 className="font-display text-[22px] font-bold text-ink mt-5">
                  {t("eng.e1t")}
                </h3>
                <p className="text-[14px] text-muted mt-2 leading-relaxed">
                  {t("eng.e1d")}
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-line/60 flex flex-wrap gap-2">
                <span className="rounded-full bg-paper-2 border border-line px-3 py-1 text-xs font-medium text-ink">
                  OTR Registration
                </span>
                <span className="rounded-full bg-paper-2 border border-line px-3 py-1 text-xs font-medium text-ink">
                  TNB Off-Peak Tariff
                </span>
                <span className="rounded-full bg-paper-2 border border-line px-3 py-1 text-xs font-medium text-ink">
                  10-Year Insurance
                </span>
              </div>
            </div>

            {/* Bento Card 2: Range & Commute Engine */}
            <div className="md:col-span-5 rounded-[26px] border border-line bg-white p-7 card-highlight flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
                    <Gauge className="h-5 w-5" />
                  </div>
                  <span className="mono-label text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                    Engine 02
                  </span>
                </div>
                <h3 className="font-display text-[22px] font-bold text-ink mt-5">
                  {t("eng.e2t")}
                </h3>
                <p className="text-[14px] text-muted mt-2 leading-relaxed">
                  {t("eng.e2d")}
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-line/60 flex flex-wrap gap-2">
                <span className="rounded-full bg-paper-2 border border-line px-3 py-1 text-xs font-medium text-ink">
                  Tropical WLTP Derating
                </span>
                <span className="rounded-full bg-paper-2 border border-line px-3 py-1 text-xs font-medium text-ink">
                  Highway Speed Drag
                </span>
              </div>
            </div>

            {/* Bento Card 3: JPJ Road Tax Engine */}
            <div className="md:col-span-4 rounded-[26px] border border-line bg-white p-7 card-highlight flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-800">
                    <Scale className="h-5 w-5" />
                  </div>
                  <span className="mono-label text-amber-800 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200">
                    Engine 03
                  </span>
                </div>
                <h3 className="font-display text-[20px] font-bold text-ink mt-5">
                  {t("eng.e3t")}
                </h3>
                <p className="text-[13px] text-muted mt-2 leading-relaxed">
                  {t("eng.e3d")}
                </p>
              </div>

              <div className="mt-5 pt-3 border-t border-line/60">
                <span className="text-[11px] font-mono uppercase text-muted">JPJ Lampiran B Formula</span>
              </div>
            </div>

            {/* Bento Card 4: Charging Infrastructure Grid */}
            <div className="md:col-span-4 rounded-[26px] border border-line bg-white p-7 card-highlight flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-50 text-cyan-800">
                    <Zap className="h-5 w-5" />
                  </div>
                  <span className="mono-label text-cyan-800 bg-cyan-50 px-2.5 py-1 rounded-md border border-cyan-200">
                    Engine 04
                  </span>
                </div>
                <h3 className="font-display text-[20px] font-bold text-ink mt-5">
                  {t("eng.e4t")}
                </h3>
                <p className="text-[13px] text-muted mt-2 leading-relaxed">
                  {t("eng.e4d")}
                </p>
              </div>

              <div className="mt-5 pt-3 border-t border-line/60">
                <span className="text-[11px] font-mono uppercase text-muted">PLUS Expressway Corridors</span>
              </div>
            </div>

            {/* Bento Card 5: Battery & Resale Engine */}
            <div className="md:col-span-4 rounded-[26px] border border-line bg-white p-7 card-highlight flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-800">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <span className="mono-label text-slate-800 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
                    Engine 05
                  </span>
                </div>
                <h3 className="font-display text-[20px] font-bold text-ink mt-5">
                  {t("eng.e5t")}
                </h3>
                <p className="text-[13px] text-muted mt-2 leading-relaxed">
                  {t("eng.e5d")}
                </p>
              </div>

              <div className="mt-5 pt-3 border-t border-line/60">
                <span className="text-[11px] font-mono uppercase text-muted">Used Market Telemetry</span>
              </div>
            </div>
          </ScrubStagger>
        </div>
      </section>

      {/* 3-Step Process */}
      <section id="how" className="mx-auto max-w-6xl px-4 sm:px-6 py-20 sm:py-28">
        <Reveal>
          <SectionLabel>{t("hw.label")}</SectionLabel>
          <h2 className="apple-display mt-2 text-[32px] sm:text-[42px] text-ink font-bold">
            How VoltPilot works.
          </h2>
        </Reveal>

        <ScrubStagger className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6" selector="> div">
          <div className="rounded-[22px] border border-line bg-white p-6 card-highlight">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white font-mono font-bold text-sm">
              01
            </div>
            <h3 className="font-display text-[18px] font-bold text-ink mt-4">{t("hw.s1t")}</h3>
            <p className="text-[14px] text-muted mt-2 leading-relaxed">{t("hw.s1b")}</p>
          </div>

          <div className="rounded-[22px] border border-line bg-white p-6 card-highlight">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white font-mono font-bold text-sm">
              02
            </div>
            <h3 className="font-display text-[18px] font-bold text-ink mt-4">{t("hw.s2t")}</h3>
            <p className="text-[14px] text-muted mt-2 leading-relaxed">{t("hw.s2b")}</p>
          </div>

          <div className="rounded-[22px] border border-line bg-white p-6 card-highlight">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white font-mono font-bold text-sm">
              03
            </div>
            <h3 className="font-display text-[18px] font-bold text-ink mt-4">{t("hw.s3t")}</h3>
            <p className="text-[14px] text-muted mt-2 leading-relaxed">{t("hw.s3b")}</p>
          </div>
        </ScrubStagger>
      </section>

      <PartnerMarquee />

      <SupportingInitiatives />

      {/* FAQ Section */}
      <section id="faq" className="border-t border-line py-20 sm:py-28">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <Reveal>
            <SectionLabel>{t("faq.label")}</SectionLabel>
            <h2 className="apple-display mt-2 text-[32px] sm:text-[42px] text-ink font-bold">
              {t("faq.title")}
            </h2>
          </Reveal>

          <Stagger className="mt-10 space-y-3.5" selector="> details">
            {([
              ["faq.q1", "faq.a1"],
              ["faq.q2", "faq.a2"],
              ["faq.q3", "faq.a3"],
              ["faq.q4", "faq.a4"],
            ] as const).map(([qk, ak]) => (
              <details
                key={qk}
                className="group rounded-[20px] border border-line bg-white px-6 transition-all duration-200 card-highlight"
              >
                <summary className="flex cursor-pointer items-center justify-between py-5 text-[15px] sm:text-[16px] font-semibold text-ink select-none">
                  <span>{t(qk)}</span>
                  <ChevronDown className="h-4 w-4 text-muted transition-transform duration-200 group-open:rotate-180 shrink-0 ml-4" />
                </summary>
                <p className="pb-5 text-[14px] leading-relaxed text-muted border-t border-line/40 pt-3">
                  {t(ak)}
                </p>
              </details>
            ))}
          </Stagger>
        </div>
      </section>

      <Footer />
    </main>
  );
}