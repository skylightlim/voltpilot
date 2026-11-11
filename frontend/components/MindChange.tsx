"use client";

/* "Did this change your mind?"
 *
 * The leaning is asked twice: on /sliders, before any result exists, and on the
 * results page after it. Asking only afterwards would measure what people
 * remember thinking, which drifts toward what they were just shown. The pair
 * lands in the mind_changes table, so the number of minds moved is a count of
 * rows whose two answers differ.
 */

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { apiService, type Leaning } from "@/lib/api";
import { useT, type StrKey } from "@/lib/i18n";

const OPTIONS: { value: Leaning; label: StrKey }[] = [
  { value: "ev", label: "mind.ev" },
  { value: "hybrid", label: "mind.hybrid" },
  { value: "unsure", label: "mind.unsure" },
];

/** Three pills, one answer. Styled as the /sliders presets: pills for choices,
 *  44px targets, and `.pressable` owns the transition (DESIGN.md §8). */
export function LeaningPicker({
  value,
  onPick,
  label,
}: {
  value?: Leaning | null;
  onPick: (l: Leaning) => void;
  label: string;
}) {
  const t = useT();
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {OPTIONS.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onPick(o.value)}
            className={`pressable inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-[14px] font-semibold ${
              on ? "border-primary bg-primary text-white" : "border-line bg-white text-muted hover:text-ink"
            }`}
          >
            {on && <Check className="h-3.5 w-3.5" />}
            {t(o.label)}
          </button>
        );
      })}
    </div>
  );
}

const answered = (token: string) => `vp.mind.${token}`;

export function MindChangeCard({ token, before }: { token: string; before?: Leaning | null }) {
  const t = useT();
  const [after, setAfter] = useState<Leaning | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // An answer already given for this result on this device shows as given.
  useEffect(() => {
    try {
      const v = localStorage.getItem(answered(token)) as Leaning | null;
      if (v) {
        setAfter(v);
        setState("saved");
      }
    } catch {
      /* storage unavailable: ask again, the server keeps one row per result */
    }
  }, [token]);

  const pick = async (l: Leaning) => {
    setAfter(l);
    setState("saving");
    try {
      await apiService.postMindChange(token, l);
      try {
        localStorage.setItem(answered(token), l);
      } catch {
        /* see above */
      }
      setState("saved");
    } catch {
      setState("error");
    }
  };

  return (
    <section aria-labelledby="mind-h" className="rounded-lg border border-line bg-white p-4 sm:p-5">
      <p className="mono-label text-fog">{t("mind.label")}</p>
      <h2 id="mind-h" className="mt-1.5 text-[18px] font-bold text-ink">
        {t("mind.h")}
      </h2>
      <p className="mt-1 text-[15px] leading-relaxed text-muted">
        {before ? t("mind.subBefore", { before: t(`mind.${before}` as StrKey) }) : t("mind.sub")}
      </p>
      <div className="mt-3">
        <LeaningPicker value={after} onPick={pick} label={t("mind.h")} />
      </div>
      <p aria-live="polite" className="mt-2.5 min-h-5 text-[14px] text-muted">
        {state === "saved" && t("mind.thanks")}
        {state === "error" && <span className="text-red-600">{t("mind.err")}</span>}
      </p>
    </section>
  );
}
