"""Guardrails for the seven features in FEATURES.md.

Each test names the claim the feature makes to a user, because that is what
would be wrong if the test failed.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import load_catalog  # noqa: E402
from app.engines.engines import build_features, home_coordinates  # noqa: E402
from app.services import FUEL_SCENARIOS, energy_context, scoring  # noqa: E402
from app.services.costing import (  # noqa: E402
    NCD_LADDER,
    OWNERSHIP_YEARS,
    breakeven_km_per_year,
    five_year_breakdown,
    insurance_paid,
)
from app.services.evidence import charger_mix, used_listings  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_golden_ranking import DEFAULT_SLIDERS, GOLDEN_PROFILES  # noqa: E402

CATALOG = {v["id"]: v for v in load_catalog()}


@pytest.fixture(scope="module")
def kv_rows():
    bundle = scoring.score_catalog(
        GOLDEN_PROFILES["kv_home_charging"], DEFAULT_SLIDERS, with_stability=False
    )
    return {r["slug"]: r for r in bundle["ranking"]}


class TestCostBreakdown:
    """P1. The interface implied energy decides this; depreciation does."""

    def test_depreciation_is_the_largest_line(self, kv_rows):
        for slug in ("wuling-bingo", "toyota-yaris-cross"):
            out = five_year_breakdown(CATALOG[slug], kv_rows[slug]["running_cost_rm_yr"])
            assert out["lines"][0]["key"] == "depreciation", out["lines"][0]
            assert out["lines"][0]["share"] > 0.4

    def test_energy_is_a_minor_line(self, kv_rows):
        """RON95 at RM1.99 makes an efficient hybrid cost about what an EV costs."""
        out = five_year_breakdown(CATALOG["wuling-bingo"],
                                  kv_rows["wuling-bingo"]["running_cost_rm_yr"])
        energy = next(l for l in out["lines"] if l["key"] == "energy")
        assert energy["share"] < 0.15, "energy should not dominate at subsidised fuel"

    def test_lines_sum_to_the_total(self, kv_rows):
        out = five_year_breakdown(CATALOG["toyota-vios"],
                                  kv_rows["toyota-vios"]["running_cost_rm_yr"])
        assert abs(sum(l["amount_rm"] for l in out["lines"]) - out["total_rm"]) <= 2

    def test_insurance_is_not_the_year_one_premium_repeated(self):
        """The old model charged a 0% NCD premium on a new car ten times over."""
        base, k = 6_000.0, 0.15
        naive = base * OWNERSHIP_YEARS
        assert insurance_paid(base, k) < naive * 0.65
        assert insurance_paid(base, k, years=10) < base * 10 * 0.45

    def test_ncd_ladder_matches_piam(self):
        assert NCD_LADDER == (0.0, 0.25, 0.30, 0.3833, 0.45, 0.55)


class TestFuelScenario:
    """P3. The recommendation rests on a subsidy the interface never mentions."""

    def test_market_fuel_is_dearer_than_the_pump_price(self):
        sub = float(energy_context("subsidised")["fuel"]["ron95_rm_per_l"])
        mkt = float(energy_context("market")["fuel"]["ron95_rm_per_l"])
        assert mkt > sub, "market RON95 must exceed the BUDI95 pump price"

    def test_removing_the_subsidy_does_not_favour_hybrids(self):
        """Dearer petrol must never make a hybrid look better than it did."""
        profile = GOLDEN_PROFILES["high_mileage_budget"]
        def ev_count(scenario):
            bundle = scoring.score_catalog(profile, DEFAULT_SLIDERS,
                                           fuel_scenario=scenario, with_stability=False)
            return sum(1 for r in bundle["ranking"][:5] if r["type"] == "ev")
        assert ev_count("market") >= ev_count("subsidised")

    def test_unknown_scenario_is_rejected(self):
        with pytest.raises(ValueError):
            energy_context("wishful")

    def test_both_scenarios_are_declared(self):
        assert set(FUEL_SCENARIOS) == {"subsidised", "market"}


class TestBreakeven:
    """P4. Often the honest answer is that mileage does not decide it."""

    def test_no_home_charging_produces_a_real_crossover(self):
        profile = GOLDEN_PROFILES["east_no_charging"]
        out = breakeven_km_per_year(
            CATALOG["wuling-bingo"], CATALOG["toyota-yaris-cross"],
            energy_context("subsidised"), profile, build_features(profile),
        )
        assert out["verdict"] == "crossover"
        assert 0 < out["breakeven_km_per_year"] <= 100_000
        assert out["ev_rm_per_100km"] > out["hybrid_rm_per_100km"]

    def test_an_implausible_crossover_is_not_reported_as_advice(self):
        """Nearly parallel lines cross at a mileage nobody drives."""
        profile = GOLDEN_PROFILES["kv_home_charging"]
        out = breakeven_km_per_year(
            CATALOG["wuling-bingo"], CATALOG["toyota-yaris-cross"],
            energy_context("subsidised"), profile, build_features(profile),
        )
        assert out["breakeven_km_per_year"] is None
        assert "note" in out


class TestEvidence:
    """P2 and P7. Two data assets the platform collected and never showed."""

    def test_a_measured_model_has_listings_behind_it(self):
        out = used_listings("byd-atto-3")
        assert out["available"] and out["total_listings"] > 20
        assert all(l["price_rm"] > 5_000 for l in out["listings"])

    def test_listings_are_never_the_corrupted_prices(self):
        """Carlist stored prices as text until issue 3; 'RM79,800' read as 79."""
        for slug in ("byd-atto-3", "honda-city", "toyota-vios"):
            for listing in used_listings(slug)["listings"]:
                assert listing["price_rm"] >= 5_000, listing

    def test_charger_mix_separates_fast_from_slow(self):
        mix = charger_mix(home_coordinates("50400"), 20.0)
        assert mix["total"] > 0
        assert mix["dc_fast"] + mix["ac_or_slow"] == mix["total"]
        assert mix["networks"], "networks should be named, not just counted"

    def test_a_place_with_no_chargers_says_so(self):
        mix = charger_mix(home_coordinates("91000"), 20.0)
        assert mix["total"] == 0 and mix["fastest_kw"] is None


class TestStability:
    """P6. Rank 1 is only an answer if it survives the weights moving."""

    def test_a_firm_profile_is_reported_firm(self):
        """Uses high_mileage_budget, whose leader holds 0.98 under jitter.

        This was kv_home_charging until 2026-09-14, when it fell to 0.79 and
        stopped being a firm example. That is the model reporting a real change
        rather than a fault: its top two are separated by 0.0093, and the
        criteria that used to be constants now move under re-weighting. The
        assertion here is about the firm PATH working, so it needs a profile
        that is actually firm; test_a_tied_profile_is_not_reported_firm covers
        the other branch.
        """
        out = scoring.score_catalog(GOLDEN_PROFILES["high_mileage_budget"],
                                    DEFAULT_SLIDERS)["stability"]
        assert out["firm"] and out["leader_share"] >= 0.8

    def test_a_tied_profile_is_not_reported_firm(self):
        """After the gate removes 42 EVs the survivors are barely separated."""
        out = scoring.score_catalog(GOLDEN_PROFILES["bev_gate_blocked"],
                                    DEFAULT_SLIDERS)["stability"]
        assert not out["firm"]
        assert len(out["contenders"]) >= 2

    def test_stability_is_deterministic(self):
        profile = GOLDEN_PROFILES["east_no_charging"]
        a = scoring.score_catalog(profile, DEFAULT_SLIDERS)["stability"]
        b = scoring.score_catalog(profile, DEFAULT_SLIDERS)["stability"]
        assert a == b, "a seeded jitter must report the same confidence twice"

    def test_it_can_be_skipped(self):
        out = scoring.score_catalog(GOLDEN_PROFILES["kv_home_charging"],
                                    DEFAULT_SLIDERS, with_stability=False)
        assert out["stability"] is None


# ---------------------------------------------------------------------------
# The endpoints, against a live app. Every one of these serves a claim the
# interface makes to a buyer, so a 500 here is a wrong answer on the page.
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    import os

    os.environ["DATABASE_URL"] = (
        f"sqlite+aiosqlite:///{tmp_path_factory.mktemp('api')}/features.db"
    )
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def scored(client):
    profile = {k: v for k, v in GOLDEN_PROFILES["kv_home_charging"].items()}
    token = client.post("/profile", json=profile).json()["token"]
    r = client.post(
        "/score", json={"token": token, "profile": profile, "weights": DEFAULT_SLIDERS}
    )
    assert r.status_code == 200, r.text
    return token


class TestFeatureEndpoints:
    def test_costs_lead_with_depreciation(self, client, scored):
        cars = client.get(f"/results/{scored}/costs?limit=3").json()["cars"]
        assert cars and cars[0]["lines"][0]["key"] == "depreciation"

    def test_evidence_reports_its_basis(self, client, scored):
        slug = client.get(f"/results/{scored}/costs?limit=1").json()["cars"][0]["slug"]
        body = client.get(f"/results/{scored}/evidence/{slug}").json()
        assert body["basis"] in {"measured", "type_curve", "fallback"}
        assert 0 < body["retained_5yr_pct"] < 100

    def test_evidence_404s_for_a_car_that_does_not_exist(self, client, scored):
        assert client.get(f"/results/{scored}/evidence/not-a-car").status_code == 404

    def test_breakeven_answers_under_both_fuel_scenarios(self, client, scored):
        body = client.get(f"/results/{scored}/breakeven").json()
        if body["available"]:
            assert set(body["scenarios"]) == {"subsidised", "market"}

    def test_compare_returns_exactly_the_two_asked_for(self, client, scored):
        cars = client.get(f"/results/{scored}/costs?limit=2").json()["cars"]
        a, b = cars[0]["slug"], cars[1]["slug"]
        got = client.get(f"/results/{scored}/compare", params={"a": a, "b": b}).json()
        assert [c["slug"] for c in got["cars"]] == [a, b]

    def test_compare_rejects_a_car_outside_the_ranking(self, client, scored):
        a = client.get(f"/results/{scored}/costs?limit=1").json()["cars"][0]["slug"]
        assert client.get(
            f"/results/{scored}/compare", params={"a": a, "b": "not-a-car"}
        ).status_code == 404

    def test_scenario_reprices_fuel_without_persisting(self, client, scored):
        """A scenario is a view. Writing it back would overwrite the buyer's result."""
        before = client.get(f"/results/{scored}").json()["ranking"]
        market = client.get(f"/results/{scored}/scenario", params={"fuel": "market"}).json()
        after = client.get(f"/results/{scored}").json()["ranking"]
        assert market["ron95_rm_per_l"] > 1.99
        assert [r["slug"] for r in before] == [r["slug"] for r in after]

    def test_scenario_rejects_an_unknown_fuel(self, client, scored):
        assert client.get(
            f"/results/{scored}/scenario", params={"fuel": "wishful"}
        ).status_code == 422

    def test_infrastructure_now_describes_the_chargers(self, client, scored):
        mix = client.get(f"/results/{scored}/infrastructure").json()["mix"]
        assert mix["dc_fast"] + mix["ac_or_slow"] == mix["total"]

    def test_results_carries_the_confidence_figure(self, client, scored):
        body = client.get(f"/results/{scored}").json()
        assert body["stability"]["leader"]
        assert 0 < body["stability"]["leader_share"] <= 1


