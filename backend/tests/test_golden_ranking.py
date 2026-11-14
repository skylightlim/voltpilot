"""Shared buyer profiles and ranking property tests.

The recorded-ranking fixture (ranking_golden.json) and its comparison tests were
removed 2026-11-14: any scoring or data change moved the top ten and demanded a
regeneration. What remains is the profile set other tests import, plus tests of
properties that must hold whatever the scores are.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import load_catalog  # noqa: E402
from app.services import scoring  # noqa: E402

DEFAULT_SLIDERS = {"save_money": 50, "environment": 50,
                   "convenience": 50, "future_proofing": 50}

_BASE = {
    "language": "en", "daily_km": 40, "trips_per_week": 5,
    "long_trip_frequency": "monthly", "long_trip_km": 300,
    "destination_region": "north", "can_charge_home": True,
    "can_charge_work": False, "home_postcode": "50400", "consider_solar": False,
    "budget_max_rm": 0, "grid_region": "peninsular",
    "monthly_electricity_bill_rm": 0,
}

# Four buyers that reach the engine by four different routes. Each one is here
# because it exercises a branch the others do not; the counts in the comments
# are what they produced when this fixture was first recorded.
GOLDEN_PROFILES = {
    # 89 of 184 in budget, gate passes, top 5 all EV
    "kv_home_charging": dict(_BASE, home_postcode="50400", budget_max_rm=250_000),
    # 19 hybrids in budget. The gate passed here on 11 public stations until
    # 2026-11-14; it now needs a home or workplace charger (issue.md issue 34),
    # so this profile and bev_gate_blocked differ only in where they live
    "east_no_charging": dict(_BASE, home_postcode="93000", can_charge_home=False,
                             can_charge_work=False, grid_region="east_malaysia",
                             destination_region="east_malaysia", budget_max_rm=200_000),
    # 26 in budget: the budget filter under real pressure
    "high_mileage_budget": dict(_BASE, daily_km=120, trips_per_week=6,
                                long_trip_frequency="weekly", budget_max_rm=120_000),
    # gate fails with no public stations either; every plug-in car is removed
    "bev_gate_blocked": dict(_BASE, home_postcode="91000", can_charge_home=False,
                             can_charge_work=False, grid_region="east_malaysia",
                             destination_region="east_malaysia", budget_max_rm=200_000),
}


def test_ranking_survives_removal_of_irrelevant_alternatives(monkeypatch):
    """Dropping cars nobody would buy must not reorder the cars they would.

    Was 156 of 182 moving with the winner changing, because both the
    normalisation and the ideal point were read off the candidate set. Fixed
    2026-09-11 by scoring raw criteria against profile-derived bounds; issue.md
    issue 8. Kept strict at <= 5 so any return to set-derived scaling fails here.
    """
    full = load_catalog()
    profile = GOLDEN_PROFILES["kv_home_charging"] | {"budget_max_rm": 0}
    before = [r["slug"] for r in scoring.score_catalog(profile, DEFAULT_SLIDERS)["ranking"]]
    monkeypatch.setattr(
        scoring, "load_catalog",
        lambda: [v for v in full if float(v["price_rm"]) < 2_000_000],
    )
    after = [r["slug"] for r in scoring.score_catalog(profile, DEFAULT_SLIDERS)["ranking"]]

    survivors = [s for s in before if s in set(after)]
    moved = sum(1 for s in survivors if survivors.index(s) != after.index(s))
    assert moved <= 5, f"{moved} of {len(survivors)} alternatives reordered"


@pytest.mark.parametrize("daily_km", [10, 40, 100, 200])
def test_no_budget_path_clips_nothing(daily_km):
    """No catalogue vehicle may exceed the cost ceiling when no budget is given.

    A ceiling below the dearest car makes everything above it clip to the same
    worst value, so price stops separating them. At the old RM400,000 stand-in
    that was 26 cars from RM625,888 to RM2,238,888 scoring within 0.0731, with a
    RM2m Rolls-Royce Spectre ahead of a RM635,800 BMW X7 — issue.md issue 7's
    compression, mirrored onto the expensive end.

    Parametrised over mileage because the ceiling carries a running-cost term:
    low mileage makes it tightest, so that is where a new car clips first. If a
    dearer vehicle enters the catalogue this fails, and NO_BUDGET_CEILING_RM in
    topsis.py needs raising — which is the point of asserting it here rather
    than trusting the constant to stay calibrated.
    """
    from app.engines import engines as engines_mod
    from app.engines import topsis as topsis_mod

    profile = GOLDEN_PROFILES["kv_home_charging"] | {
        "budget_max_rm": 0, "daily_km": daily_km,
    }
    rows = scoring.score_catalog(profile, DEFAULT_SLIDERS)["ranking"]
    _, ceiling = topsis_mod.criteria_bounds(
        profile, engines_mod.annual_mileage_km(profile)
    )[0]

    over = [r for r in rows if r["holding_cost_5yr_rm"] > ceiling]
    assert not over, (
        f"{len(over)} vehicles clip the cost ceiling (RM{ceiling:,.0f}); "
        f"dearest is {max(over, key=lambda r: r['holding_cost_5yr_rm'])['slug']} "
        f"at RM{max(r['holding_cost_5yr_rm'] for r in over):,.0f}. "
        "Raise NO_BUDGET_CEILING_RM."
    )
