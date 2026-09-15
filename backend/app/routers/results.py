from __future__ import annotations

import asyncio
import logging
import time

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import brand_contact, load_policy_markdown, load_solar, settings
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
        # FEATURES P6: how firm rank 1 is under jittered weights. Stored at
        # scoring time so the page does not re-run 400 rankings on every read.
        "stability": result.overview_json.get("stability"),
        "fuel_scenario": result.overview_json.get("fuel_scenario", "subsidised"),
        "solar": load_solar() if result.overview_json.get("solar_eligible") else None,
        "profile": profile_row.profile_json if profile_row else None,
        "recommendation": recommendation.analyst_json if recommendation else None,
        # Where to actually go and buy the thing. Attached per ranked row rather
        # than only for the top pick, because the page lets the reader compare —
        # a contact that only exists for rank 1 is useless the moment they look
        # at rank 2. Brands with nothing verified are simply absent from the map,
        # and the UI renders nothing for them.
        "brand_contacts": {
            row["brand"]: contact
            for row in (result.ranking_json or [])
            if (contact := brand_contact(row.get("brand")))
        },
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
    from ..engines.engines import home_coordinates, infrastructure_access
    from ..services.evidence import charger_mix

    profile = profile_row.profile_json
    access = infrastructure_access(profile)
    # FEATURES P7: what the nearby points ARE, not only how many. The richer
    # station file carries network, connector, power and price for 852 points
    # and nothing in the scoring pipeline has ever read it.
    access["mix"] = charger_mix(home_coordinates(profile.get("home_postcode", "")), 20.0)
    return access


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

@router.get("/{token}/costs")
async def get_costs(token: str, limit: int = 6, db: AsyncSession = Depends(get_db)):
    """FEATURES P1: five-year cost, itemised, for the top `limit` recommendations.

    The engine already computed every line of this and the interface has never
    shown one. Depreciation is 60 to 75 percent of the total and energy, which
    the product implies is the deciding factor, is usually the smallest line but
    one. Presentation only: the ranking still scores what it scored.
    """
    result = await db.scalar(select(TopsisResult).where(TopsisResult.result_token == token))
    if not result:
        raise HTTPException(status_code=404, detail="no result for this token")
    from ..config import load_catalog
    from ..services.costing import five_year_breakdown

    catalog = {v["id"]: v for v in load_catalog()}
    out = []
    for row in (result.ranking_json or [])[:limit]:
        vehicle = catalog.get(row["slug"])
        if not vehicle:
            continue
        out.append({
            "slug": row["slug"],
            "brand": row["brand"],
            "model": row["model"],
            "type": row["type"],
            "price_rm": row["price_rm"],
            **five_year_breakdown(vehicle, row.get("running_cost_rm_yr", 0.0)),
        })
    return {"token": token, "cars": out}


@router.get("/{token}/evidence/{slug}")
async def get_evidence(token: str, slug: str, db: AsyncSession = Depends(get_db)):
    """FEATURES P2: the real used listings behind one car's resale figure.

    Resale is a scored criterion, so this number already moves recommendations.
    `basis` says whether it was measured from this model's own listings or is
    carrying its drivetrain average, which is the honest answer for 162 of 184
    trims.
    """
    result = await db.scalar(select(TopsisResult).where(TopsisResult.result_token == token))
    if not result:
        raise HTTPException(status_code=404, detail="no result for this token")
    from ..config import load_catalog
    from ..engines.engines import resale_retained_pct
    from ..services.evidence import used_listings

    vehicle = next((v for v in load_catalog() if v["id"] == slug), None)
    if not vehicle:
        raise HTTPException(status_code=404, detail="vehicle not in catalogue")
    retained_pct, basis = resale_retained_pct(vehicle)
    return {
        "slug": slug,
        "price_rm": float(vehicle["price_rm"]),
        "retained_5yr_pct": round(retained_pct, 1),
        "basis": basis,
        **used_listings(slug),
    }


