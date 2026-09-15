"use client";

import { useState } from "react";
import { Check, ChevronDown, Circle } from "lucide-react";
import { CHOICE_LABELS, KILOMETRE_CHIPS, questionText, type IQuestion } from "@/lib/interview-script";
import { useT } from "@/lib/i18n";
import type { Profile } from "@/lib/api";
import { getPostcodeArea } from "@/lib/postcode";

/* Chip sets per number question — values must fit the field's real range
 * (backend schema: daily_km ≤ 2000, budget ≤ 1M RM). */
const CHIP_SETS: Record<string, { values: number[]; unit: "km" | "rm" }> = {
  daily_km: { values: [20, 40, 60, 100, 150], unit: "km" },
  long_trip_km: { values: [50, 100, 200, 300, 500], unit: "km" },
  budget_max_rm: { values: [100000, 150000, 200000, 250000, 300000], unit: "rm" },
};

/* Annual mileage is daily_km x trips_per_week x 52, and nothing shows a buyer
   that product. Reading question 1 as a weekly total turns 10,400 km a year
   into 52,000 — a 5x error on the multiplier behind every running-cost figure,
   invisible in the answer. Echoing the derived number makes an implausible one
   look implausible, the way the postcode already echoes a town name back.
   Not validation: 52,000 km a year is a real e-hailing figure. issue.md 19. */
const PLAUSIBLE_ANNUAL_KM = 40_000;

function AnnualEcho({ value }: { value: Profile }) {
  const t = useT();
  const daily = Number((value as Record<string, unknown>).daily_km) || 0;
  const days = Number((value as Record<string, unknown>).trips_per_week) || 0;
  if (daily <= 0 || days <= 0) return null;

  const km = Math.round(daily * days * 52);
  const key = km > PLAUSIBLE_ANNUAL_KM ? "iq.annualHigh" : "iq.annualHint";
  return (
    <p
      className={`mt-3 text-center text-[15px] leading-relaxed ${
        km > PLAUSIBLE_ANNUAL_KM ? "font-medium text-amber-700" : "text-muted"
      }`}
    >
      {t(key).replace("{km}", km.toLocaleString("en-MY"))}
    </p>
  );
}

