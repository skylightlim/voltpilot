"""Five-year cost of ownership, itemised (issue.md issue 16, FEATURES P1/P3/P4).

The cost criterion is built from this: scoring.py ranks on `total_rm` LESS the
depreciation line (as `holding_cost_5yr_rm`), because depreciation is already
scored as `resale_retained_pct` and was being counted twice. The full total,
depreciation included, is what the results page shows as `total_cost_5yr_rm`.
`total_cost_10yr_rm` is still published but no longer scored.

Five years is the right horizon. It is where the resale data ends, since no
Malaysian EV listing is older than age 5; it sits inside the four-to-six year window that
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
    maintenance_yr, maintenance_basis = engines.maintenance_rm_yr(vehicle)
    financed, rate, tenure, down = engines._loan_parameters(vehicle)

    lines = {
        "depreciation": price * (1.0 - retained_pct / 100.0),
        "loan_interest": engines.loan_interest_total(financed, tenure, rate)
        * INTEREST_PAID_BY_YEAR_5,
        "insurance": insurance_paid(
            float(own.get("insurance_rm_yr") or price * 0.015), k
        ),
        "energy": float(running_cost_rm_yr) * OWNERSHIP_YEARS,
        "maintenance": maintenance_yr * OWNERSHIP_YEARS,
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
        # 24 of 171 trims carry a published servicing figure (the best sellers);
        # the rest are fitted from drivetrain and price band. Surfaced so the
        # page can say which.
        "maintenance_basis": maintenance_basis,
        # Where a published figure came from (distributor, document, date), so
        # the page can name the source instead of only saying "measured".
        "maintenance_note": own.get("maintenance_note"),
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
    """Annual mileage at which the EV's five-year cost crosses the hybrid's.

    Everything except energy is fixed per car, so the gap between the two
    totals moves only with mileage. It used to be treated as two straight lines
    from rates measured at 10,000 km, which stopped being true twice over: the
    home charging rate climbs as the kWh push the household up TNB's tariff
    steps, and since BUDI95's quota is priced in, a hybrid's petrol jumps from
    RM1.99 to the unsubsidised price past 3,600 L a year. A thirsty hybrid can
    therefore be cheaper than an EV at 20,000 km and dearer at 50,000, a
    crossing the straight lines put at the wrong mileage or missed entirely.

    So the gap is evaluated on the real cost functions across every plausible
    mileage and the first sign change is refined by bisection. At subsidised
    RON95 the EV is often dearer per kilometre than an efficient hybrid and the
    totals never cross; saying that plainly is the point of the feature.
    """
    fixed = {
        "ev": five_year_breakdown(ev, 0.0)["total_rm"],
        "hybrid": five_year_breakdown(hybrid, 0.0)["total_rm"],
    }

    def per_year(vehicle: dict, km: float) -> float:
        feat = {**features, "annual_km": km}
        return engines.energy_engine(vehicle, profile, feat, energy)["cost_rm_yr"]

    def gap(km: float) -> float:
        """EV five-year total minus the hybrid's; negative means the EV is cheaper."""
        return (fixed["ev"] + per_year(ev, km) * OWNERSHIP_YEARS) - (
            fixed["hybrid"] + per_year(hybrid, km) * OWNERSHIP_YEARS
        )

    ev_rate = per_year(ev, 10_000.0)
    hy_rate = per_year(hybrid, 10_000.0)
    ev_per_km = ev_rate / 10_000.0
    hy_per_km = hy_rate / 10_000.0

    result = {
        "ev_slug": ev["id"],
        "hybrid_slug": hybrid["id"],
        "ev_rm_per_100km": round(ev_per_km * 100, 2),
        "hybrid_rm_per_100km": round(hy_per_km * 100, 2),
        "ev_fixed_5yr_rm": round(fixed["ev"], 0),
        "hybrid_fixed_5yr_rm": round(fixed["hybrid"], 0),
        "your_km_per_year": round(features.get("annual_km", 0), 0),
    }
    # Beyond this the crossover is arithmetic rather than advice: 100,000 km a
    # year is 274 km every single day. When the two cost-per-km figures are
    # close the lines are nearly parallel and cross somewhere absurd, which is
    # not a break-even a buyer can act on.
    MIN_KM, MAX_PLAUSIBLE_KM, STEP_KM = 1_000.0, 100_000.0, 1_000.0

    lo_km, lo_gap = MIN_KM, gap(MIN_KM)
    first_gap = lo_gap
    crossing = None
    km = MIN_KM
    while km < MAX_PLAUSIBLE_KM:
        km = min(km + STEP_KM, MAX_PLAUSIBLE_KM)
        g = gap(km)
        if (g < 0) != (lo_gap < 0):
            a, b, ga = lo_km, km, lo_gap
            for _ in range(20):  # to within 1 km
                mid = (a + b) / 2
                gm = gap(mid)
                if (gm < 0) == (ga < 0):
                    a, ga = mid, gm
                else:
                    b = mid
            crossing = (a + b) / 2
            break
        lo_km, lo_gap = km, g

    if crossing is not None:
        result["breakeven_km_per_year"] = round(crossing, 0)
        result["verdict"] = "crossover"
        # Which car is cheaper on the low-mileage side of the crossing. It used
        # to be the EV by construction; the fuel quota made the other order real.
        result["cheaper_below"] = "ev" if first_gap < 0 else "hybrid"
        result["you_are_past_it"] = features.get("annual_km", 0) >= crossing
        return result

    result["breakeven_km_per_year"] = None
    result["verdict"] = "hybrid_always" if first_gap > 0 else "ev_always"
    # The gap closes across the whole range without reaching zero: the lines
    # would cross, but not inside any mileage a person drives.
    if abs(lo_gap) < abs(first_gap):
        result["note"] = (
            "the two are within RM"
            f"{abs(ev_per_km - hy_per_km) * 100:.2f} per 100 km, so mileage "
            "does not decide this one"
        )
    return result


def five_year_cost_curve(ev: dict, hybrid: dict, energies: dict[str, dict],
                         profile: dict, features: dict, max_km: float,
                         points: int = 21) -> list[dict]:
    """Five-year total of the best EV and best hybrid across annual mileages.

    What the fuel panel draws: one EV line (electricity does not depend on the
    RON95 scenario) and one hybrid line per scenario in `energies`, so the
    reader sees the subsidy as the gap between two hybrid lines and the quota as
    the bend in the subsidised one. The same arithmetic as breakeven_km_per_year,
    sampled instead of solved.
    """
    fixed_ev = five_year_breakdown(ev, 0.0)["total_rm"]
    fixed_hy = five_year_breakdown(hybrid, 0.0)["total_rm"]
    any_energy = next(iter(energies.values()))
    out = []
    for i in range(points):
        km = max_km * i / (points - 1)
        feat = {**features, "annual_km": km}
        row = {
            "km": round(km, 0),
            "ev_rm": round(fixed_ev + engines.energy_engine(
                ev, profile, feat, any_energy)["cost_rm_yr"] * OWNERSHIP_YEARS, 0),
        }
        for name, energy in energies.items():
            per_year = engines.energy_engine(hybrid, profile, feat, energy)["cost_rm_yr"]
            row[f"hybrid_{name}_rm"] = round(fixed_hy + per_year * OWNERSHIP_YEARS, 0)
        out.append(row)
    return out
