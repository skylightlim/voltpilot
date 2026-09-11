"""TOPSIS decision engine (D1, D18).

6 criteria matrix per catalogue model:
  1. financial score      (0-100, max)
  2. behaviour score      (0-100, max)
  3. infrastructure score (0-100, max)
  4. energy score         (0-100, max)
  5. purchase price       (RM, min)
  6. running cost/yr      (RM/yr, min)

Policy criterion removed 2026-08-14 (policy incentives no longer scored).

User's 4 preference sliders -> criteria weights (normalized 0-1).
"""

from __future__ import annotations

import numpy as np

# Two of these used to be `financial_score` and `energy_score`, 0-100 values
# produced by normalize_cost_scores, which min-maxes over the CANDIDATE SET.
# That made every row's score depend on which other cars happened to be present,
# so the budget filter and the feasibility gate silently reshuffled the ranking:
# dropping the two cars priced over RM2m moved 156 of 182 alternatives and
# changed the winner. Scoring the raw quantities against profile-derived bounds
# removes the dependency entirely (measured: 0 of 182 move).
CRITERIA = [
    "total_cost_10yr_rm",
    "resale_retained_pct",
    "behaviour_score",
    "infrastructure_score",
    "co2_kg_yr",
]
TYPES = [-1, 1, 1, 1, -1]  # min cost and emissions, max resale and fit

# Re-tuned 2026-09-11 when the three money criteria merged. The previous split
# gave purchase price, 10-year TCO and running cost 0.24 + 0.17 + 0.16, but
# those three sum to a single quantity, so money carried 57% of the decision by
# accident rather than by choice. Cost and resale now total 0.50, which is a
# deliberate figure for a purchase this size.
BASE_WEIGHTS = {
    "total_cost_10yr_rm": 0.34,
    "resale_retained_pct": 0.16,
    "behaviour_score": 0.17,
    "infrastructure_score": 0.14,
    "co2_kg_yr": 0.19,
}


SLIDER_KEYS = ("save_money", "environment", "convenience", "future_proofing")


def _slider(sliders: dict, key: str) -> float:
    """A 0-100 slider as a 0.0-2.0 multiplier, centred on 1.0 at the midpoint.

    Tests for None rather than falsiness. `float(x or 50)` read a slider dragged
    to 0 as 50, because 0 is falsy — so "this does not matter to me" and "I am
    neutral on this" produced the same weight vector, and the far-left third of
    every track was unreachable.
    """
    raw = sliders.get(key)
    if raw is None or raw == "":
        raw = 50
    return max(0.0, min(100.0, float(raw))) / 50.0


# pymcdm rejects a weight of exactly zero (`np.any(weights <= 0)` in
# validators.py), so a criterion that drops out is floored here instead. At 1e-6
# of its base weight it contributes ~1e-7 of the total and cannot move a rank,
# while keeping the vector inside pymcdm's documented contract.
MIN_MULTIPLIER = 1e-6


def _clamp(multiplier: float) -> float:
    """Slider multipliers scale a weight; they must never invert it.

    The maps below are unbounded lines: `1 + 1.6 * (s - 1)` crosses zero at
    slider 18.75, so positions 1-18 used to hand TOPSIS a negative weight. That
    swaps which end of the column is the ideal solution, and the carbon
    criterion started rewarding the highest-emitting car in the set.
    """
    return max(MIN_MULTIPLIER, multiplier)


def preference_weights(sliders: dict) -> list[float]:
    """Map the 4 sliders (0-100) onto the 6 criteria, then normalize to sum 1."""
    s = {k: _slider(sliders, k) for k in SLIDER_KEYS}

    # Each slider now drives the criterion it names. future_proofing used to
    # boost the TCO criterion, which correlates 0.97 with purchase price, so a
    # slider labelled "Future-Proofing & Resale" made the engine marginally more
    # price-sensitive and nothing else: its full travel moved the top-5 mean
    # price by RM20. It drives resale retention now, which is what the label,
    # and the hint about "5-year used market resale retention", promise.
    w = dict(BASE_WEIGHTS)
    w["total_cost_10yr_rm"] *= _clamp(1.0 + 1.0 * (s["save_money"] - 1))
    w["resale_retained_pct"] *= _clamp(1.0 + 1.2 * (s["future_proofing"] - 1))
    w["co2_kg_yr"] *= _clamp(1.0 + 1.6 * (s["environment"] - 1))
    w["behaviour_score"] *= _clamp(1.0 + 0.7 * (s["convenience"] - 1))
    w["infrastructure_score"] *= _clamp(1.0 + 0.8 * (s["convenience"] - 1))

    total = sum(w.values())
    # Floor at one unit in the last place. MIN_MULTIPLIER survives the division
    # but not `round(..., 4)`, which returns it to exactly 0.0 and back outside
    # pymcdm's contract. 0.0001 is four orders below the smallest real weight.
    weights = [max(0.0001, round(v / total, 4)) for v in w.values()]
    # Guard the invariant here rather than at the call site: pymcdm only warns
    # on a bad weight and ranks anyway, so a bad vector would ship silently.
    assert all(x > 0 for x in weights), f"non-positive weight: {weights}"
    return weights


