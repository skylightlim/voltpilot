"use client";

import { SectionLabel } from "@/components/ui";
import { Reveal } from "@/components/motion";
import { useT } from "@/lib/i18n";

type Partner = { name: string; href: string; logo: string };

const PARTNERS: Partner[] = [
  {
    name: "Bright Spot Energy",
    href: "https://brightspotsenergy.com/",
    logo: "/partners/brighspotenergy_logo.png",
  },
  { name: "Carsome", href: "https://www.carsome.my/", logo: "/partners/CARSOME_logo.png" },
  { name: "EvGuru", href: "https://www.evguru.com.my/", logo: "/partners/evguru_logo.png" },
  { name: "Proton", href: "https://www.proton.com/", logo: "/partners/proton_logo.png" },
  { name: "Trexon Energy", href: "https://trexon.my/", logo: "/partners/trexon_energy_logo.png" },
];

/** One pass of the logo row. The loop renders it twice; the copy is hidden
 *  from assistive tech so screen readers and tab order see each partner once. */
function Track({ duplicate = false }: { duplicate?: boolean }) {
  return (
    <div
      className="flex shrink-0 items-stretch gap-5 pr-5 sm:gap-6 sm:pr-6"
      aria-hidden={duplicate || undefined}
    >
      {PARTNERS.map((p) => (
        <a
          key={p.name}
          href={p.href}
          target="_blank"
          rel="noopener noreferrer"
          tabIndex={duplicate ? -1 : undefined}
          className="pressable flex min-w-[180px] flex-col items-center justify-center gap-3.5 rounded-lg border border-line bg-white px-7 py-6 transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-md sm:min-w-[210px]"
        >
          {/* wordmarks are wide, so give them a landscape box rather than a square */}
          <img
            src={p.logo}
            alt={duplicate ? "" : `${p.name} logo`}
            loading="lazy"
            className="h-12 w-auto max-w-[130px] object-contain sm:h-14"
          />
          <span className="text-center text-[16px] font-bold text-ink">{p.name}</span>
        </a>
      ))}
    </div>
  );
}

export function PartnerMarquee() {
  const t = useT();
  return (
    <section id="partners" className="border-t border-line bg-parchment py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="text-center">
          <SectionLabel>{t("pt.label")}</SectionLabel>
          <h2 className="apple-display mt-2 text-[32px] text-ink sm:text-[42px]">
            {t("pt.title")}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-[16px] leading-relaxed text-muted">
            {t("pt.sub")}
          </p>
        </Reveal>
      </div>

      {/* Full-bleed so the logos run off both edges instead of stopping at the grid. */}
      <div className="marquee-wrap relative mt-12 overflow-hidden py-2">
        <div className="marquee">
          <Track />
          <Track duplicate />
        </div>
        <div className="marquee-fade pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-parchment to-transparent sm:w-24" />
        <div className="marquee-fade pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-parchment to-transparent sm:w-24" />
      </div>
    </section>
  );
}
