"""The numbers behind the hidden /dashboard page.

One read-only endpoint, behind a shared passphrase (DASHBOARD_PASSPHRASE). Unset
disables it with a 404, so a deploy without the variable exposes nothing. Only
aggregates leave here: counts, medians and a histogram. No tokens, emails or
profile contents.
"""

from __future__ import annotations

import asyncio
import secrets
import statistics
from collections import Counter
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db import MindChange, ReportRequest, ResultTiming, TopsisResult, get_db

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

# Upper edges in seconds. A person who finishes in under a minute and one who
# takes ten are different stories, so the buckets are uneven on purpose.
_BUCKETS = [(60, "under 1 min"), (120, "1-2 min"), (180, "2-3 min"), (300, "3-5 min"),
            (600, "5-10 min")]
_LAST = "over 10 min"
DAYS = 14


def _pct(sorted_vals: list[float], q: float) -> float | None:
    if not sorted_vals:
        return None
    i = min(len(sorted_vals) - 1, max(0, round(q * (len(sorted_vals) - 1))))
    return round(sorted_vals[i], 1)


def _timing_summary(seconds: list[float]) -> dict:
    vals = sorted(seconds)
    return {
        "n": len(vals),
        "median": round(statistics.median(vals), 1) if vals else None,
        "mean": round(statistics.fmean(vals), 1) if vals else None,
        "p90": _pct(vals, 0.9),
        "fastest": round(vals[0], 1) if vals else None,
        "slowest": round(vals[-1], 1) if vals else None,
    }


async def _check(key: str | None) -> None:
    expected = settings.dashboard_passphrase
    if not expected:
        raise HTTPException(status_code=404, detail="Not Found")
    if not key or not secrets.compare_digest(key.encode(), expected.encode()):
        # A guess costs half a second, so brute force is slow without a lockout.
        await asyncio.sleep(0.5)
        raise HTTPException(status_code=401, detail="wrong passphrase")


@router.get("/stats")
async def stats(
    x_dashboard_key: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await _check(x_dashboard_key)

    timings = (await db.execute(select(ResultTiming.seconds, ResultTiming.via))).all()
    seconds = [float(s) for s, _ in timings]

    counts: Counter[str] = Counter()
    for s in seconds:
        for edge, label in _BUCKETS:
            if s < edge:
                counts[label] += 1
                break
        else:
            counts[_LAST] += 1
    histogram = [{"label": label, "count": counts[label]} for _, label in _BUCKETS]
    histogram.append({"label": _LAST, "count": counts[_LAST]})

    by_via = {
        via: _timing_summary([float(s) for s, v in timings if v == via])
        for via in sorted({v for _, v in timings})
    }

    result_days = [d for (d,) in (await db.execute(select(TopsisResult.created_at))).all()]
    today = datetime.utcnow().date()
    per_day = Counter(d.date() for d in result_days)
    daily = [
        {"day": (today - timedelta(days=i)).isoformat(), "results": per_day[today - timedelta(days=i)]}
        for i in range(DAYS - 1, -1, -1)
    ]

    minds = (await db.execute(select(MindChange.leaning_before, MindChange.leaning_after))).all()
    moved = [(b, a) for b, a in minds if b is not None]
    changed = sum(1 for b, a in moved if b != a)

    reports = len((await db.execute(select(ReportRequest.id))).all())

    return {
        "generated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "results_total": len(result_days),
        "timing": {**_timing_summary(seconds), "by_via": by_via, "histogram": histogram},
        "daily": daily,
        "mind": {
            "answered": len(minds),
            "had_prior_view": len(moved),
            "changed": changed,
            "after": dict(Counter(a for _, a in minds)),
        },
        "reports_sent": reports,
        "posthog_share_url": settings.posthog_share_url or None,
    }