# Cheapest car anyone in this market buys new. Anchors the bottom of the price
# axis so the scale does not start at whatever the cheapest candidate happens
# to be.
PRICE_FLOOR_RM = 30_000.0

# Used when the buyer states no budget. Only reachable while budget stays
# optional; see issue.md issue 8.
ASSUMED_BUDGET_RM = 400_000.0

# Ceilings as multiples of a profile input, calibrated against the catalogue so
# no real vehicle clips: the highest observed 10-yr TCO is 0.67x price, the
# dearest running cost RM0.324/km, the dirtiest 0.226 kg CO2/km.
TCO_CEILING_X_BUDGET = 0.70
RUNNING_CEILING_RM_PER_KM = 0.33
CO2_CEILING_KG_PER_KM = 0.23


def criteria_bounds(profile: dict, annual_km: float) -> list[tuple[float, float]]:
    """Fixed [worst, best] span per criterion, derived only from the PROFILE.

    Every bound comes from something the buyer told us, never from the candidate
    set, which is what makes the ranking stable: adding or removing a car cannot
    move the scale. Two earlier designs failed here and are worth not repeating.

    Min-max over the candidate set (the original) let a single RM2.24m car own
    the price axis: 5% of rows took 54% of it, so a RM68k Perodua and a RM300k
    BMW sat 0.107 apart on affordability.

    Fixed bounds taken from the whole catalogue fixed that but broke the common
    case. A buyer capped at RM120k has candidates spanning RM67.8k to RM119.9k,
    which is 5.3% of a RM86k-RM1.08m axis, so price stopped discriminating for
    exactly the buyers most sensitive to it. Anchoring the ceiling on their own
    budget restores 58-83% axis usage across the golden profiles.
    """
    budget = float(profile.get("budget_max_rm") or 0) or ASSUMED_BUDGET_RM
    km = max(float(annual_km or 0), 1000.0)
    # Ceiling on total cost: the dearest car the filter admits is
    # BUDGET_STRETCH x budget, its ownership costs add at most
    # TCO_CEILING_X_BUDGET of that, and ten years of running cost adds the rest.
    cost_ceiling = 2.0 * budget + 10.0 * RUNNING_CEILING_RM_PER_KM * km
    return [
        (PRICE_FLOOR_RM, cost_ceiling),
        (0.0, 100.0),
        (0.0, 100.0),
        (0.0, 100.0),
        (0.0, CO2_CEILING_KG_PER_KM * km),
    ]


def run_topsis(matrix_rows: list[dict], weights: list[float],
               bounds: list[tuple[float, float]]) -> list[dict]:
    """Returns rows enriched with rank + closeness score (0-1).

    Still TOPSIS, Ci = D-/(D+ + D-), but both the normalisation and the ideal
    points come from `bounds` rather than from the alternatives. pymcdm's TOPSIS
    reads its ideal off the matrix, which reintroduces the set dependence the
    bounds exist to remove, so the four lines of arithmetic are done here.
    """
    lo = np.array([b[0] for b in bounds], dtype=float)
    hi = np.array([b[1] for b in bounds], dtype=float)
    types = np.array(TYPES)
    w = np.array(weights, dtype=float)

    matrix = np.array([[float(r[c]) for c in CRITERIA] for r in matrix_rows], dtype=float)
    unit = np.clip((matrix - lo) / np.where(hi - lo == 0, 1.0, hi - lo), 0.0, 1.0)
    # orient every column so 1.0 is always the good end
    weighted = np.where(types == 1, unit, 1.0 - unit) * w

    # The ideal is the bounds themselves, not the best row present.
    d_plus = np.sqrt(((weighted - w) ** 2).sum(axis=1))
    d_minus = np.sqrt((weighted ** 2).sum(axis=1))
    closeness = np.divide(d_minus, d_plus + d_minus,
                          out=np.zeros_like(d_minus), where=(d_plus + d_minus) > 0)

    # Break ties on the slug, not on array position. Cars that saturate every
    # bound (a Maybach against an assumed budget, say) score identically to the
    # last decimal, and argsort would order them by whatever index they happened
    # to occupy. That made a stable ranking look like rank reversal: removing
    # two unrelated rows reshuffled five tied alternatives whose scores had not
    # moved at all. Sorting by (-score, slug) makes the output reproducible.
    order = sorted(range(len(matrix_rows)),
                   key=lambda i: (-closeness[i], matrix_rows[i]["slug"]))

    out = []
    for pos, idx in enumerate(order, start=1):
        d = dict(matrix_rows[idx])
        d["rank"] = int(pos)
        d["topsis_score"] = round(float(closeness[idx]), 4)
        out.append(d)
    return out