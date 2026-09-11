"use client";

import { ShieldCheck, Scale } from "lucide-react";
import type { Stability } from "@/lib/api";

/** How firm rank 1 is, rather than presenting a tie as a decision.
 *
 *  The weights come from four sliders a user dragged approximately, so the
 *  ranking is only as firm as those. Re-scoring 400 times with the weights
 *  jittered by 15% says whether the top car is the answer or the first of
 *  several that are effectively level. Measured across the reference profiles
 *  the leader holds 100%, 100%, 99% and 64%. FEATURES.md P6. */

export function AnswerConfidence({
  stability,
  nameFor,
}: {
  stability: Stability | null | undefined;
  nameFor: (slug: string) => string;
}) {
  if (!stability) return null;
  const pct = Math.round(stability.leader_share * 100);

  if (stability.firm) {
    return (
      <p className="flex items-start gap-2 text-sm text-emerald-800">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        <span>
          This is a firm answer. {nameFor(stability.leader)} still comes first in {pct}% of{" "}
          {stability.draws} runs with your priorities nudged either way.
        </span>
      </p>
    );
  }

  const rivals = stability.contenders
    .slice(0, 3)
    .map((c) => `${nameFor(c.slug)} ${Math.round(c.share * 100)}%`)
    .join(", ");

  return (
    <p className="flex items-start gap-2 text-sm text-amber-900">
      <Scale className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <span>
        These are close enough to call a tie. Nudging your priorities changes which comes first:{" "}
        {rivals}. Pick on whichever of them you would rather live with.
      </span>
    </p>
  );
}
