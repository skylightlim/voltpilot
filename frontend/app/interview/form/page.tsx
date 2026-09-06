"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button, Card, SectionLabel } from "@/components/ui";
import { Stagger } from "@/components/motion";
import { SESSION, type Profile } from "@/lib/api";
import { CHOICE_LABELS } from "@/lib/interview-script";
import { useT, useLang, type StrKey } from "@/lib/i18n";

/** Small-caps field label sitting above every control. */
function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-[12px] font-semibold text-muted">
      {children}
    </label>
  );
}

/** Section heading with the hairline rule that separates the form's three groups. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7 first:mt-0">
      <h2 className="border-b border-line pb-2 text-[14px] font-bold text-ink">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

const inputCls =
  "mt-1.5 w-full rounded-[12px] border border-transparent bg-parchment px-4 py-3 text-[15px] " +
  "font-medium text-ink outline-none transition-colors focus:border-primary focus:bg-card";

/**
 * Slider-first numeric field, shaped like the weighting studio's sliders:
 * label + value on top, track, then the band's end captions. The value itself
 * stays editable so the rare driver outside the band (an e-hailing 300 km day,
 * a RM 750k budget) is never locked out by the track's ends.
 */
function RangeField({
  id,
  label,
  min,
  max,
  step,
  hardMax,
  value,
  onChange,
  caption,
  zeroLabel,
}: {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  hardMax: number;
  value: number;
  onChange: (v: number) => void;
  caption: (v: number) => string;
  zeroLabel?: string;
}) {
  /* The box hugs its value instead of sitting in a fixed 128px well. The face is
     mono with tabular-nums, so every digit is exactly 1ch and this is exact
     rather than approximate. 1.5rem covers px-2.5 on both sides plus the border. */
  const shown = value ? String(value) : (zeroLabel ?? "");
  const chars = Math.max(shown.length, 3);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <input
          type="number"
          inputMode="numeric"
          aria-label={label}
          min={0}
          max={hardMax}
          step={step}
          placeholder={zeroLabel}
          value={value || ""}
          onChange={(e) =>
            onChange(Math.min(hardMax, Math.max(0, Number(e.target.value))))
          }
          style={{ width: `calc(${chars}ch + 1.5rem)` }}
          className="max-w-full shrink-0 rounded-[10px] border border-transparent bg-parchment px-2.5 py-1 text-center font-mono text-[13px] font-bold text-primary tabular-nums outline-none transition-[width,background-color,border-color] duration-150 placeholder:font-semibold placeholder:text-muted focus:border-primary focus:bg-card [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        aria-label={label}
        // a value typed past the band pins the thumb at that end
        value={Math.min(max, Math.max(min, value))}
        onChange={(e) => onChange(Number(e.target.value))}
        className="slider mt-3"
      />
      <div className="mt-1.5 flex justify-between font-mono text-[10px] uppercase tracking-wider text-muted">
        <span>{caption(min)}</span>
        <span>{caption(max)}+</span>
      </div>
    </div>
  );
}

/** Pill switch — the yes/no controls VoltPilot uses for the three charging flags. */
function Toggle({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const t = useT();
  return (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className="pressable tap-target mt-1.5 flex items-center gap-2.5"
      >
        <span
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
            checked ? "bg-primary" : "bg-line"
          }`}
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${
              checked ? "left-6" : "left-1"
            }`}
          />
        </span>
        <span className="text-[14px] font-semibold text-ink">
          {checked ? t("cf.yes") : t("cf.no")}
        </span>
      </button>
    </div>
  );
}

