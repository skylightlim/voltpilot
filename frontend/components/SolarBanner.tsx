"use client";

import Link from "next/link";
import { MessageCircle, Sun } from "lucide-react";
import type { SolarEstimate } from "@/lib/api";
import { askHref } from "@/lib/ask";
import { useT, type StrKey } from "@/lib/i18n";

/** The solar banner on /results and /recommendation, shown only when the buyer
 *  is considering solar AND can charge at home.
 *
 *  The figures are backend/app/services/solar.py: a reference household billed
 *  on TNB's arithmetic under Solar ATAP, with panels alone and with a battery.
 *  Whether the battery line says "worth it" or "for backup" is decided by its
 *  computed payback against the battery's own life, never assumed. */

// A home battery's warranty is about ten years; past fifteen it is not paying
// for itself on the bill within any life it will have.
const BATTERY_PAYS_YEARS = 15;

const rm = (n: number) => `RM${Math.round(n).toLocaleString("en-MY")}`;

/** Splits a translated template on its {placeholders} so each figure stays
 *  bold wherever the language puts it. */
function Filled({ template, values }: { template: string; values: Record<string, string> }) {
  return (
    <>
      {template.split(/(\{[a-z]+\})/).map((part, i) =>
        part in values ? (
          <span key={i} className="font-semibold text-ink">
            {values[part]}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

export function SolarBanner({ solar, token }: { solar: SolarEstimate; token: string }) {
  const t = useT();
  if (!solar?.payback_years) return null;

  const b = solar.battery;
  const batteryPays = b?.payback_years != null && b.payback_years <= BATTERY_PAYS_YEARS;
  const batteryKey: StrKey = batteryPays ? "r.solarBatteryYes" : "r.solarBatteryNo";
  const perYear = t("r.perYear");

  return (
    <div className="group relative overflow-hidden rounded-lg border border-amber-300/40 bg-gradient-to-br from-[#fffbeb] via-[#fef3c7] to-[#fff9ec] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] sm:p-6">
      <div className="absolute inset-0 rounded-lg ring-1 ring-inset ring-amber-500/[0.08]" />
      <div className="relative flex items-start gap-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-amber-500/15 ring-1 ring-amber-500/25">
          <Sun className="h-5 w-5 text-amber-700" />
        </span>
        <div className="min-w-0">
          <p className="text-[16px] font-semibold text-ink">{t("r.solar")}</p>
          <p className="mt-1 text-[16px] leading-relaxed text-muted">
            <Filled
              template={t("r.solarBody")}
              values={{
                "{kw}": `${solar.system_kw_peak} kW`,
                "{capex}": rm(solar.capex_rm),
                "{savings}": `~${rm(solar.savings_rm_per_year)}${perYear}`,
                "{payback}": t("r.solarPayback", { n: solar.payback_years }),
              }}
            />
          </p>
          {b && (
            <p className="mt-2 text-[15px] leading-relaxed text-muted">
              <Filled
                template={t(batteryKey)}
                values={{
                  "{kwh}": `${b.kwh} kWh`,
                  "{bcapex}": rm(b.capex_rm),
                  "{bsavings}": `${rm(b.extra_savings_rm_per_year)}${perYear}`,
                  "{bpayback}": t("r.solarPayback", { n: b.payback_years ?? 0 }),
                }}
              />
            </p>
          )}
          <Link
            href={askHref(token, t("ask.solar"))}
            className="tap-target mt-3 inline-flex items-center gap-1.5 text-[15px] font-medium text-amber-800 underline-offset-2 hover:underline"
          >
            <MessageCircle className="h-4 w-4" /> {t("r.solarAsk")}
          </Link>
        </div>
      </div>
    </div>
  );
}
