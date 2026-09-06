"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button, Footer, Navbar, SectionLabel } from "@/components/ui";
import {
  ScrollRefresh,
  ScrubCount,
  ScrubReveal,
  ScrubStagger,
} from "@/components/motion";
import { useT, type StrKey } from "@/lib/i18n";

/* Documents the SHIPPING implementation, which is the current revision of the
   framework: 184 trims and six TOPSIS criteria driven by four user sliders.
   An earlier unrevised specification described 108 vehicles and three criteria
   (money / environment / convenience) plus a payback screen; that revision was
   superseded and is deliberately not what this page describes.
   Notation is never translated — see the i18n note on the "me.*" block. */

type Step = {
  key: StrKey;
  body: StrKey;
  eq?: string;
  formula?: string;
};

const STEPS: Step[] = [
  { key: "me.s1", body: "me.s1d" },
  { key: "me.s2", body: "me.s2d" },
  { key: "me.s3", body: "me.s3d", eq: "20 km · 5 points" },
  { key: "me.s4", body: "me.s4d" },
  { key: "me.s5", body: "me.s5d" },
  { key: "me.s6", body: "me.s6d" },
  { key: "me.s7", body: "me.s7d" },
  { key: "me.s8", body: "me.s8d", eq: "6 criteria" },
];

const GRID = [
  { region: "Peninsular Malaysia", factor: 0.74 },
  { region: "Sabah", factor: 0.539 },
  { region: "Sarawak", factor: 0.199 },
];

const TOPSIS_MATH = [
  { eq: "43", label: "Vector normalisation", f: "rᵢⱼ = xᵢⱼ / √( Σᵢ xᵢⱼ² )" },
  { eq: "44", label: "Apply your weights", f: "vᵢⱼ = wⱼ × rᵢⱼ" },
  { eq: "46", label: "Ideal solution", f: "A⁺ = { min v_money , min v_env , max v_conv }" },
  { eq: "47", label: "Anti-ideal solution", f: "A⁻ = { max v_money , max v_env , min v_conv }" },
  { eq: "48", label: "Distance to ideal", f: "Dᵢ⁺ = √[ Σⱼ ( vᵢⱼ − vⱼ⁺ )² ]" },
  { eq: "49", label: "Distance to anti-ideal", f: "Dᵢ⁻ = √[ Σⱼ ( vᵢⱼ − vⱼ⁻ )² ]" },
];

const SOURCES = [
  {
    n: 1,
    text: "Woody, M., Adderly, S. A., Bohra, R., & Keoleian, G. A. (2024). Electric and gasoline vehicle total cost of ownership across US cities. Journal of Industrial Ecology, 28(2), 194–215.",
    href: "https://doi.org/10.1111/jiec.13463",
  },
  {
    n: 2,
    text: "International Energy Agency (2026). Total cost of ownership difference between BEV and ICE cars, and BEV payback period.",
  },
  {
    n: 3,
    text: "Shahrimal, M. W., Idris, M., Yusuf, A. A., & Fattah, I. M. R. (2025). Electric vehicle life cycle assessment: life cycle emission and life cycle cost of various electric vehicles.",
    href: "https://stepxjournal.org/index.php/stepx/article/view/2",
  },
  {
    n: 4,
    text: "Yamada, T., & Akisawa, A. (2025). Evaluation of charging frequency for electric vehicles considering drivers' charging behaviours and high output chargers. International Journal of Electrical Power & Energy Systems, 170, 110955.",
    href: "https://doi.org/10.1016/j.ijepes.2025.110955",
  },
  {
    n: 5,
    text: "Solaratap Malaysia. Solar Calculator Malaysia 2026.",
    href: "https://solaratap.com.my/solar-calculator.html",
  },
  {
    n: 6,
    text: "Onn, C. C., et al. (2018). Greenhouse gas emissions associated with electric vehicle charging: the impact of electricity generation mix in a developing country. Transportation Research Part D, 64, 15–22. Malaysia-focused well-to-wheel evidence.",
    href: "https://doi.org/10.1016/j.trd.2017.06.018",
  },
  {
    n: 7,
    text: "Safiei, N. A., & Mohamed, N. (2025). A well-to-wheel analysis of greenhouse gas emissions for electric vehicle and internal combustion engine vehicle. Progress in Engineering Application and Technology, 6(1), 805–813.",
  },
  {
    n: 8,
    text: "Energy Commission Malaysia / Malaysia Energy Statistics (2026, provisional 2022–2024 data). Grid emission factors by region.",
  },
  {
    n: 9,
    text: "Champeecharoensuk, T., et al. (2025). Total cost of ownership analysis of electric vehicles in ASEAN. Energy for Sustainable Development, 85, 101650.",
    href: "https://doi.org/10.1016/j.esd.2024.101650",
  },
  {
    n: 10,
    text: "ERIA Study Team (2023), p. 64 — flat maintenance benchmark values used in the life-cycle cost section.",
  },
];

