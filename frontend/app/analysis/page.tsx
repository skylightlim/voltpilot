"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";

const LieRoom = dynamic(() => import("@/components/lierooms/LieRoom"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center">
      <p className="animate-pulse text-sm text-muted-foreground">Preparing the garage…</p>
    </div>
  ),
});

const STAGES = [
  "Matching your profile to 184 models…",
  "Financial · behaviour · infrastructure engines…",
  "Energy engine…",
  "TOPSIS ranking…",
  "AI analyst writing your roadmap…",
];

export default function AnalysisPage() {
  return (
    <Suspense fallback={<div className="grid h-[100svh] place-items-center bg-[#081926]" />}>
      <AnalysisInner />
    </Suspense>
  );
}

function AnalysisInner() {
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
    const t = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 1400);
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
      clearInterval(t);
      clearInterval(poll);
    };
  }, [token, router]);

  return (
    <main className="relative h-[100svh] w-full overflow-hidden bg-[#081926]">
      <LieRoom />

      {/* status overlay (top = status only) */}
      <div className="absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-[#081926]/90 to-transparent p-5 pb-12">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.3em] text-white/60">
          Analysing with AI
        </p>
        <p className="mt-2 text-center text-[15px] text-white/90">{STAGES[stage]}</p>
        <div className="mx-auto mt-4 h-[3px] w-40 overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full rounded-full bg-sky transition-all duration-700 ease-out"
            style={{ width: `${((stage + 1) / STAGES.length) * 100}%` }}
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