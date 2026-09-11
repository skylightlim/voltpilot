"""Recorded rankings, so a scoring change shows up as a reviewable diff.

The suite tested that 184 cars come back and that ranks ascend. It never
tested WHICH cars, so any change to the scoring could reorder every
recommendation and still pass. Issues 4, 7, 8, 9 and 10 in issue.md each move
the ranking; this file is the baseline they get reviewed against.

To accept an intended change, regenerate and explain what moved in the commit:

    REGEN_GOLDEN=1 .venv/bin/python -m pytest tests/test_golden_ranking.py
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import load_catalog  # noqa: E402
from app.services import scoring  # noqa: E402

GOLDEN_PATH = Path(__file__).resolve().parent / "fixtures" / "ranking_golden.json"
TOP_N = 10

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
    # 73 in budget, gate PASSES on 11 public stations, yet hybrids still win on
    # scoring: this is the charging penalty doing the work, not the gate
    "east_no_charging": dict(_BASE, home_postcode="93000", can_charge_home=False,
                             can_charge_work=False, grid_region="east_malaysia",
                             destination_region="east_malaysia", budget_max_rm=200_000),
    # 26 in budget: the budget filter under real pressure
    "high_mileage_budget": dict(_BASE, daily_km=120, trips_per_week=6,
                                long_trip_frequency="weekly", budget_max_rm=120_000),
    # gate FAILS on 0 stations and removes 42 BEVs before scoring
    "bev_gate_blocked": dict(_BASE, home_postcode="91000", can_charge_home=False,
                             can_charge_work=False, grid_region="east_malaysia",
                             destination_region="east_malaysia", budget_max_rm=200_000),
}


def _snapshot(profile: dict) -> dict:
    """What we record for one buyer: the shortlist, plus the state that shaped it."""
    bundle = scoring.score_catalog(profile, DEFAULT_SLIDERS)
    ranking = bundle["ranking"]
    gap = round(ranking[0]["topsis_score"] - ranking[1]["topsis_score"], 4)
    return {
        "considered": bundle["budget"]["considered"],
        "catalog_total": bundle["budget"]["catalog_total"],
        "gate_passed": bundle["feasibility"]["passed"],
        "bev_removed": bundle["feasibility"]["bev_removed"],
        "gap_1_2": gap,
        "top": [
            {
                "rank": r["rank"],
                "slug": r["slug"],
                "score": r["topsis_score"],
                "type": r["type"],
                "price_rm": r["price_rm"],
            }
            for r in ranking[:TOP_N]
        ],
    }


def _regenerate() -> dict:
    payload = {
        "_readme": "Recorded by tests/test_golden_ranking.py. Regenerate with "
                   "REGEN_GOLDEN=1 pytest tests/test_golden_ranking.py and say "
                   "what moved in the commit message.",
        "catalog_rows": len(load_catalog()),
        "sliders": DEFAULT_SLIDERS,
        "profiles": {name: _snapshot(p) for name, p in GOLDEN_PROFILES.items()},
    }
    GOLDEN_PATH.parent.mkdir(parents=True, exist_ok=True)
    GOLDEN_PATH.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
    return payload


if os.environ.get("REGEN_GOLDEN"):
    _regenerate()


@pytest.fixture(scope="session")
def golden() -> dict:
    if not GOLDEN_PATH.exists():
        pytest.fail(f"no golden fixture at {GOLDEN_PATH}; run with REGEN_GOLDEN=1")
    return json.loads(GOLDEN_PATH.read_text())


def _format_side_by_side(before: list[dict], after: list[dict]) -> str:
    lines = ["  pos  recorded                       now"]
    for i in range(max(len(before), len(after))):
        b = before[i] if i < len(before) else None
        a = after[i] if i < len(after) else None
        bs = f"{b['slug']:<22} {b['score']:.4f}" if b else "-"
        as_ = f"{a['slug']:<22} {a['score']:.4f}" if a else "-"
        moved = "  <-- moved" if (b and a and b["slug"] != a["slug"]) else ""
        lines.append(f"  {i + 1:>3}  {bs}  {as_}{moved}")
    return "\n".join(lines)


@pytest.mark.parametrize("name", sorted(GOLDEN_PROFILES))
def test_recommended_cars_have_not_moved(name, golden):
    """The loud one: a different car, or the same cars in a different order."""
    recorded = golden["profiles"][name]["top"]
    current = _snapshot(GOLDEN_PROFILES[name])["top"]
    before = [r["slug"] for r in recorded]
    after = [r["slug"] for r in current]
    if before != after:
        pytest.fail(
            f"\n{name}: the recommended cars changed.\n"
            f"{_format_side_by_side(recorded, current)}\n\n"
            f"  If this is the change you intended, regenerate:\n"
            f"    REGEN_GOLDEN=1 .venv/bin/python -m pytest tests/test_golden_ranking.py\n"
        )


@pytest.mark.parametrize("name", sorted(GOLDEN_PROFILES))
def test_scores_have_not_drifted(name, golden):
    """The quiet one: same cars in the same order, but the numbers moved.

    Split from the test above on purpose. A weight re-tune shifts every score
    without moving a single car, and that should not read as "the
    recommendations changed" when it is not what happened.
    """
    recorded = golden["profiles"][name]["top"]
    current = _snapshot(GOLDEN_PROFILES[name])["top"]
    if [r["slug"] for r in recorded] != [r["slug"] for r in current]:
        pytest.skip("order changed; test_recommended_cars_have_not_moved owns this")

    drifted = [
        (b["slug"], b["score"], a["score"])
        for b, a in zip(recorded, current) if b["score"] != a["score"]
    ]
    if drifted:
        rows = "\n".join(
            f"    {slug:<22} {was:.4f} -> {now:.4f}  ({now - was:+.4f})"
            for slug, was, now in drifted
        )
        pytest.fail(
            f"\n{name}: same cars in the same order, but {len(drifted)} "
            f"of {len(recorded)} scores moved.\n{rows}\n\n"
            f"  Ranking is unaffected. Regenerate to accept:\n"
            f"    REGEN_GOLDEN=1 .venv/bin/python -m pytest tests/test_golden_ranking.py\n"
        )


@pytest.mark.parametrize("name", sorted(GOLDEN_PROFILES))
def test_candidate_pool_is_unchanged(name, golden):
    """Budget filter and feasibility gate decide who is scored at all."""
    recorded = golden["profiles"][name]
    current = _snapshot(GOLDEN_PROFILES[name])
    for key in ("considered", "catalog_total", "gate_passed", "bev_removed"):
        assert current[key] == recorded[key], (
            f"{name}: {key} was {recorded[key]}, now {current[key]}"
        )


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