export default function QInput({
  q,
  value,
  set,
  lang,
}: {
  q: IQuestion;
  value: Profile;
  set: (patch: Partial<Profile>) => void;
  lang: "en" | "bm";
}) {
  const t = useT();
  const v = (value as Record<string, unknown>)[q.key];
  const numeric = (n: unknown) => (typeof n === "number" ? n : NaN);
  const [raw, setRaw] = useState(() => {
    const n = numeric(v);
    return Number.isNaN(n) ? "" : String(n);
  });

  // days-per-week: bounded 1-7 choice — a dropdown beats 7 chips + a text box
  if (q.kind === "number" && q.key === "trips_per_week") {
    const current = typeof v === "number" && v >= 1 && v <= 7 ? String(v) : "";
    const dayLabel = (d: number) => (lang === "bm" ? `${d} hari` : d === 1 ? "1 day" : `${d} days`);
    return (
      <div className="mt-6">
        <div className="relative">
          <select
            aria-label={questionText(q, lang)}
            value={current}
            onChange={(e) => set({ trips_per_week: Number(e.target.value) } as Partial<Profile>)}
            className="w-full appearance-none rounded-lg border border-line bg-card px-5 py-4 text-lg font-semibold text-ink outline-none focus:border-primary"
          >
            <option value="" disabled>
              {t("iq.selectDays")}
            </option>
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <option key={d} value={d}>
                {dayLabel(d)}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
        </div>
        <AnnualEcho value={value} />
      </div>
    );
  }

  if (q.kind === "choice" && q.options) {
    const labels = CHOICE_LABELS[q.key] || {};
    return (
      <div className="mt-6 space-y-3">
        {q.options.map((opt) => {
          const selected = v === opt;
          return (
            <button
              key={opt}
              onClick={() => set({ [q.key]: opt } as Partial<Profile>)}
              className={`pressable flex w-full items-center justify-between rounded-lg border px-5 py-4 text-left text-[16px] font-medium transition-colors ${
                selected ? "border-primary bg-primary/[0.04]" : "border-line bg-card text-ink"
              }`}
            >
              <span>
                {((labels[opt] as { en: string; bm: string } | undefined)?.[lang] ?? labels[opt]?.[lang] ?? labels[opt]?.en ?? opt)}
              </span>
              {selected ? (
                <span className="grid h-6 w-6 place-items-center rounded-full bg-primary">
                  <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                </span>
              ) : (
                <Circle className="h-6 w-6 text-[#d2d2d7]" strokeWidth={1.5} />
              )}
            </button>
          );
        })}
      </div>
    );
  }

  if (q.kind === "boolean") {
    return (
      <div className="mt-6 grid grid-cols-2 gap-3">
        {[
          ["yes", lang === "bm" ? "Ya" : "Yes"],
          ["no", lang === "bm" ? "Tidak" : "No"],
        ].map(([val, label]) => {
          const selected = v === (val === "yes");
          return (
            <button
              key={val}
              onClick={() => set({ [q.key]: val === "yes" } as Partial<Profile>)}
              className={`pressable rounded-full border px-4 py-4 text-center text-[17px] font-medium transition-colors ${
                selected
                  ? "border-primary bg-primary text-white"
                  : "border-line bg-card text-ink hover:bg-parchment"
              }`}
            >
              {label as string}
            </button>
          );
        })}
      </div>
    );
  }

  if (q.kind === "postcode") {
    const raw = typeof v === "string" ? v : "";
    const area = raw.length >= 2 ? getPostcodeArea(raw) : null;
    return (
      <div className="mt-8">
        <input
          inputMode="numeric"
          maxLength={5}
          placeholder="50400"
          defaultValue={raw}
          onChange={(e) => set({ [q.key]: e.target.value.replace(/[^0-9]/g, "") } as Partial<Profile>)}
          className="w-full rounded-lg border border-line bg-card px-5 py-6 text-center text-[28px] font-semibold tracking-[0.35em] text-ink outline-none placeholder:text-[#d2d2d7] focus:border-primary"
        />
        {area && (
          <p className="mt-3 text-center text-[16px] font-medium text-primary enter-rise">
            {area}
          </p>
        )}
        {!area && (
          <p className="mt-3 text-center text-[15px] text-muted">
            {t("iq.postcodeHint")}
          </p>
        )}
      </div>
    );
  }

  // number kinds: daily_km, long_trip_km, budget_max_rm.
  const chipSet = CHIP_SETS[q.key] ?? { values: KILOMETRE_CHIPS, unit: "km" as const };
  const chipLabel = (chip: number) => {
    if (chipSet.unit === "rm") return `RM ${chip.toLocaleString()}`;
    return `${chip} km`;
  };

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap gap-2">
        {chipSet.values.map((chip) => {
          const selected = numeric(v) === chip;
          return (
            <button
              key={chip}
              onClick={() => {
                setRaw(String(chip));
                set({ [q.key]: chip } as Partial<Profile>);
              }}
              className={`pressable rounded-full border px-5 py-2.5 text-[16px] font-medium transition-colors ${
                selected
                  ? "border-primary bg-primary text-white"
                  : "border-line bg-card text-ink hover:bg-parchment"
              }`}
            >
              {chipLabel(chip)}
            </button>
          );
        })}
      </div>
      <input
        inputMode="numeric"
        /* A placeholder is not a label: it is dropped by some screen readers
           and disappears for everyone the moment typing starts. */
        aria-label={q.key === "budget_max_rm" ? t("iq.orRM") : t("iq.orNum")}
        placeholder={q.key === "budget_max_rm" ? t("iq.orRM") : t("iq.orNum")}
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
          set({ [q.key]: parseFloat(e.target.value) || 0 } as Partial<Profile>);
        }}
        className="w-full rounded-lg border border-line bg-card px-5 py-4 text-lg font-semibold text-ink outline-none placeholder:text-[#d2d2d7] focus:border-primary"
      />
      {q.key === "daily_km" && <AnnualEcho value={value} />}
    </div>
  );
}
