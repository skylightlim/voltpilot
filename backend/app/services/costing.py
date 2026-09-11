"""Five-year cost of ownership, itemised (issue.md issue 16, FEATURES P1/P3/P4).

Display and analysis only. This does NOT change what the engine ranks on. The
criteria still score `total_cost_10yr_rm`, because moving the ranking to a
five-year basis forces a decision recorded but not taken in issue 16: putting
depreciation into the cost criterion makes `resale_retained_pct` a second
measurement of the same quantity, which is the double-counting issue 4 removed.

Five years is the right horizon for showing a buyer their costs even while the
ranking stays where it is. It is where the resale data ends, since no Malaysian
EV listing is older than age 5; it sits inside the four-to-six year window that
is Malaysia's replacement rate; and it is roughly where a seven-year hire
purchase has accrued 91% of its interest.
"""

from __future__ import annotations

import math

from ..engines import engines

OWNERSHIP_YEARS = 5

# PIAM-standardised No-Claim Discount for private cars, indexed by policy year.
# Every Malaysian insurer follows the same ladder.
NCD_LADDER = (0.0, 0.25, 0.30, 0.3833, 0.45, 0.55)

# De-tariffication lets insurers price the higher repair risk of an older car,
# so the premium does not follow the sum insured all the way down.
SUM_INSURED_FLOOR = 0.35

# Share of a 7-year hire-purchase interest bill paid by year 5, on the reducing
# balance basis the Hire Purchase (Amendment) Act 2026 made mandatory on
# 2026-06-01. Measured against the amortisation schedule; the Rule of 78 it
# replaced differs by RM57 on RM100,000, so the reform matters more for naming
# the method correctly than for the arithmetic.
INTEREST_PAID_BY_YEAR_5 = 0.91

# Fitted decay rates per drivetrain, used to age the sum insured. Read from the
# curve so the two stay in step.
_DEFAULT_K = 0.15


def _decay_k(vehicle: dict) -> float:
    from ..config import load_depreciation_curve

    curve = load_depreciation_curve()
    by_model = (curve.get("by_model") or {}).get(vehicle.get("id"))
    if by_model:
        return float(by_model["k_per_year"])
    by_type = (curve.get("by_type") or {}).get(vehicle.get("type"))
    return float(by_type["k_per_year"]) if by_type else _DEFAULT_K


def _ncd_factor(policy_year: int) -> float:
    """Premium multiplier after the no-claim discount for that policy year."""
    return 1.0 - NCD_LADDER[min(policy_year, len(NCD_LADDER)) - 1]


def insurance_paid(base_premium: float, decay_k: float, years: int = OWNERSHIP_YEARS) -> float:
    """Premiums actually paid: the NCD ladder against a declining sum insured.

    `base_premium` is the catalogue's `insurance_rm_yr`, documented as year one
    at 0% NCD on a sum insured equal to the NEW price. Charging it once per year
    overstates five years by 1.78x and ten years by 2.74x, which is how
    insurance came to be 57.6% of the old ten-year total.
    """
    total = 0.0
    for year in range(1, years + 1):
        sum_insured = max(math.exp(-decay_k * (year - 1)), SUM_INSURED_FLOOR)
        total += base_premium * _ncd_factor(year) * sum_insured
    return total