@router.get("/{token}/breakeven")
async def get_breakeven(token: str, db: AsyncSession = Depends(get_db)):
    """FEATURES P4: the mileage at which the best EV overtakes the best hybrid.

    At subsidised RON95 an efficient hybrid costs about RM7.16 per 100 km
    against an EV's RM8.44, so the honest answer is often that there is no
    crossing and the case for an EV rests on purchase price and servicing
    instead. Both scenarios are returned, because which one holds for five years
    is a policy question rather than a property of the cars.
    """
    result = await db.scalar(select(TopsisResult).where(TopsisResult.result_token == token))
    profile_row = await db.scalar(select(Profile).where(Profile.token == token))
    if not result or not profile_row:
        raise HTTPException(status_code=404, detail="no result for this token")
    from ..config import load_catalog
    from ..engines.engines import build_features
    from ..services import energy_context
    from ..services.costing import breakeven_km_per_year

    catalog = {v["id"]: v for v in load_catalog()}
    ranking = result.ranking_json or []
    ev = next((catalog[r["slug"]] for r in ranking
               if r["type"] == "ev" and r["slug"] in catalog), None)
    hybrid = next((catalog[r["slug"]] for r in ranking
                   if r["type"] in ("hybrid", "phev") and r["slug"] in catalog), None)
    if not ev or not hybrid:
        return {"token": token, "available": False,
                "reason": "the shortlist does not contain both an EV and a hybrid"}

    profile = profile_row.profile_json
    features = build_features(profile)
    scenarios = {
        name: breakeven_km_per_year(ev, hybrid, energy_context(name), profile, features)
        for name in ("subsidised", "market")
    }
    return {"token": token, "available": True, "scenarios": scenarios}


@router.get("/{token}/compare")
async def get_compare(token: str, a: str, b: str, db: AsyncSession = Depends(get_db)):
    """FEATURES P5: two cars side by side on every criterion and every cost line.

    The product asks a binary question and answers it with a ranked list of 184.
    Nothing in the interface lets a buyer hold two candidates against each other,
    which is how the decision is actually made.
    """
    result = await db.scalar(select(TopsisResult).where(TopsisResult.result_token == token))
    if not result:
        raise HTTPException(status_code=404, detail="no result for this token")
    from ..config import load_catalog
    from ..engines.topsis import CRITERIA
    from ..services.costing import five_year_breakdown

    catalog = {v["id"]: v for v in load_catalog()}
    by_slug = {r["slug"]: r for r in (result.ranking_json or [])}
    picked = []
    for slug in (a, b):
        row = by_slug.get(slug)
        if not row or slug not in catalog:
            raise HTTPException(status_code=404, detail=f"{slug} is not in this ranking")
        picked.append({
            "slug": slug,
            "brand": row["brand"], "model": row["model"], "variant": row.get("variant", ""),
            "type": row["type"], "rank": row["rank"], "price_rm": row["price_rm"],
            "score": row["topsis_score"],
            "criteria": {c: row[c] for c in CRITERIA if c in row},
            "costs": five_year_breakdown(catalog[slug], row.get("running_cost_rm_yr", 0.0)),
        })
    return {"token": token, "weights": result.weights, "cars": picked}


@router.get("/{token}/scenario")
async def get_scenario(token: str, fuel: str = "market", limit: int = 8,
                       db: AsyncSession = Depends(get_db)):
    """FEATURES P3: re-rank this profile under a different fuel price.

    Deliberately does NOT persist. The stored result is the answer the buyer
    asked for; a scenario is a view over it, and writing one back would both
    overwrite their result and hit the UNIQUE constraint on
    `topsis_results.result_token`, since /score only ever inserts.
    """
    from ..services import FUEL_SCENARIOS, scoring

    if fuel not in FUEL_SCENARIOS:
        raise HTTPException(status_code=422, detail=f"unknown fuel scenario: {fuel}")
    profile_row = await db.scalar(select(Profile).where(Profile.token == token))
    result = await db.scalar(select(TopsisResult).where(TopsisResult.result_token == token))
    if not profile_row or not result:
        raise HTTPException(status_code=404, detail="no result for this token")

    sliders = (result.overview_json or {}).get("sliders") or {
        "save_money": 50, "environment": 50, "convenience": 50, "future_proofing": 50,
    }
    bundle = scoring.score_catalog(
        profile_row.profile_json, sliders, fuel_scenario=fuel, with_stability=False
    )
    return {
        "token": token,
        "fuel_scenario": fuel,
        "ron95_rm_per_l": bundle["ron95_rm_per_l"],
        "ranking": [
            {k: r[k] for k in ("rank", "slug", "brand", "model", "type",
                               "price_rm", "topsis_score", "running_cost_rm_yr")}
            for r in bundle["ranking"][:limit]
        ],
    }
