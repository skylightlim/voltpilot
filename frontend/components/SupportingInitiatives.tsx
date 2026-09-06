"use client";

import { ArrowRight } from "lucide-react";
import { SectionLabel } from "@/components/ui";
import { Reveal, Stagger } from "@/components/motion";
import { useT, type StrKey } from "@/lib/i18n";

type Initiative = { key: "netr" | "nem" | "tnb"; href: string; logo: string; alt: string };

const INITIATIVES: Initiative[] = [
  {
    key: "netr",
    href: "https://www.mida.gov.my/national-energy-transition-roadmap-netr-charting-a-path-to-a-sustainable-energy-landscape/",
    logo: "/initiatives/ministry_of_economy_logo.png",
    alt: "Ministry of Economy logo",
  },
  {
    key: "nem",
    href: "https://www.seda.gov.my/reportal/nem/",
    logo: "/initiatives/seda_malaysia_logo.png",
    alt: "SEDA Malaysia logo",
  },
  {
    key: "tnb",
    href: "https://tnbelectron.com.my/",
    logo: "/initiatives/tnb_electron_logo.png",
    alt: "TNB Electron logo",
  },
];

const SDGS = [
  { key: "sdg11", logo: "/initiatives/sdg_city_logo.png" },
  { key: "sdg7", logo: "/initiatives/sdg_energy_logo.png" },
] as const;

export function SupportingInitiatives() {
  const t = useT();
  return (
    <section id="initiatives" className="border-t border-line bg-paper-2 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="text-center">
          <SectionLabel>{t("si.label")}</SectionLabel>
          <h2 className="apple-display mt-2 text-[32px] font-bold text-ink sm:text-[42px]">
            {t("si.title")}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">
            {t("si.sub")}
          </p>
        </Reveal>

        <Stagger className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" stagger={0.08}>
          {INITIATIVES.map((i) => (
            <a
              key={i.key}
              href={i.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col rounded-[20px] border border-line bg-white p-7 transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-md card-highlight"
            >
              {/* fixed band so a wide wordmark and a square crest read at the
                  same visual weight instead of one shrinking to fit max-width */}
              <div className="flex h-16 items-center">
                <img
                  src={i.logo}
                  alt={i.alt}
                  loading="lazy"
                  className="max-h-16 w-auto max-w-[150px] object-contain object-left"
                />
              </div>
              <h3 className="mt-5 text-[18px] font-bold leading-snug text-ink">
                {t(`si.${i.key}.t` as StrKey)}
              </h3>
              <p className="mt-2 flex-1 text-[14px] leading-relaxed text-muted">
                {t(`si.${i.key}.d` as StrKey)}
              </p>
              <span className="mt-5 inline-flex items-center gap-1.5 text-[14px] font-bold text-primary">
                {t(`si.${i.key}.cta` as StrKey)}
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1" />
              </span>
            </a>
          ))}
        </Stagger>

        {/* UN goals this platform reports against */}
        <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
          {SDGS.map((s) => (
            <div
              key={s.key}
              className="flex items-center gap-3.5 rounded-[16px] border border-line bg-parchment/60 px-5 py-3.5"
            >
              <img
                src={s.logo}
                alt={t(`si.${s.key}.t` as StrKey)}
                loading="lazy"
                className="h-12 w-12 shrink-0 object-contain"
              />
              <div>
                <strong className="block text-[14px] font-bold text-ink">
                  {t(`si.${s.key}.t` as StrKey)}
                </strong>
                <span className="text-[12.5px] text-muted">{t(`si.${s.key}.d` as StrKey)}</span>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-7 text-center text-[13px] text-muted">
          {t("si.source")}{" "}
          <a
            href="https://www.carbase.my/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-primary underline-offset-2 hover:underline"
          >
            carBase.my
          </a>
          .
        </p>
      </div>
    </section>
  );
}