/** Equation set in mono at reading scale, with the spec's own number hung beside it. */
function Formula({ eq, children }: { eq?: string; children: React.ReactNode }) {
  return (
    <figure className="mt-4 overflow-x-auto rounded-xl border border-line bg-parchment/70 px-4 py-3">
      <div className="flex items-baseline gap-3">
        {eq && (
          <span className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-wider text-amber">
            {eq}
          </span>
        )}
        <code className="whitespace-nowrap font-mono text-[12.5px] leading-relaxed text-ink sm:text-[13.5px]">
          {children}
        </code>
      </div>
    </figure>
  );
}

export default function MethodologyPage() {
  const t = useT();

  return (
    <main className="min-h-[100svh] bg-background">
      <ScrollRefresh />
      <Navbar />

      {/* ---------- Thesis ---------- */}
      <section className="mx-auto max-w-3xl px-4 pb-14 pt-12 sm:px-6 sm:pb-20 sm:pt-16">
        <SectionLabel>{t("me.eyebrow")}</SectionLabel>
        <h1 className="apple-display mt-3 text-[38px] leading-[1.04] text-ink sm:text-[52px]">
          {t("me.t1")}
          <br />
          <span className="text-primary">{t("me.t2")}</span>
        </h1>
        <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-fog sm:text-[17px]">
          {t("me.sub")}
        </p>
      </section>

      {/* ---------- The three scored criteria ---------- */}
      <section className="border-y border-line bg-paper-2 py-14 sm:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <ScrubReveal>
            <h2 className="apple-display text-[26px] text-ink sm:text-[34px]">
              {t("me.critH")}
            </h2>
            <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted">
              {t("me.critSub")}
            </p>
          </ScrubReveal>

          <ScrubStagger className="mt-9 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" selector="> div">
            {(
              [
                ["me.c1", "me.c1d", "me.cost", "tco_excluding_rm", "0.24"],
                ["me.c2", "me.c2d", "me.benefit", "behaviour_score", "0.15"],
                ["me.c3", "me.c3d", "me.benefit", "infrastructure_score", "0.13"],
                ["me.c4", "me.c4d", "me.cost", "co2_kg_yr", "0.15"],
                ["me.c5", "me.c5d", "me.cost", "purchase_price_rm", "0.17"],
                ["me.c6", "me.c6d", "me.cost", "running_cost_rm_yr", "0.16"],
              ] as const
            ).map(([name, desc, dir, variable, weight]) => (
              <div
                key={name}
                className="rounded-[20px] border border-line bg-white p-5 card-highlight"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-display text-[19px] font-bold text-ink">{t(name)}</h3>
                  <span className="shrink-0 font-mono text-[11px] font-bold text-amber">{weight}</span>
                </div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{t(desc)}</p>
                <p className="mt-4 break-all border-t border-line/60 pt-3 font-mono text-[11px] text-primary">
                  {variable}
                </p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-fog">
                  {t(dir)} · {t("me.weight")}
                </p>
              </div>
            ))}
          </ScrubStagger>
        </div>
      </section>

      {/* ---------- The sequence. Numbering is earned here: the spec is explicit
           that the order is binding, so the rail encodes real dependency. ---------- */}
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
        <ScrubReveal>
          <h2 className="apple-display text-[26px] text-ink sm:text-[34px]">
            {t("me.stepsH")}
          </h2>
        </ScrubReveal>

        <ol className="mt-10 space-y-px">
          {STEPS.map((s, i) => (
            <ScrubReveal key={s.key} y={22}>
              <li className="group relative grid grid-cols-[2.75rem_1fr] gap-x-4 border-t border-line py-7 sm:grid-cols-[3.5rem_1fr] sm:gap-x-6">
                {/* rail marker — the vertical hairline is the spine of the sequence */}
                <div className="relative flex justify-center">
                  <span className="absolute inset-y-0 top-0 w-px bg-line" aria-hidden="true" />
                  <span className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full border border-line-strong bg-background font-mono text-[12px] font-bold text-primary transition-colors group-hover:border-primary">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>

                <div className="min-w-0">
                  <h3 className="font-display text-[19px] font-bold leading-snug text-ink sm:text-[21px]">
                    {t(s.key)}
                  </h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-muted sm:text-[15px]">
                    {t(s.body)}
                  </p>
                  {s.formula && <Formula eq={s.eq}>{s.formula}</Formula>}
                  {s.eq && !s.formula && (
                    <p className="mt-3 font-mono text-[10px] font-bold uppercase tracking-wider text-amber">
                      {s.eq}
                    </p>
                  )}
                </div>
              </li>
            </ScrubReveal>
          ))}
        </ol>
      </section>

      {/* ---------- Grid factors: the one place a number changes the answer ---------- */}
      <section className="border-y border-line bg-parchment/50 py-14 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <ScrubReveal>
            <h2 className="apple-display text-[24px] text-ink sm:text-[30px]">
              {t("me.gridH")}
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">{t("me.gridSub")}</p>
          </ScrubReveal>

          <ScrubStagger className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3" selector="> div">
            {GRID.map((g) => (
              <div
                key={g.region}
                className="rounded-[18px] border border-line bg-white px-5 py-6 text-center"
              >
                <p className="figure text-[34px] font-bold text-primary sm:text-[40px]">
                  <ScrubCount value={g.factor} decimals={3} />
                </p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-fog">
                  kg CO₂e / kWh
                </p>
                <p className="mt-3 border-t border-line/60 pt-3 text-[13px] font-semibold text-ink">
                  {g.region}
                </p>
              </div>
            ))}
          </ScrubStagger>
        </div>
      </section>

      {/* ---------- Signature: the maths as the hero, not the footnote ---------- */}
      <section className="bg-pine-deep py-16 sm:py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <ScrubReveal>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-amber">
              Step 08
            </p>
            <h2 className="apple-display mt-3 text-[26px] text-pearl sm:text-[34px]">
              {t("me.topsisH")}
            </h2>
            <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-pearl/70">
              {t("me.topsisSub")}
            </p>
          </ScrubReveal>

          <ScrubStagger className="mt-10 space-y-px" selector="> div" each={0.07}>
            {TOPSIS_MATH.map((m) => (
              <div
                key={m.eq}
                className="grid grid-cols-1 gap-1 border-t border-white/12 py-4 sm:grid-cols-[1fr_1.4fr] sm:gap-6"
              >
                <p className="font-mono text-[10px] uppercase tracking-wider text-pearl/50">
                  <span className="text-amber">Eq. {m.eq}</span> · {m.label}
                </p>
                <code className="overflow-x-auto whitespace-nowrap font-mono text-[13px] text-pearl sm:text-[14px]">
                  {m.f}
                </code>
              </div>
            ))}
          </ScrubStagger>

          {/* the closeness coefficient — the single number the whole page builds to */}
          <ScrubReveal y={26}>
            <div className="mt-10 rounded-[22px] border border-amber/30 bg-white/[0.04] px-5 py-8 text-center sm:px-8 sm:py-10">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-amber">
                Eq. 50 · Closeness coefficient
              </p>
              <code className="mt-5 block overflow-x-auto whitespace-nowrap font-mono text-[20px] font-bold text-pearl sm:text-[30px]">
                TOPSISᵢ = Dᵢ⁻ / ( Dᵢ⁺ + Dᵢ⁻ )
              </code>
              <div className="mt-7 flex flex-col items-center justify-center gap-2 border-t border-white/10 pt-5 text-[12px] text-pearl/60 sm:flex-row sm:gap-6">
                <span className="font-mono">{t("me.n1")}</span>
                <span className="hidden h-1 w-1 rounded-full bg-amber sm:block" aria-hidden="true" />
                <span className="font-mono">{t("me.n2")}</span>
              </div>
            </div>
          </ScrubReveal>
        </div>
      </section>

      {/* ---------- Sources ---------- */}
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
        <ScrubReveal>
          <h2 className="apple-display text-[24px] text-ink sm:text-[30px]">{t("me.srcH")}</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-muted">{t("me.srcSub")}</p>
        </ScrubReveal>

        <ScrubStagger className="mt-8" selector="> li" each={0.05}>
          <ol className="space-y-px">
            {SOURCES.map((s) => (
              <li
                key={s.n}
                className="grid grid-cols-[1.75rem_1fr] gap-3 border-t border-line py-4 text-[13px] leading-relaxed text-muted"
              >
                <span className="font-mono text-[11px] font-bold text-primary">
                  [{s.n}]
                </span>
                <p>
                  {s.text}
                  {s.href && (
                    <>
                      {" "}
                      <a
                        href={s.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-all font-mono text-[11px] text-primary underline underline-offset-2 hover:text-amber"
                      >
                        {s.href.replace("https://", "")}
                      </a>
                    </>
                  )}
                </p>
              </li>
            ))}
          </ol>
        </ScrubStagger>
      </section>

      {/* ---------- Back into the funnel ---------- */}
      <section className="border-t border-line bg-paper-2 py-14 sm:py-20">
        <div className="mx-auto flex max-w-3xl flex-col items-start gap-5 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="apple-display text-[22px] text-ink sm:text-[28px]">
              {t("me.ctaH")}
            </h2>
            <p className="mt-1.5 text-[14px] text-muted">{t("me.ctaB")}</p>
          </div>
          <Link href="/interview/form" className="w-full shrink-0 sm:w-auto">
            <Button variant="primary" size="lg" className="w-full sm:w-auto">
              <span>{t("hero.cta")}</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      <Footer />
    </main>
  );
}