export default function CalculatorFormPage() {
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const [p, setP] = useState<Profile>(() => SESSION.loadProfile());
  const [error, setError] = useState("");

  // A slider always shows *some* position, so an unset field would render a
  // thumb that disagrees with the stored 0. Seed the mid-range defaults once,
  // leaving a returning user's answers untouched. The bill legitimately stays
  // 0 - that means "not sure", and the engine falls back to its anchor rate.
  useEffect(() => {
    setP((prev) => {
      const seeded: Partial<Profile> = {};
      if (!prev.daily_km) seeded.daily_km = 40;
      if (!prev.budget_max_rm) seeded.budget_max_rm = 150000;
      return Object.keys(seeded).length ? { ...prev, ...seeded } : prev;
    });
  }, []);

  // Persist as an effect, and patch functionally: two controls changed in the
  // same tick would otherwise both build off the same stale render value and
  // the first edit would be silently dropped.
  useEffect(() => {
    SESSION.saveProfile(p);
  }, [p]);

  const set = (patch: Partial<Profile>) => {
    setP((prev) => ({ ...prev, ...patch }));
    setError("");
  };

  // Option labels are shared with the step-by-step intake so both paths word
  // the same choices identically.
  const choice = (field: "destination_region" | "long_trip_frequency", opt: string) => {
    const l = CHOICE_LABELS[field]?.[opt];
    return l ? (lang === "bm" ? l.bm : l.en) : opt;
  };

  const submit = () => {
    if (!p.daily_km || p.daily_km <= 0) return setError(t("cf.errDaily"));
    if (!p.trips_per_week || p.trips_per_week <= 0) return setError(t("cf.errDays"));
    if (!/^\d{5}$/.test(p.home_postcode || "")) return setError(t("cf.errPostcode"));
    SESSION.saveProfile(p);
    // Priorities live on the weighting studio — this form stops at the facts.
    router.push("/sliders");
  };

  return (
    <main className="app-shell mx-auto flex min-h-[100svh] w-full max-w-lg flex-col px-4 pt-6 pb-8 sm:px-6">
      {/* upper-left, matching /interview/voice. -ml-1 keeps the text optically
          flush with the content below while the padding gives it a real tap target */}
      <header className="flex justify-start">
        <Link
          href="/"
          className="-ml-1 flex min-h-11 items-center gap-1.5 rounded-lg px-1 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-ink"
        >
          ← {t("v.back")}
        </Link>
      </header>

      <Stagger className="flex-1" stagger={0.06}>
        <SectionLabel>{t("cf.label")}</SectionLabel>
        <h1 className="apple-display-2 mt-3 text-[32px] leading-tight text-ink">
          {t("cf.t1")}
          <br />
          <span className="text-primary">{t("cf.t2")}</span>
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-muted">{t("cf.sub")}</p>

        <Card className="mt-6 border border-line bg-card p-5">
          {/* ---------------- Driving pattern ---------------- */}
          <Section title={t("cf.s1")}>
            <RangeField
              id="daily_km"
              label={t("cf.daily")}
              min={5}
              max={200}
              step={5}
              hardMax={2000}
              value={p.daily_km}
              onChange={(v) => set({ daily_km: v })}
              caption={(v) => `${v} km`}
            />
            <div>
              <FieldLabel htmlFor="trips_per_week">{t("cf.days")}</FieldLabel>
              <select
                id="trips_per_week"
                value={p.trips_per_week || ""}
                onChange={(e) => set({ trips_per_week: Number(e.target.value) })}
                className={inputCls}
              >
                <option value="" disabled>
                  {t("iq.selectDays")}
                </option>
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <option key={d} value={d}>
                    {lang === "bm" ? `${d} hari` : d === 1 ? "1 day" : `${d} days`}
                  </option>
                ))}
              </select>
            </div>
          </Section>

          {/* ---------------- Budget & context ---------------- */}
          <Section title={t("cf.s2")}>
            {/* Sliders run full width. In a 512px card a 2-col split leaves ~228px
                per field, which wrapped "Monthly electricity bill (RM)" onto three
                lines and knocked the two sliders out of alignment. */}
            <div className="space-y-5">
              <RangeField
                id="budget"
                label={t("cf.budget")}
                min={30000}
                max={500000}
                step={5000}
                hardMax={2000000}
                value={p.budget_max_rm ?? 0}
                onChange={(v) => set({ budget_max_rm: v })}
                caption={(v) => `RM ${Math.round(v / 1000)}k`}
              />
              <RangeField
                id="bill"
                label={t("cf.bill")}
                min={0}
                max={1000}
                step={10}
                hardMax={100000}
                value={p.monthly_electricity_bill_rm ?? 0}
                onChange={(v) => set({ monthly_electricity_bill_rm: v })}
                caption={(v) => `RM ${v}`}
                zeroLabel={t("cf.notSure")}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="grid_region">{t("cf.region")}</FieldLabel>
                <select
                  id="grid_region"
                  value={p.grid_region}
                  onChange={(e) =>
                    set({ grid_region: e.target.value as Profile["grid_region"] })
                  }
                  className={inputCls}
                >
                  {(["peninsular", "east_malaysia"] as const).map((r) => (
                    <option key={r} value={r}>
                      {t(`cf.region.${r}` as StrKey)}
                    </option>
                  ))}
                </select>
              </div>
              <Toggle
                id="can_charge_work"
                label={t("cf.work")}
                checked={!!p.can_charge_work}
                onChange={(v) => set({ can_charge_work: v })}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Toggle
                id="can_charge_home"
                label={t("cf.home")}
                checked={!!p.can_charge_home}
                onChange={(v) => set({ can_charge_home: v })}
              />
              <Toggle
                id="consider_solar"
                label={t("cf.solar")}
                checked={!!p.consider_solar}
                onChange={(v) => set({ consider_solar: v })}
              />
            </div>
          </Section>

          {/* ------- Charging infrastructure & long trips ------- */}
          <Section title={t("cf.s3")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="home_postcode">{t("cf.postcode")}</FieldLabel>
                <input
                  id="home_postcode"
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  placeholder="50000"
                  value={p.home_postcode}
                  onChange={(e) =>
                    set({ home_postcode: e.target.value.replace(/\D/g, "").slice(0, 5) })
                  }
                  className={inputCls}
                />
              </div>
              <div>
                <FieldLabel htmlFor="destination_region">{t("cf.dest")}</FieldLabel>
                <select
                  id="destination_region"
                  value={p.destination_region}
                  onChange={(e) =>
                    set({ destination_region: e.target.value as Profile["destination_region"] })
                  }
                  className={inputCls}
                >
                  {(
                    ["kl", "north", "south", "east_coast", "east_malaysia", "singapore"] as const
                  ).map((r) => (
                    <option key={r} value={r}>
                      {choice("destination_region", r)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <FieldLabel htmlFor="long_trip_frequency">{t("cf.freq")}</FieldLabel>
              <select
                id="long_trip_frequency"
                value={p.long_trip_frequency}
                onChange={(e) =>
                  set({
                    long_trip_frequency: e.target.value as Profile["long_trip_frequency"],
                  })
                }
                className={inputCls}
              >
                {(["rarely", "monthly", "weekly"] as const).map((f) => (
                  <option key={f} value={f}>
                    {choice("long_trip_frequency", f)}
                  </option>
                ))}
              </select>
            </div>
          </Section>

          {error && (
            <p role="alert" className="mt-5 text-[13px] font-medium text-warning">
              {error}
            </p>
          )}

          {/* The submit closes the form, so it gets a rule and real space above
              it instead of sitting flush against the last select. */}
          <div className="mt-9 border-t border-line pt-7">
            <Button
              size="xl"
              onClick={submit}
              className="w-full font-semibold"
            >
              {t("cf.cta")}
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Button>
            <p className="mx-auto mt-4 max-w-[40ch] text-balance text-center text-[12.5px] leading-relaxed text-muted">
              {t("cf.ctaHint")}
            </p>
          </div>
        </Card>
      </Stagger>
    </main>
  );
}
