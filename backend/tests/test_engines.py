"""Unit tests for the 4 engines + TOPSIS pipeline (plan Section 5, QA gate 10)."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import load_catalog  # noqa: E402
from app.engines import engines  # noqa: E402
from app.engines.topsis import CRITERIA, preference_weights, run_topsis  # noqa: E402
from app.services import scoring  # noqa: E402


BASE_PROFILE = {
    "language": "en",
    "daily_km": 40,
    "trips_per_week": 5,
    "long_trip_frequency": "monthly",
    "long_trip_km": 300,
    "destination_region": "north",
    "can_charge_home": True,
    "home_postcode": "50400",
    "consider_solar": False,
}

DEFAULT_SLIDERS = {"save_money": 50, "environment": 50, "convenience": 50, "future_proofing": 50}


@pytest.fixture(scope="session")
def catalog():
    return load_catalog()


def _by_slug(catalog, slug):
    return next(v for v in catalog if v["id"] == slug)


class TestFeatureEngineering:
    def test_annual_mileage(self):
        features = engines.build_features(BASE_PROFILE)
        assert features["annual_km"] == 40 * 5 * 52
        assert features["can_charge_home"] is True

    def test_home_charging_dominates_convenience(self):
        home = engines.build_features(dict(BASE_PROFILE, home_postcode="50400"))
        nohome = engines.build_features(dict(BASE_PROFILE, can_charge_home=False))
        assert home["charging_convenience"] > nohome["charging_convenience"]

    def test_remote_postcode_lower_density(self):
        city = engines.region_density_base("50400")
        rural = engines.region_density_base("05000")
        assert city > rural


class TestFinancialEngine:
    def test_tco_excludes_price_and_running(self, catalog):
        veh = _by_slug(catalog, "tesla-model-3")
        out = engines.financial_tco_excluding(veh)
        assert out["tco_excluding_rm"] > 0
        comps = out["components"]
        assert set(comps) == {
            "loan_interest_rm", "insurance_10yr_rm",
            "maintenance_10yr_rm", "opportunity_cost_rm", "road_tax_10yr_rm",
        }

    def test_road_tax_in_tco(self, catalog):
        ev = _by_slug(catalog, "proton-emas-5")
        out = engines.financial_tco_excluding(ev)
        assert out["components"]["road_tax_10yr_rm"] == 60 * 10

    def test_loan_uses_catalog_flat_rate(self, catalog):
        ev = _by_slug(catalog, "proton-emas-5")
        out = engines.financial_tco_excluding(ev)
        financed = 99_800 - 9_980
        assert out["components"]["loan_interest_rm"] == round(financed * 0.0175 * 7, 0)

    def test_loan_interest_positive(self):
        assert abs(engines.loan_interest_total(100_000) - 12_250) < 0.01  # 7yr @ 1.75% flat


class TestEnergyEngine:
    def test_home_split_80_20_cheaper_than_station_only(self, catalog):
        ev = _by_slug(catalog, "byd-dolphin")
        energy = scoring.energy_context()
        home = engines.energy_engine(ev, BASE_PROFILE, engines.build_features(BASE_PROFILE), energy)
        nohome = engines.energy_engine(
            ev, dict(BASE_PROFILE, can_charge_home=False),
            engines.build_features(dict(BASE_PROFILE, can_charge_home=False)), energy)
        assert home["cost_rm_yr"] < nohome["cost_rm_yr"]

    def test_hybrid_uses_petrol_cost(self, catalog):
        hyb = _by_slug(catalog, "toyota-camry-hybrid")
        energy = scoring.energy_context()
        out = engines.energy_engine(hyb, BASE_PROFILE, engines.build_features(BASE_PROFILE), energy)
        assert out["litres_yr"] > 0
        assert out["kwh_yr"] == 0
        assert out["ev_share"] == 0.0

    def test_phev_blends_ev_and_petrol(self, catalog):
        phev = _by_slug(catalog, "proton-emas-7-phev")
        energy = scoring.energy_context()
        # daily 200km > 146km EV range -> partial EV-mode share
        prof = dict(BASE_PROFILE, daily_km=200)
        features = engines.build_features(prof)
        out = engines.energy_engine(phev, prof, features, energy)
        assert 0.0 < out["ev_share"] < 1.0
        assert out["kwh_yr"] > 0          # EV-mode share now draws grid power
        assert out["litres_yr"] > 0       # remainder still burns petrol
        assert out["co2_kg_yr"] > 0
        assert out["ev_share"] == pytest.approx(146 / 200, abs=0.01)

    def test_phev_full_ev_when_range_covers_daily(self, catalog):
        phev = _by_slug(catalog, "proton-emas-7-phev")
        energy = scoring.energy_context()
        features = engines.build_features(BASE_PROFILE)  # 40km/day < 146km range
        out = engines.energy_engine(phev, BASE_PROFILE, features, energy)
        assert out["ev_share"] == 1.0
        assert out["litres_yr"] == 0

    def test_phev_home_charging_cheaper_than_station_only(self, catalog):
        phev = _by_slug(catalog, "proton-emas-7-phev")
        energy = scoring.energy_context()
        home = engines.energy_engine(phev, BASE_PROFILE, engines.build_features(BASE_PROFILE), energy)
        noprofile = dict(BASE_PROFILE, can_charge_home=False)
        nohome = engines.energy_engine(phev, noprofile, engines.build_features(noprofile), energy)
        assert home["cost_rm_yr"] < nohome["cost_rm_yr"]


class TestScorePipeline:
    def test_catalog_fully_ranked(self):
        bundle = scoring.score_catalog(BASE_PROFILE, DEFAULT_SLIDERS)
        ranking = bundle["ranking"]
        assert len(ranking) == len(load_catalog())
        assert ranking[0]["rank"] == 1
        ranks = [r["rank"] for r in ranking]
        assert ranks == sorted(ranks)
        # TOPSIS closeness scores within [0, 1]
        for r in ranking:
            assert 0.0 <= r["topsis_score"] <= 1.0

    def test_weights_sum_to_one(self):
        weights = preference_weights({"save_money": 80, "environment": 80, "convenience": 20, "future_proofing": 20})
        assert abs(sum(weights) - 1.0) < 1e-3  # 4dp rounding on 6 criteria

    def test_solar_banner_conditions(self):
        # can_charge_home False -> never eligible
        prof = dict(BASE_PROFILE, can_charge_home=False, consider_solar=True)
        res = scoring.score_catalog(prof, DEFAULT_SLIDERS)
        assert res["solar_eligible"] is False
        # requirement: ticked consider_solar AND can charge home
        prof2 = dict(BASE_PROFILE, consider_solar=True)
        res2 = scoring.score_catalog(prof2, DEFAULT_SLIDERS)
        assert res2["solar_eligible"] is True


class TestTopsis:
    def test_run_topsis_returns_ranked(self):
        rows = []
        for i in range(4):
            rows.append({
                "slug": f"m{i}",
                "financial_score": 90 - i * 10,
                "behaviour_score": 80 - i * 5,
                "infrastructure_score": 70,
                "energy_score": 60 + i * 10,
                "purchase_price_rm": 100_000 + i * 20_000,
                "running_cost_rm_yr": 3_000 + i * 500,
            })
        out = run_topsis(rows, preference_weights(DEFAULT_SLIDERS))
        assert [r["rank"] for r in out] == [1, 2, 3, 4]
        assert out[0]["topsis_score"] >= out[-1]["topsis_score"]

# ---------------------------------------------------------------------------
# Spec Step 02 — hard feasibility gate
# ---------------------------------------------------------------------------


def test_postcode_falls_back_to_state_not_kl():
    """An unmapped Sabah postcode must not inherit Klang Valley coordinates.

    Regression: home_coordinates() used to return _KL for any unknown prefix,
    which reported 300+ chargers within 20 km for users in Tawau or Labuan.
    """
    kl = engines.home_coordinates("50000")
    tawau = engines.home_coordinates("91000")
    assert tawau != kl
    assert engines.public_stations_within("91000") < engines.public_stations_within("50000")


def test_bev_gate_blocks_only_without_any_charging_access():
    no_access = {**BASE_PROFILE, "home_postcode": "91000",
                 "can_charge_home": False, "can_charge_work": False}
    assert engines.bev_charging_gate(no_access)["passed"] is False

    # any one of the three routes to charging is enough
    for override in ({"can_charge_home": True}, {"can_charge_work": True},
                     {"home_postcode": "50000"}):
        assert engines.bev_charging_gate({**no_access, **override})["passed"] is True


def test_gate_removes_bevs_but_never_empties_the_pool():
    profile = {**BASE_PROFILE, "home_postcode": "91000",
               "can_charge_home": False, "can_charge_work": False}
    bundle = scoring.score_catalog(profile, {"save_money": 50, "environment": 50,
                                             "convenience": 50, "future_proofing": 50})
    assert bundle["feasibility"]["passed"] is False
    assert bundle["feasibility"]["bev_removed"] > 0
    assert bundle["ranking"], "gate must never hand back an empty ranking"
    assert not [r for r in bundle["ranking"] if r["type"] == "ev"]