def five_year_breakdown(vehicle: dict, running_cost_rm_yr: float) -> dict:
    """Itemised five-year cost, largest line first.

    Depreciation is typically 60 to 75 percent of it, and the platform has never
    shown it. Energy, which the interface implies is the deciding factor, is
    usually the smallest line but one.
    """
    price = float(vehicle["price_rm"])
    own = vehicle.get("ownership") or {}
    k = _decay_k(vehicle)

    retained_pct, retained_basis = engines.resale_retained_pct(vehicle)
    financed, rate, tenure, down = engines._loan_parameters(vehicle)

    lines = {
        "depreciation": price * (1.0 - retained_pct / 100.0),
        "loan_interest": engines.loan_interest_total(financed, tenure, rate)
        * INTEREST_PAID_BY_YEAR_5,
        "insurance": insurance_paid(
            float(own.get("insurance_rm_yr") or price * 0.015), k
        ),
        "energy": float(running_cost_rm_yr) * OWNERSHIP_YEARS,
        "maintenance": float(
            own.get("maintenance_rm_yr") or engines._maintenance_fallback(vehicle)
        )
        * OWNERSHIP_YEARS,
        "road_tax": float(own.get("road_tax_rm", 0)) * OWNERSHIP_YEARS,
        "opportunity_cost": down * 0.035 * OWNERSHIP_YEARS,
    }
    total = sum(lines.values())
    ordered = sorted(lines.items(), key=lambda kv: -kv[1])
    return {
        "years": OWNERSHIP_YEARS,
        "total_rm": round(total, 0),
        "resale_value_rm": round(price * retained_pct / 100.0, 0),
        "retained_pct": round(retained_pct, 1),
        "retained_basis": retained_basis,
        "lines": [
            {
                "key": key,
                "amount_rm": round(value, 0),
                "share": round(value / total, 4) if total else 0.0,
            }
            for key, value in ordered
        ],
    }


def breakeven_km_per_year(ev: dict, hybrid: dict, energy: dict,
                          profile: dict, features: dict) -> dict:
    """Annual mileage at which the EV's five-year cost overtakes the hybrid's.

    Everything except energy is fixed per car, so the two totals are straight
    lines in annual mileage and cross at most once. At subsidised RON95 the EV
    is often dearer per kilometre than an efficient hybrid, in which case the
    lines diverge and there is no crossing. Saying that plainly is the point of
    the feature.
    """
    def at(vehicle: dict, km: float) -> tuple[float, float]:
        feat = {**features, "annual_km": km}
        per_year = engines.energy_engine(vehicle, profile, feat, energy)["cost_rm_yr"]
        fixed = five_year_breakdown(vehicle, 0.0)["total_rm"]
        return fixed, per_year

    ev_fixed, ev_rate = at(ev, 10_000.0)
    hy_fixed, hy_rate = at(hybrid, 10_000.0)
    # cost(km) = fixed + rate_per_km * km * YEARS, rate measured at 10,000 km
    ev_per_km = ev_rate / 10_000.0
    hy_per_km = hy_rate / 10_000.0
    slope = (ev_per_km - hy_per_km) * OWNERSHIP_YEARS
    intercept = ev_fixed - hy_fixed

    result = {
        "ev_slug": ev["id"],
        "hybrid_slug": hybrid["id"],
        "ev_rm_per_100km": round(ev_per_km * 100, 2),
        "hybrid_rm_per_100km": round(hy_per_km * 100, 2),
        "ev_fixed_5yr_rm": round(ev_fixed, 0),
        "hybrid_fixed_5yr_rm": round(hy_fixed, 0),
        "your_km_per_year": round(features.get("annual_km", 0), 0),
    }
    # Beyond this the crossover is arithmetic rather than advice: 100,000 km a
    # year is 274 km every single day. When the two cost-per-km figures are
    # close the lines are nearly parallel and cross somewhere absurd, which is
    # not a break-even a buyer can act on.
    MAX_PLAUSIBLE_KM = 100_000.0

    if slope >= 0 and intercept >= 0:
        result["breakeven_km_per_year"] = None
        result["verdict"] = "hybrid_always"
    elif slope <= 0 and intercept <= 0:
        result["breakeven_km_per_year"] = None
        result["verdict"] = "ev_always"
    else:
        km = -intercept / slope
        if 0 < km <= MAX_PLAUSIBLE_KM:
            result["breakeven_km_per_year"] = round(km, 0)
            result["verdict"] = "crossover"
            result["you_are_past_it"] = features.get("annual_km", 0) >= km
        else:
            # The lines do cross, but not inside any mileage a person drives.
            result["breakeven_km_per_year"] = None
            result["verdict"] = "hybrid_always" if intercept > 0 else "ev_always"
            result["note"] = (
                "the two are within RM"
                f"{abs(ev_per_km - hy_per_km) * 100:.2f} per 100 km, so mileage "
                "does not decide this one"
            )
    return result
