"""Unit tests for the 4 engines + TOPSIS pipeline (plan Section 5, QA gate 10)."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import load_catalog  # noqa: E402
from app.engines import engines  # noqa: E402
from app.engines.topsis import (  # noqa: E402
    CRITERIA,
    SLIDER_KEYS,
    criteria_bounds,
    preference_weights,
    run_topsis,
)
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

    def test_phev_burns_some_petrol_even_when_range_covers_the_commute(self, catalog):
        """A PHEV must never model as a zero-petrol car.

        Previously ev_share saturated at exactly 1.0 whenever the electric range
        covered the daily commute — true for 22 of 25 catalog PHEVs — so
        litres_yr came out 0 and they scored as pure EVs on cost and CO2. The
        share now blends the commute with the long-trip duty cycle, where only
        the first EV-range km of a round trip are electric.
        """
        phev = _by_slug(catalog, "proton-emas-7-phev")
        energy = scoring.energy_context()
        features = engines.build_features(BASE_PROFILE)  # 40km/day < 146km range
        out = engines.energy_engine(phev, BASE_PROFILE, features, energy)
        assert out["ev_share"] < 1.0
        assert out["litres_yr"] > 0
        assert out["kwh_yr"] > 0

    def test_phev_more_long_trips_means_more_petrol(self, catalog):
        phev = _by_slug(catalog, "proton-emas-7-phev")
        energy = scoring.energy_context()
        def litres(freq):
            p = dict(BASE_PROFILE, long_trip_frequency=freq)
            return engines.energy_engine(phev, p, engines.build_features(p), energy)["litres_yr"]
        assert litres("weekly") > litres("monthly") > litres("rarely")

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
        # m0 is best on every criterion, m3 worst, so the order is unambiguous.
        rows = []
        for i in range(4):
            rows.append({
                "slug": f"m{i}",
                "total_cost_5yr_rm": 140_000 + i * 30_000,
                "resale_retained_pct": 55 - i * 4,
                "behaviour_score": 80 - i * 5,
                "infrastructure_score": 70,
                "co2_kg_yr": 800 + i * 200,
            })
        bounds = criteria_bounds({"budget_max_rm": 250_000}, 15_000)
        out = run_topsis(rows, preference_weights(DEFAULT_SLIDERS), bounds)
        assert [r["rank"] for r in out] == [1, 2, 3, 4]
        assert [r["slug"] for r in out] == ["m0", "m1", "m2", "m3"]
        assert out[0]["topsis_score"] >= out[-1]["topsis_score"]

    def test_ranking_is_independent_of_the_candidate_set(self):
        """The property the bounds exist to give: a scale that other cars cannot move."""
        rows = [{
            "slug": f"m{i}",
            "total_cost_5yr_rm": 130_000 + i * 20_000,
            "resale_retained_pct": 55 - i,
            "behaviour_score": 80 - i,
            "infrastructure_score": 70,
            "co2_kg_yr": 800 + i * 50,
        } for i in range(6)]
        bounds = criteria_bounds({"budget_max_rm": 250_000}, 15_000)
        weights = preference_weights(DEFAULT_SLIDERS)
        full = run_topsis(rows, weights, bounds)
        scores = {r["slug"]: r["topsis_score"] for r in full}
        without_worst = run_topsis(rows[:-1], weights, bounds)
        for r in without_worst:
            assert r["topsis_score"] == scores[r["slug"]], (
                f"{r['slug']} changed score when another alternative was removed"
            )

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


# ---------------------------------------------------------------------------
# Weight-mapping properties (issue.md issues 1, 2 and 13)
#
# The suite tested components, not the mapping, so two defects shipped green:
# a slider at 0 was read as 50, and slider positions 1-18 handed TOPSIS a
# negative weight. test_weights_sum_to_one passed through both, because a sum
# of 1 holds with a negative component present.
# ---------------------------------------------------------------------------


class TestWeightProperties:
    def test_zero_slider_differs_from_midpoint(self):
        """A slider dragged to 0 must not mean the same as leaving it centred."""
        for key in SLIDER_KEYS:
            low = preference_weights(dict(DEFAULT_SLIDERS, **{key: 0}))
            mid = preference_weights(dict(DEFAULT_SLIDERS, **{key: 50}))
            assert low != mid, f"{key}=0 produced the {key}=50 vector"

    def test_weights_never_negative(self):
        """A negative weight inverts a criterion; pymcdm only warns and ranks anyway."""
        for key in SLIDER_KEYS:
            for value in range(0, 101):
                weights = preference_weights(dict(DEFAULT_SLIDERS, **{key: value}))
                # pymcdm treats <= 0 as invalid, so require strictly positive.
                assert all(x > 0 for x in weights), f"{key}={value} -> {weights}"

    def test_weights_sum_to_one_across_the_whole_track(self):
        for key in SLIDER_KEYS:
            for value in (0, 1, 18, 19, 50, 99, 100):
                weights = preference_weights(dict(DEFAULT_SLIDERS, **{key: value}))
                assert abs(sum(weights) - 1.0) < 2e-3, f"{key}={value} -> {sum(weights)}"

    def test_blank_sliders_fall_back_to_the_midpoint(self):
        """Absent, None and empty string are unset; 0 is a real answer."""
        midpoint = preference_weights(DEFAULT_SLIDERS)
        assert preference_weights({}) == midpoint
        assert preference_weights({k: None for k in SLIDER_KEYS}) == midpoint
        assert preference_weights({k: "" for k in SLIDER_KEYS}) == midpoint

    def test_environment_slider_moves_the_carbon_of_the_result(self):
        """The carbon criterion must respond to the carbon slider, in the right direction."""
        def mean_co2(environment: int) -> float:
            bundle = scoring.score_catalog(
                BASE_PROFILE, dict(DEFAULT_SLIDERS, environment=environment)
            )
            top5 = bundle["ranking"][:5]
            return sum(r["co2_kg_yr"] for r in top5) / len(top5)

        assert mean_co2(100) < mean_co2(0)

    def test_raising_a_slider_never_lowers_its_own_criterion_weight(self):
        """Each slider drives its criteria monotonically."""
        pairs = [("environment", CRITERIA.index("co2_kg_yr")),
                 ("future_proofing", CRITERIA.index("resale_retained_pct")),
                 ("convenience", CRITERIA.index("behaviour_score")),
                 ("convenience", CRITERIA.index("infrastructure_score"))]
        for key, index in pairs:
            series = [preference_weights(dict(DEFAULT_SLIDERS, **{key: v}))[index]
                      for v in range(0, 101, 5)]
            assert series == sorted(series), f"{key} is not monotonic: {series}"


# ---------------------------------------------------------------------------
# Resale retention (issue.md issues 4 and 9)
#
# The criterion the "Future-Proofing & Resale" slider drives. Five-year horizon:
# no Malaysian EV listing is older than age 5, so a ten-year figure would be
# invented. The catalogue's 22 unsourced resale_10yr_pct values were removed.
# ---------------------------------------------------------------------------


class TestResaleRetention:
    def test_every_trim_gets_a_retention_and_a_basis(self, catalog):
        for vehicle in catalog:
            pct, basis = engines.resale_retained_pct(vehicle)
            assert 0 < pct < 100, f"{vehicle['id']} -> {pct}"
            assert basis in {"measured", "type_curve", "fallback"}

    def test_hybrids_retain_more_than_evs_at_the_type_level(self, catalog):
        """The signal the whole criterion exists to carry, from 3,441 listings."""
        def type_pct(vtype):
            v = next(x for x in catalog
                     if x["type"] == vtype and engines.resale_retained_pct(x)[1] == "type_curve")
            return engines.resale_retained_pct(v)[0]

        assert type_pct("hybrid") > type_pct("ev"), (
            "EVs depreciating slower than hybrids contradicts the fitted curve"
        )

    def test_the_catalogue_no_longer_carries_unsourced_resale(self, catalog):
        """22 trims held a 10-year figure with no provenance, in a 44-57% band."""
        assert not [v for v in catalog if (v.get("ownership") or {}).get("resale_10yr_pct")]

    def test_measured_models_are_not_all_the_same(self, catalog):
        """A criterion constant within type would be as useless as the old behaviour score."""
        measured = {engines.resale_retained_pct(v)[0] for v in catalog
                    if engines.resale_retained_pct(v)[1] == "measured"}
        assert len(measured) > 5, f"only {len(measured)} distinct measured values"


def test_future_proofing_slider_moves_resale():
    """It used to drive the TCO criterion, moving the top-5 mean price by RM20."""
    def mean_resale(value):
        bundle = scoring.score_catalog(BASE_PROFILE,
                                       dict(DEFAULT_SLIDERS, future_proofing=value))
        top5 = bundle["ranking"][:5]
        return sum(r["resale_retained_pct"] for r in top5) / len(top5)

    assert mean_resale(100) > mean_resale(0)


class TestMaintenanceModel:
    """issue.md issue 11: servicing was three constants keyed on drivetrain.

    162 of 184 trims took one of them, so a RM68,000 Wuling and a RM2.2m
    Maybach were charged the same servicing. It is now fitted log-linearly on
    price with a per-type intercept.
    """

    def _measured(self):
        from app.config import load_catalog
        return [
            v for v in load_catalog()
            if (v.get("ownership") or {}).get("maintenance_rm_yr")
        ]

    def test_fit_reproduces_the_measured_rows_it_was_calibrated_on(self):
        """Guards the constants against drifting away from their own fit."""
        rows = self._measured()
        assert len(rows) >= 20, "calibration set shrank; refit before trusting this"
        errors = [
            abs(engines._maintenance_fallback(v) - float(v["ownership"]["maintenance_rm_yr"]))
            for v in rows
        ]
        assert max(errors) <= 200, f"worst residual RM{max(errors):.0f}"
        assert sum(errors) / len(errors) <= 60, f"mean residual RM{sum(errors)/len(errors):.0f}"

    def test_servicing_rises_with_price_within_a_drivetrain(self):
        """The whole point: a dearer car in the same drivetrain services dearer."""
        cheap = {"type": "ev", "price_rm": 70_000}
        dear = {"type": "ev", "price_rm": 700_000}
        assert engines._maintenance_fallback(dear) > engines._maintenance_fallback(cheap) + 200

    def test_a_hybrid_services_dearer_than_an_ev_at_the_same_price(self):
        """Drivetrain still dominates price, which is why both terms are needed."""
        price = 150_000
        ev = engines._maintenance_fallback({"type": "ev", "price_rm": price})
        hybrid = engines._maintenance_fallback({"type": "hybrid", "price_rm": price})
        assert hybrid > ev

    def test_a_measured_row_is_never_overwritten_by_the_fit(self):
        measured = self._measured()[0]
        value, basis = engines.maintenance_rm_yr(measured)
        assert basis == "measured"
        assert value == float(measured["ownership"]["maintenance_rm_yr"])

    def test_an_unmeasured_row_is_reported_as_estimated(self):
        value, basis = engines.maintenance_rm_yr({"type": "ev", "price_rm": 120_000})
        assert basis == "estimated"
        assert value > 0


class TestPracticality:
    """issue.md issues 5b and 6: convenience could not separate two hybrids.

    behaviour_engine returned a flat constant for everything that was not a
    battery EV, so within-group standard deviation was 0.0 for both hybrids and
    PHEVs and the convenience slider only tilted EV against non-EV.
    """

    def test_a_bigger_boot_scores_higher(self):
        small = {"type": "hybrid", "specs": {"boot_l": 250}}
        large = {"type": "hybrid", "specs": {"boot_l": 650}}
        assert engines.practicality_factor(large) > engines.practicality_factor(small)

    def test_an_unknown_boot_is_neutral_not_penalised(self):
        """Absent data must not read as a small boot; 17 of 184 trims have none."""
        assert engines.practicality_factor({"type": "hybrid", "specs": {}}) == 1.0

    def test_seat_count_does_not_move_the_score(self):
        """Seats are a results-page filter, not a criterion.

        How many seats a buyer needs cannot be inferred from the rest of the
        interview, and the interview is not being lengthened to ask. Scoring
        seat count without knowing the requirement would rank a seven-seat MPV
        above a hatchback for a solo commuter.
        """
        four = {"type": "hybrid", "specs": {"seats": 4, "boot_l": 400}}
        seven = {"type": "hybrid", "specs": {"seats": 7, "boot_l": 400}}
        assert engines.practicality_factor(four) == engines.practicality_factor(seven)

    def test_convenience_now_separates_two_hybrids(self):
        """The degeneracy this issue is about: was std 0.0 within every group."""
        from app.config import load_catalog
        from app.services import scoring
        from tests.test_golden_ranking import GOLDEN_PROFILES, DEFAULT_SLIDERS
        import statistics

        rows = scoring.score_catalog(GOLDEN_PROFILES["kv_home_charging"], DEFAULT_SLIDERS)["ranking"]
        for vtype in ("hybrid", "phev"):
            scores = [r["behaviour_score"] for r in rows if r["type"] == vtype]
            if len(scores) < 3:
                continue
            assert statistics.pstdev(scores) > 0.5, f"{vtype} convenience is still flat"
