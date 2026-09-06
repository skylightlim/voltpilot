"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { ScrollRefresh } from "@/components/motion";
import { useT } from "@/lib/i18n";

function GarageLoader() {
  const t = useT();
  return (
    <div className="grid h-full place-items-center">
      <p className="animate-pulse text-sm text-muted-foreground">{t("an.prep")}</p>
    </div>
  );
}

const LieRoom = dynamic(() => import("@/components/lierooms/LieRoom"), {
  ssr: false,
  loading: () => <GarageLoader />,
});

/* Keys, not copy — the strings live in lib/i18n.ts so BM users get Malay.
   Resolved inside the component, where the t() hook is available. */
const STAGE_KEYS = ["an.s1", "an.s2", "an.s3", "an.s4", "an.s5"] as const;

/** The five engines, in the order they actually run. Name and what it reads. */
/**
 * Should this device load the 9.4 MB car?
 *
 * The scene is 9.1 MB of Draco glTF plus a 250 KB decoder, and this page exists
 * only until the backend returns — often under ten seconds. On a metered
 * Malaysian mobile connection that is a large download the visitor frequently
 * navigates away from before it finishes, having paid for all of it.
 *
 * The ledger is the content here and the car is atmosphere, so on a constrained
 * or motion-averse device we simply do not fetch it. Defaults to loading when
 * the browser tells us nothing.
 */
function useWantsHeavyScene(): boolean {
  const [want, setWant] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const motionOk = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Network Information API: Chrome and most Android browsers; absent on Safari.
    const conn = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }).connection;
    const slow = conn?.saveData === true ||
      ["slow-2g", "2g", "3g"].includes(conn?.effectiveType ?? "");
    setWant(motionOk && !slow);
  }, []);
  return want;
}

const LEDGER = [
  ["an.l1", "an.l1d"],
  ["an.l2", "an.l2d"],
  ["an.l3", "an.l3d"],
  ["an.l4", "an.l4d"],
  ["an.l5", "an.l5d"],
] as const;

export default function AnalysisPage() {
  return (
    <Suspense fallback={<div className="grid h-[100svh] place-items-center bg-[#081926]" />}>
      <AnalysisInner />
    </Suspense>
  );
}

function AnalysisInner() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [stage, setStage] = useState(0);
  const heavyScene = useWantsHeavyScene();
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      router.replace("/sliders");
      return;
    }
    const stageTimer = setInterval(() => setStage((s) => Math.min(s + 1, STAGE_KEYS.length - 1)), 1400);
    let cancelled = false;

    const check = async () => {
      if (cancelled) return;
      try {
        const { apiService } = await import("@/lib/api");
        const r = await apiService.getRecommendation(token);
        if (r?.analyst) {
          router.replace(`/results/${token}`);
        }
      } catch {
        /* not ready yet */
      }
    };

    check();
    const poll = setInterval(check, 1500);
    return () => {
      cancelled = true;
      clearInterval(stageTimer);
      clearInterval(poll);
    };
  }, [token, router]);

  return (
    <main className="relative h-[100svh] w-full overflow-hidden bg-pine-deep">
      <ScrollRefresh />

      {/* The car is the stage, not the subject: it sits behind the ledger and
          is pushed right so the reading column never lands on bodywork. */}
      {heavyScene ? (
        <div className="pointer-events-none absolute inset-0 md:left-[26rem]">
          <LieRoom />
        </div>
      ) : (
        // No car: a quiet pine field so the ledger still sits on something
        // rather than a flat void.
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_70%_60%,#123227_0%,#0e2a21_55%,#0a1f18_100%)]"
          aria-hidden="true"
        />
      )}

      {/* Reading ground for the mobile ledger. The car fills the viewport
          behind it there, and rows over bodywork are unreadable. */}
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-[62%] bg-gradient-to-t from-pine-deep via-pine-deep/95 to-transparent md:hidden ${heavyScene ? "" : "hidden"}`}
        aria-hidden="true"
      />

      {/* Masthead */}
      <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 py-5 sm:px-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-pearl/45">
          {t("an.heading")}
        </p>
        <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-amber">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber" aria-hidden="true" />
          {t("an.working")}
        </p>
      </header>

      {/* The instrument ledger — the signature of this screen.
          A waiting page has one job: make the wait legible as real work. A
          spinner asserts that; naming each engine and what it reads shows it,
          and teaches the method on the way to the result. */}
      <section
        className="absolute inset-x-0 bottom-0 z-10 px-5 pb-8 sm:px-8 md:inset-y-0 md:right-auto md:w-[26rem] md:px-8 md:pb-0 md:flex md:flex-col md:justify-center [@media(max-height:560px)]:md:justify-start [@media(max-height:560px)]:md:pt-14 [@media(max-height:560px)]:md:pb-4"
        aria-live="polite"
      >
        <p
          className={`max-w-[30ch] text-[15px] leading-relaxed text-pearl/70 md:block [@media(max-height:560px)]:md:hidden ${
            // With no car there is room on a phone for the one line that says
            // what is happening — and a data-saving visitor gets the least
            // reassurance from an otherwise empty screen.
            heavyScene ? "hidden" : "mb-6 block"
          }`}
        >
          {t("an.sub")}
        </p>

        <ol className="mt-0 md:mt-8 [@media(max-height:560px)]:md:mt-0">
          {LEDGER.map(([name, detail], i) => {
            const state = i < stage ? "done" : i === stage ? "active" : "pending";
            return (
              <li
                key={name}
                className={`grid grid-cols-[1.6rem_1fr] items-baseline gap-x-3 border-t py-3 [@media(max-height:560px)]:py-2 transition-colors duration-500 ${
                  state === "active" ? "border-amber/40" : "border-pearl/10"
                }`}
              >
                <span
                  className={`font-mono text-[11px] tabular-nums transition-colors duration-500 ${
                    state === "done" ? "text-[#7fc9a4]" : state === "active" ? "text-amber" : "text-pearl/25"
                  }`}
                >
                  {state === "done" ? "✓" : String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <p
                    className={`font-display text-[15px] font-bold leading-tight transition-colors duration-500 ${
                      state === "pending" ? "text-pearl/35" : "text-pearl"
                    }`}
                  >
                    {t(name)}
                  </p>
                  {/* Only the running engine explains itself — five descriptions
                      at once is a wall of text nobody reads while waiting. */}
                  {state === "active" && (
                    <p className="mt-0.5 text-[12.5px] leading-snug text-pearl/55">{t(detail)}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        <div className="mt-5 h-px w-full bg-pearl/10">
          <div
            className="h-px bg-amber transition-all duration-700 ease-out"
            style={{ width: `${((stage + 1) / LEDGER.length) * 100}%` }}
          />
        </div>
      </section>

      {/* Sponsor: bottom-right, clear of both the ledger and the car */}
      <aside className="pointer-events-none absolute bottom-6 right-6 z-10 hidden text-right md:block">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-pearl/35">
          {t("an.sponsor")}
        </p>
        <p className="mt-1 font-display text-[15px] font-bold text-pearl/90">Kia EV9 GT-Line</p>
        <p className="mt-0.5 max-w-[22ch] text-[12px] leading-snug text-pearl/45">
          {t("lie.tagline")}
        </p>
      </aside>

      {error && (
        <div
          role="alert"
          className="absolute inset-x-5 bottom-24 z-20 rounded-2xl border border-warning/40 bg-pine-deep/95 p-4 text-sm text-pearl"
        >
          {error}
        </div>
      )}
    </main>
  );
}
