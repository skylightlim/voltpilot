"use client";

export const runtime = "edge";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowDown, Coins, Leaf, Loader2, MessageCircle, Target } from "lucide-react";
import { Badge, Button, Card, SectionLabel } from "@/components/ui";
import { CountUp, Reveal, Stagger } from "@/components/motion";
import { apiService } from "@/lib/api";

export default function RecommendationPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiService
      .getRecommendation(token)
      .then((r) => setData({ ...r, analyst: r.analyst }))
      .catch((e) => setError((e as Error).message));
  }, [token]);

  if (error) {
    return (
      <main className="grid min-h-[100svh] place-items-center px-6 bg-white">
        <p className="text-center text-sm text-red-600">{error}</p>
      </main>
    );
  }

  const rec = data?.analyst;

  return (
    <main className="app-shell mx-auto min-h-[100svh] w-full max-w-xl bg-white px-5 pt-6">
      <header className="flex items-center justify-between">
        <button
          className="text-[14px] font-medium text-muted transition-colors hover:text-ink"
          onClick={() => router.push(`/results/${token}`)}
        >
          ← Back to results
        </button>
        <SectionLabel>Your roadmap</SectionLabel>
      </header>

      {!rec ? (
        <div className="grid min-h-[60svh] place-items-center">
          <div className="text-center">
            <Loader2 className="mx-auto h-7 w-7 animate-spin text-primary" />
            <p className="mt-3 animate-pulse text-[14px] text-muted">
              Letting the analyst draft the plan…
            </p>
          </div>
        </div>
      ) : (
        <>
          <Reveal className="mt-6">
            <SectionLabel>AI recommendation</SectionLabel>
            <h1 className="apple-display mt-3 text-[32px] text-ink">{rec.headline}</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">{rec.summary}</p>
          </Reveal>

          {/* Savings summary — big numbers */}
          <Stagger className="mt-6 grid grid-cols-2 gap-3" selector="> div" stagger={0.08}>
            <Card className="!p-5">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-[#e8f1fb]">
                <Leaf className="h-4 w-4 text-primary" />
              </span>
              <p className="apple-display mt-3 text-[26px] text-ink">
                {rec.savings?.co2_saved_10yr_kg ? (
                  <CountUp value={Math.round(rec.savings.co2_saved_10yr_kg)} suffix=" kg" />
                ) : (
                  "—"
                )}
              </p>
              <p className="mt-1 text-[13px] leading-snug text-muted">CO₂ saved over 10 years</p>
            </Card>
            <Card className="!p-5">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-parchment">
                <Coins className="h-4 w-4 text-ink" />
              </span>
              <p className="apple-display mt-3 text-[26px] text-ink">
                {rec.savings?.cost_rm_yr_top ? (
                  <>
                    <CountUp value={Math.round(rec.savings.cost_rm_yr_top)} prefix="RM" suffix="/yr" />
                  </>
                ) : (
                  "—"
                )}
              </p>
              <p className="mt-1 text-[12px] leading-snug text-muted">
                annual running cost (top pick)
              </p>
            </Card>
          </Stagger>

          {/* Roadmap timeline */}
          <section className="mt-10">
            <SectionLabel>Staged plan — relative years</SectionLabel>
            <div className="mt-6 space-y-0">
              {rec.roadmap?.map((m: any, i: number) => (
                <Reveal key={i} y={16} className="relative flex gap-4 pb-8 last:pb-0">
                  {i < (rec.roadmap?.length || 0) - 1 && (
                    <span className="absolute left-[19px] top-11 h-[calc(100%-2.5rem)] w-px bg-[#d2d2d7]" />
                  )}
                  <span
                    className={`mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white ${
                      i === 0
                        ? "bg-primary shadow-[0_2px_8px_rgba(0,102,204,0.4)]"
                        : "bg-tile text-white"
                    }`}
                  >
                    Y{m.year}
                  </span>
                  <div className="flex-1 rounded-[18px] border border-border bg-white p-5">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[15px] font-semibold text-ink">{m.title}</h3>
                      <Badge tone={i === 0 ? "ev" : "default"}>{i === 0 ? "Now" : `Year ${m.year}`}</Badge>
                    </div>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{m.detail}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </section>

          {/* Milestones */}
          {rec.tradeoffs && (
            <section className="mt-10">
              <SectionLabel>Milestones & trade-offs</SectionLabel>
              <Stagger className="mt-3 space-y-2" selector="> p">
                {rec.tradeoffs.map((t: string, i: number) => (
                  <p
                    key={i}
                    className="flex items-start gap-3 rounded-[18px] border border-border bg-parchment/60 p-4 text-[13px] leading-snug text-muted"
                  >
                    <Target className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    {t}
                  </p>
                ))}
              </Stagger>
            </section>
          )}

          {/* Solar banner (eligible only) */}
          {rec.solar_banner && (
            <Reveal className="mt-6">
              <Card className="border-solar/40 bg-[#fff9ec] p-5">
                <p className="font-semibold text-ink">Solar-first bonus</p>
                <p className="mt-0.5 text-[14px] leading-relaxed text-muted">
                  You qualify: home charging + solar considered. Average Malaysia: capex RM
                  {rec.solar_banner.capex_rm?.toLocaleString() ?? "34,000"}, ~RM
                  {rec.solar_banner.savings_rm_per_year?.toLocaleString() ?? "4,300"}/yr savings,
                  ~{rec.solar_banner.payback_years ?? "7.9"}-year payback.
                </p>
              </Card>
            </Reveal>
          )}

          <div className="h-28" />

          <div className="thumb-zone mx-auto max-w-md">
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" size="lg" onClick={() => router.push(`/results/${token}`)}>
                <ArrowDown className="h-4 w-4 rotate-270" /> Dashboard
              </Button>
              <Button variant="primary" size="lg" onClick={() => router.push(`/chat/${token}`)}>
                <MessageCircle className="h-4 w-4" /> Ask AI
              </Button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}