"""Standalone calculators: hire purchase, insurance, road tax.

Read-only and stateless — no profile, no token, no database. A buyer can reach
these without going through the interview, which is the point: "what would this
car cost me a month" is a question people arrive with, and answering it is not
the same as recommending a car.

Every response carries a `basis` string naming the rate table or JPJ schedule
it came from, because each figure is a claim about Malaysian regulation or a
published bank rate rather than something we are free to model as we like.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from ..config import load_catalog
from ..services import calculators

router = APIRouter(prefix="/calculators", tags=["calculators"])

VehicleType = str


@router.get("/loan")
async def calc_loan(
    price_rm: float = Query(..., ge=0, le=20_000_000),
    vehicle_type: VehicleType = Query("ev"),
    down_payment_rm: float | None = Query(None, ge=0, le=20_000_000),
    tenure_years: int = Query(calculators.DEFAULT_TENURE_YEARS, ge=1, le=9),
    flat_rate_pct: float | None = Query(None, ge=0, le=20),
):
    """Monthly instalment and total interest, with the effective rate disclosed."""
    return calculators.loan(
        price_rm, vehicle_type=vehicle_type, down_payment_rm=down_payment_rm,
        tenure_years=tenure_years, flat_rate_pct=flat_rate_pct,
    )


@router.get("/insurance")
async def calc_insurance(
    sum_insured_rm: float = Query(..., ge=0, le=20_000_000),
    vehicle_type: VehicleType = Query("ev"),
    engine_cc: float = Query(0, ge=0, le=10_000),
    policy_year: int = Query(1, ge=1, le=20),
    east_malaysia: bool = Query(False),
):
    """Annual comprehensive premium, car-only, with the PIAM NCD applied."""
    return calculators.insurance(
        sum_insured_rm, vehicle_type=vehicle_type, engine_cc=engine_cc,
        policy_year=policy_year, east_malaysia=east_malaysia,
    )


@router.get("/road-tax")
async def calc_road_tax(
    engine_cc: float | None = Query(None, ge=0, le=10_000),
    non_saloon: bool = Query(False),
    slug: str | None = Query(None, max_length=80),
):
    """Annual LKM. Pass `engine_cc` for a combustion or hybrid car, or `slug` for an EV.

    EVs are looked up rather than computed: the JPJ schedule for them is keyed
    on motor power in watts and its bracket table is not in this repository, so
    computing one here would mean inventing a schedule.
    """
    if slug:
        found = calculators.road_tax_for_catalog_vehicle(slug)
        if not found:
            raise HTTPException(status_code=404, detail="no catalog vehicle with that slug")
        return found
    if engine_cc is None:
        raise HTTPException(
            status_code=422,
            detail="pass engine_cc for a combustion or hybrid car, or slug for an EV",
        )
    return {
        "engine_cc": engine_cc,
        "non_saloon": non_saloon,
        "road_tax_rm": round(calculators.road_tax_ice(engine_cc, non_saloon=non_saloon), 2),
        "basis": "JPJ LKM schedule (Bajet 2009), Peninsular Malaysia, private individual",
    }


@router.get("/vehicles")
async def calc_vehicles():
    """The catalogue, trimmed to what the calculators need to prefill a car.

    So the page can offer "pick your car" instead of making someone find their
    own engine capacity, which most owners do not know.
    """
    out = []
    for v in load_catalog():
        specs, own = v.get("specs") or {}, v.get("ownership") or {}
        out.append({
            "slug": v["id"],
            "label": " ".join(x for x in (v["brand"], v["model"], v.get("variant") or "") if x).strip(),
            "type": v["type"],
            "price_rm": v["price_rm"],
            "engine_cc": specs.get("engine_cc") or 0,
            "road_tax_rm": own.get("road_tax_rm"),
            "loan_rate_pct": own.get("loan_rate_pct"),
        })
    out.sort(key=lambda r: r["label"])
    return {"vehicles": out, "count": len(out)}


@router.get("/affordability")
async def calc_affordability(
    monthly_budget_rm: float = Query(..., ge=0, le=200_000),
    vehicle_type: VehicleType = Query("ev"),
    tenure_years: int = Query(calculators.DEFAULT_TENURE_YEARS, ge=1, le=9),
    down_payment_rm: float = Query(0, ge=0, le=20_000_000),
    flat_rate_pct: float | None = Query(None, ge=0, le=20),
):
    """The loan solved backwards: what a monthly figure actually reaches."""
    return calculators.affordability(
        monthly_budget_rm, vehicle_type=vehicle_type, tenure_years=tenure_years,
        down_payment_rm=down_payment_rm, flat_rate_pct=flat_rate_pct,
    )


@router.get("/depreciation")
async def calc_depreciation(
    price_rm: float = Query(..., ge=0, le=20_000_000),
    vehicle_type: VehicleType = Query("ev"),
    slug: str | None = Query(None, max_length=80),
    years: int = Query(5, ge=1, le=10),
):
    """Projected resale value year by year, from the fitted used-market curve."""
    return calculators.depreciation(
        price_rm, vehicle_type=vehicle_type, slug=slug, years=years,
    )


@router.get("/ownership")
async def calc_ownership(
    slug: str = Query(..., max_length=80),
    annual_km: float = Query(15_000, ge=1, le=500_000),
    can_charge_home: bool = Query(True),
    fuel_scenario: str = Query("subsidised"),
):
    """Five-year total cost for one catalogue car, at this buyer's mileage."""
    if fuel_scenario not in ("subsidised", "market"):
        raise HTTPException(status_code=422, detail="fuel_scenario must be subsidised or market")
    out = calculators.ownership(
        slug, annual_km=annual_km, can_charge_home=can_charge_home,
        fuel_scenario=fuel_scenario,
    )
    if out is None:
        raise HTTPException(status_code=404, detail="no catalog vehicle with that slug")
    return out
