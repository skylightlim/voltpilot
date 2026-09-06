"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button, StepDots } from "@/components/ui";
import QInput from "@/components/intake/QInput";
import { SESSION, apiService, type Profile } from "@/lib/api";
import { FALLBACK_SCRIPT, questionText, type IQuestion } from "@/lib/interview-script";
import { useT } from "@/lib/i18n";

export default function IntakeStepPage({ step }: { step: number }) {
  const router = useRouter();
  const t = useT();
  const [script, setScript] = useState<IQuestion[]>(FALLBACK_SCRIPT);
  const [profile, setProfile] = useState<Profile>(() => SESSION.loadProfile());
  const [error, setError] = useState("");

  useEffect(() => {
    apiService
      .getInterviewScript()
      .then((r) => {
        if (Array.isArray(r.questions) && r.questions.length) setScript(r.questions as IQuestion[]);
      })
      .catch(() => {});
  }, []);

  const lang = profile.language;
  const total = script.length;
  const q = script[Math.max(0, Math.min(step, total) - 1)];
  const isLast = step >= total;
  const done = useMemo(() => (q ? hasAnswer(q, profile) : true), [q, profile]);

  if (!q) return null;

  const set = (patch: Partial<Profile>) => {
    const next = { ...profile, ...patch };
    setProfile(next);
    SESSION.saveProfile(next);
    setError("");
  };

  const submit = () => {
    if (q.required && !done) {
      setError(t("iq.err"));
      return;
    }
    router.push(isLast ? "/sliders" : `/intake/${step + 1}`);
  };

  return (
    <main className="mx-auto flex min-h-[100svh] w-full max-w-md flex-col px-5 pt-8 app-shell">
      <header className="flex items-center justify-between">
        <button
          aria-label={t("iq.back")}
          className="pressable tap-target -ml-2 grid h-11 w-11 place-items-center rounded-full text-ink hover:bg-parchment"
          onClick={() => (step > 1 ? router.push(`/intake/${step - 1}`) : router.push("/interview/form"))}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <StepDots total={total} current={Math.min(step - 1, total - 1)} />
        <span className="w-11" aria-hidden />
      </header>

      <section key={step} className="enter-rise mt-10 flex-1">
        <p className="mono-label text-[11px] text-muted tracking-wider">
          {t("iq.q", { n: Math.min(step, total), total })}
        </p>
        <h1 className="apple-display-2 mt-3 text-[28px] leading-snug text-ink">{questionText(q, lang)}</h1>
        <QInput q={q} value={profile} set={set} lang={lang} />
        {error && <p className="mt-4 text-sm font-semibold text-red-600">{error}</p>}
      </section>

      <div className="thumb-zone mx-auto max-w-md">
        <Button className="w-full text-base font-bold" size="lg" onClick={submit}>
          {isLast ? t("iq.last") : t("iq.next")} <ArrowRight className="h-4.5 w-4.5" />
        </Button>
      </div>
    </main>
  );
}

function hasAnswer(q: IQuestion, p: Profile): boolean {
  const v = (p as Record<string, unknown>)[q.key];
  if (v === undefined || v === null || v === "") return false;
  if (q.kind === "boolean") return true;
  if (q.kind === "postcode") return /^\d{5}$/.test(String(v));
  if (typeof v === "number") return !q.required || v > 0;
  return String(v).length > 0;
}
