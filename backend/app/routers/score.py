from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import Profile, TopsisResult, get_db
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

    bundle = scoring.score_catalog(
        profile.model_dump(), body.weights.model_dump(),
        fuel_scenario=body.fuel_scenario,
    )

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
    # EngineScore used to be written here with this exact dict. Nothing ever read
    # it back — it duplicated TopsisResult.engine_scores_json byte for byte
    # (~20 KB per scoring request). The model stays in db.py so the existing
    # table is untouched; it just has no writer any more.
    overview = {
        "features": bundle["features"],
        "solar_eligible": bundle["solar_eligible"],
        "budget": bundle.get("budget", {}),
        "stability": bundle.get("stability"),
        "fuel_scenario": bundle.get("fuel_scenario", "subsidised"),
        "ron95_rm_per_l": bundle.get("ron95_rm_per_l"),
        # The raw sliders, so a scenario view can re-rank with the buyer's own
        # priorities rather than silently falling back to the midpoint.
        # `weights` above holds the derived criteria weights, which cannot be
        # turned back into slider positions.
        "sliders": body.weights.model_dump(),
    }

    # Upsert rather than insert. `result_token` is UNIQUE, so a second /score
    # for the same token used to raise IntegrityError and hand the client a 500
    # for a request that had in fact succeeded — the common path being a
    # timeout on a slow scoring call followed by a retry. Re-scoring with
    # different inputs (a different fuel_scenario, say) hit the same wall.
    # Replacing the row makes a retry idempotent and a re-score do what the
    # caller meant. Kept as select-then-write rather than a dialect ON CONFLICT
    # because this runs on both SQLite and Postgres.
    existing = await db.scalar(
        select(TopsisResult).where(TopsisResult.result_token == token)
    )
    if existing is None:
        db.add(
            TopsisResult(
                result_token=token,
                weights=bundle["weights"],
                ranking_json=bundle["ranking"],
                engine_scores_json=engine_scores,
                overview_json=overview,
            )
        )
    else:
        existing.weights = bundle["weights"]
        existing.ranking_json = bundle["ranking"]
        existing.engine_scores_json = engine_scores
        existing.overview_json = overview
    await db.commit()

    # Start the analyst now rather than on the first read. The client goes
    # straight to /analysis and watches a stage animation for several seconds;
    # generating during that window instead of after it removes the wait from
    # the user's critical path entirely.
    from .results import start_recommendation

    start_recommendation(token)

    return {"token": token, "solar_eligible": bundle["solar_eligible"], "ranked": len(bundle["ranking"])}