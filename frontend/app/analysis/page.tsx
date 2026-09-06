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
    <main className="relative h-[100svh] w-full overflow-hidden bg-[#081926]">
      <ScrollRefresh />
      <LieRoom />

      {/* status overlay (top = status only) */}
      <div className="absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-[#081926]/90 to-transparent p-5 pb-12">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.3em] text-white/60">
          {t("an.heading")}
        </p>
        <p className="mt-2 text-center text-[15px] text-white/90">{t(STAGE_KEYS[stage])}</p>
        <div className="mx-auto mt-4 h-[3px] w-40 overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full rounded-full bg-sky transition-all duration-700 ease-out"
            style={{ width: `${((stage + 1) / STAGE_KEYS.length) * 100}%` }}
          />
        </div>
      </div>

      {error && (
        <div className="absolute inset-x-5 bottom-24 z-10 rounded-2xl bg-red-500/90 p-4 text-sm text-white">
          {error}
        </div>
      )}
    </main>
  );
}