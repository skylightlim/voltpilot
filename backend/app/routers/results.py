from __future__ import annotations

import asyncio
import logging
import time

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import load_policy_markdown, load_solar, settings
from ..db import AsyncSessionLocal, Profile, Recommendation, TopsisResult, get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/results", tags=["results"])

# One analyst run per token, shared by every caller waiting on it.
#
# The analysis page polls /recommendation every 1.5s while its stage animation
# runs. That endpoint used to generate on read, so each poll launched its own
# Gemini call: measured six concurrent generations for a single visitor, each
# 7.4-10.1s, all racing to write the same row. Scoring now starts the run and
# the pollers await this task instead of starting their own.
#
# In-process is the right scope: the Worker addresses a single Durable Object,
# so all traffic for a token reaches one container (see ratelimit.py).
_pending: dict[str, tuple[asyncio.Task, float]] = {}

# A finished run is kept this long so polls arriving just after it join the
# completed task instead of starting another. Without the hold, a token whose
# analyst returned a mock — which is deliberately retried on the next read —
# starts a fresh Gemini call on every 1.5s poll for as long as Gemini is down.
_HOLD_SECONDS = 60.0


def start_recommendation(token: str) -> asyncio.Task:
    """Begin (or join) the analyst run for a token without waiting on it."""
    now = time.monotonic()
    for key, (task, started) in list(_pending.items()):
        if task.done() and now - started > _HOLD_SECONDS:
            _pending.pop(key, None)

    entry = _pending.get(token)
    if entry is not None:
        return entry[0]

    task = asyncio.create_task(_generate(token))
    _pending[token] = (task, now)
    return task


async def _generate(token: str) -> None:
    """Run the analyst on its own session; the caller's request may be long gone."""
    try:
        async with AsyncSessionLocal() as db:
            await _build_and_store(token, db)
    except Exception:
        logger.exception("analyst run failed for token %s", token)


@router.get("/{token}")
async def get_results(token: str, db: AsyncSession = Depends(get_db)):
    """Aggregate view for the /results page: ranking + engine scores + solar banner."""
    result = await db.scalar(select(TopsisResult).where(TopsisResult.result_token == token))
    if not result:
        raise HTTPException(status_code=404, detail="no result for this token")
    profile_row = await db.scalar(select(Profile).where(Profile.token == token))
    recommendation = await db.scalar(
        select(Recommendation).where(Recommendation.result_token == token)
    )
    return {
        "token": token,
        "ranking": result.ranking_json,
        "weights": result.weights,
        "engine_scores": result.engine_scores_json,
        "features": result.overview_json.get("features", {}),
        "solar_eligible": result.overview_json.get("solar_eligible", False),
        "budget": result.overview_json.get("budget", {}),
        "solar": load_solar() if result.overview_json.get("solar_eligible") else None,
        "profile": profile_row.profile_json if profile_row else None,
        "recommendation": recommendation.analyst_json if recommendation else None,
    }


async def ensure_recommendation(token: str, db: AsyncSession) -> Recommendation:
    existing = await db.scalar(select(Recommendation).where(Recommendation.result_token == token))
    # A cached mock means Gemini was unreachable at the time (e.g. a transient
    # 503). Don't serve that forever - retry the real analyst on the next read.
    if existing and not (existing.mock and settings.has_gemini):
        return existing
    return await _build_and_store(token, db)


async def _build_and_store(token: str, db: AsyncSession) -> Recommendation:
    existing = await db.scalar(select(Recommendation).where(Recommendation.result_token == token))
    if existing and not (existing.mock and settings.has_gemini):
        return existing
    result = await db.scalar(select(TopsisResult).where(TopsisResult.result_token == token))
    if not result:
        raise HTTPException(status_code=404, detail="no result for this token")
    profile_row = await db.scalar(select(Profile).where(Profile.token == token))
    if not profile_row:
        raise HTTPException(status_code=404, detail="profile not found")

    from ..services.analyst import build_recommendation

    lang = profile_row.profile_json.get("language", "en")
    bundle = {
        "profile": profile_row.profile_json,
        "weights": result.weights,
        "ranking": result.ranking_json,
        "features": result.overview_json.get("features", {}),
        "solar": result.overview_json.get("solar_eligible", False),
        "policy_context": load_policy_markdown(),
    }
    analyst = await build_recommendation(bundle, lang)
    row = existing or Recommendation(result_token=token)
    row.analyst_json = analyst
    row.mock = analyst.get("mock", True)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.get("/{token}/infrastructure")
async def get_infrastructure(token: str, db: AsyncSession = Depends(get_db)):
    """Live charging-access look-up for the results page (D-INFRA).

    Kept off the main /results payload so the panel can show its own look-up
    state instead of holding up the ranking.
    """
    profile_row = await db.scalar(select(Profile).where(Profile.token == token))
    if not profile_row:
        raise HTTPException(status_code=404, detail="profile not found")
    from ..engines.engines import infrastructure_access

    return infrastructure_access(profile_row.profile_json)


# How long a poll will hold before answering "not yet". Long enough to return
# the moment a run started at /score time finishes, short enough to stay well
# inside the client's 45s fetch timeout.
_WAIT_SECONDS = 25.0


@router.get("/{token}/recommendation")
async def get_recommendation(token: str, db: AsyncSession = Depends(get_db)):
    """The analyst's headline + roadmap, waiting on the run /score already started.

    Long-polls rather than returning immediately: the caller is a 1.5s poll loop
    on the analysis page, and each poll costs a full round trip to the database,
    so answering "not yet" eight times is worse than holding one connection open
    until the answer exists.
    """
    row = await db.scalar(select(Recommendation).where(Recommendation.result_token == token))
    if row and not (row.mock and settings.has_gemini):
        return {"token": token, "mock": row.mock, "analyst": row.analyst_json}

    # Join the run in flight, or start one if /score's task has already been lost
    # (a container restart between scoring and this call).
    task = start_recommendation(token)
    await asyncio.wait([task], timeout=_WAIT_SECONDS)
    if not task.done():
        return {"token": token, "ready": False, "analyst": None}

    row = await db.scalar(select(Recommendation).where(Recommendation.result_token == token))
    if not row:
        raise HTTPException(status_code=404, detail="no result for this token")
    return {"token": token, "mock": row.mock, "analyst": row.analyst_json}