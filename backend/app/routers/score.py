from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import EngineScore, Profile, TopsisResult, get_db
from ..schemas import ProfileIn, ScoreRequest
from ..services import scoring

router = APIRouter(prefix="/score", tags=["score"])


@router.post("")
async def run_score(body: ScoreRequest, db: AsyncSession = Depends(get_db)):
    """Feature engineering -> 5 engines -> TOPSIS (D18). Stores the result bundle."""
    profile = body.profile
    missing = ProfileIn(**profile.model_dump()).missing_required()
    if missing:
        raise HTTPException(status_code=422, detail={"missing_required": missing})

    profile_row = await db.scalar(select(Profile).where(Profile.token == body.token))
    if not profile_row:
        raise HTTPException(status_code=404, detail="profile token not found — call /profile first")
    token = profile_row.token

    bundle = scoring.score_catalog(profile.model_dump(), body.weights.model_dump())

    engine_scores = {
        r["slug"]: {
            "financial": r["financial_score"],
            "behaviour": r["behaviour_score"],
            "infrastructure": r["infrastructure_score"],
            "energy": r["energy_score"],
            "running_cost_rm_yr": r["running_cost_rm_yr"],
            "tco_excluding_rm": r["tco_excluding_rm"],
            "co2_kg_yr": r["co2_kg_yr"],
        }
        for r in bundle["ranking"]
    }
    db.add(
        EngineScore(
            result_token=token,
            slug="bundle",
scores_json=engine_scores,
        )
    )
    db.add(
        TopsisResult(
            result_token=token,
            weights=bundle["weights"],
            ranking_json=bundle["ranking"],
            engine_scores_json=engine_scores,
            overview_json={
                "features": bundle["features"],
                "solar_eligible": bundle["solar_eligible"],
                "budget": bundle.get("budget", {}),
            },
        )
    )
    await db.commit()
    if token is None:
        raise HTTPException(status_code=400, detail="token required")
    return {"token": token, "solar_eligible": bundle["solar_eligible"], "ranked": len(bundle["ranking"])}