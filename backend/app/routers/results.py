from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import load_policy_markdown, load_solar, settings
from ..db import Profile, Recommendation, TopsisResult, get_db

router = APIRouter(prefix="/results", tags=["results"])


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


@router.get("/{token}/recommendation")
async def get_recommendation(token: str, db: AsyncSession = Depends(get_db)):
    """The configured analyst model (or mock) synthesises the headline + roadmap on demand."""
    row = await ensure_recommendation(token, db)
    return {"token": token, "mock": row.mock, "analyst": row.analyst_json}