class TestScoreIsIdempotent:
    """Issue 17: /score inserted unconditionally into a UNIQUE column.

    A second call for the same token raised IntegrityError and the client saw a
    500 for a request that had already succeeded. A timeout-then-retry is the
    common way to reach it.
    """

    def test_scoring_the_same_token_twice_succeeds(self, client):
        profile = dict(GOLDEN_PROFILES["kv_home_charging"])
        token = client.post("/profile", json=profile).json()["token"]
        body = {"token": token, "profile": profile, "weights": DEFAULT_SLIDERS}

        first = client.post("/score", json=body)
        second = client.post("/score", json=body)

        assert first.status_code == 200, first.text
        assert second.status_code == 200, second.text

    def test_rescoring_replaces_the_stored_result(self, client):
        profile = dict(GOLDEN_PROFILES["kv_home_charging"])
        token = client.post("/profile", json=profile).json()["token"]
        body = {"token": token, "profile": profile, "weights": DEFAULT_SLIDERS}

        assert client.post("/score", json=body).status_code == 200
        second = client.post("/score", json={**body, "fuel_scenario": "market"})
        assert second.status_code == 200, second.text

        # the stored row reflects the second call rather than the first
        stored = client.get(f"/results/{token}").json()
        assert stored["fuel_scenario"] == "market"
