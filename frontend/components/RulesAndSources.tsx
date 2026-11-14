"use client";

import { ArrowUpRight } from "lucide-react";
import { Reveal, ScrubStagger } from "@/components/motion";
import { useT } from "@/lib/i18n";

/* Malaysia's EV rules at a glance, and the official sources behind them.

   These sat in the site-wide footer, so every page ended on four regulatory
   figures and a list of government links. They are reference material for the
   method, so they now live on the Method & sources page (app/method), and the
   footer keeps only navigation and disclaimers.

   The markup is the footer's, light-only. DESIGN.md §1: hairline rules, not card
   soup. Amber is spent once, on the only figure with a deadline. The figures
   deliberately do NOT use ScrubCount: a scrub-bound counter rests wherever the
   scroll left it, and a road-tax figure caught mid-count reads as a wrong number.
   Entrance motion is opacity and transform only, which cannot render a false
   value, and every figure is in the DOM before JS runs. */

const FIGURES = [
  ["ft.s1v", "ft.s1l"],
  ["ft.s2v", "ft.s2l"],
  ["ft.s3v", "ft.s3l"],
  ["ft.s4v", "ft.s4l"],
] as const;

const RULES = [
  ["ft.reg1t", "ft.p1", "ft.reg1"],
  ["ft.reg2t", "ft.p2", "ft.reg2"],
  ["ft.reg3t", "ft.p3", "ft.reg3"],
  ["ft.reg4t", "ft.p4", "ft.reg4"],
] as const;

const OFFICIAL = [
  ["JPJ", "https://www.jpj.gov.my/", "ft.srcJpj"],
  ["myTNB", "https://www.mytnb.com.my/tariff/index.html", "ft.srcTnb"],
  ["MITI", "https://www.miti.gov.my/", "ft.srcMiti"],
  [
    "Suruhanjaya Tenaga",
    "https://www.st.gov.my/resources/guidelines-electric-vehicle-charging-system-evcs",
    "ft.srcSt",
  ],
  ["PLANMalaysia MEVnet", "https://www.planmalaysia.gov.my/mevnet/", "ft.srcPlan"],
] as const;

export function RulesAtAGlance() {
  const t = useT();
  return (
    <div>
      <ScrubStagger
        className="grid grid-cols-2 border-t border-line lg:grid-cols-4"
        selector="> div"
        y={18}
        each={0.07}
      >
        {FIGURES.map(([figure, label], i) => (
          <div
            key={label}
            className={`border-b border-line py-6 pr-6 lg:border-b-0 lg:py-7 ${
              i % 2 === 1 ? "border-l pl-6" : ""
            } lg:border-l lg:pl-6 lg:first:border-l-0 lg:first:pl-0`}
          >
            <p
              className={`figure text-[27px] leading-none ${
                // The CKD window is the one fact with an expiry the reader must act
                // on, so it carries the amber signal. Everything else stays pine.
                label === "ft.s4l" ? "text-amber" : "text-primary"
              }`}
            >
              {t(figure)}
            </p>
            <p className="mt-2.5 max-w-[22ch] text-[13px] leading-snug text-fog">{t(label)}</p>
          </div>
        ))}
      </ScrubStagger>

      <Reveal className="mt-12 grid gap-x-14 gap-y-11 sm:grid-cols-2" y={18}>
        {RULES.map(([title, prov, body]) => (
          <div key={title}>
            <h3 className="font-display text-[16px] font-semibold tracking-tight text-ink">
              {t(title)}
            </h3>
            <p className="t-caption mt-1 text-fog/80">{t(prov)}</p>
            <p className="mt-3 max-w-[54ch] text-[14.5px] leading-relaxed text-fog">{t(body)}</p>
          </div>
        ))}
      </Reveal>

      <p className="mt-10 max-w-[70ch] text-[13px] leading-relaxed text-fog">{t("ft.verified")}</p>
    </div>
  );
}

/** A ruled index. The name column is sized by the longest name via subgrid
 *  rather than a fixed width behind a breakpoint, so all three columns stay
 *  aligned at any width. */
export function OfficialSources() {
  const t = useT();
  return (
    <ul className="grid grid-cols-[max-content_1fr_auto] border-t border-line">
      {OFFICIAL.map(([name, href, label]) => (
        <li key={href} className="col-span-3 grid grid-cols-subgrid border-b border-line">
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="group col-span-3 grid min-h-12 grid-cols-subgrid items-center gap-x-5 py-3 text-[14px] text-ink/80 transition-colors hover:text-primary"
          >
            <span className="font-medium">{name}</span>
            <span className="text-fog">{t(label)}</span>
            <ArrowUpRight
              className="h-3.5 w-3.5 shrink-0 opacity-40 transition-transform duration-200 will-change-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-90 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0 motion-reduce:group-hover:translate-y-0"
              aria-hidden
            />
          </a>
        </li>
      ))}
    </ul>
  );
}
