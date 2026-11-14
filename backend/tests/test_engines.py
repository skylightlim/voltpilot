"""Unit tests for the 4 engines + TOPSIS pipeline (plan Section 5, QA gate 10)."""

from __future__ import annotations

import json
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
        assert features["commute_km_yr"] == 40 * 5 * 52
        # the monthly Penang run is driven too: 12 round trips
        assert features["long_trip_km_yr"] == pytest.approx(12 * features["long_trip_round_km"])
        assert features["annual_km"] == features["commute_km_yr"] + features["long_trip_km_yr"]
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
        financed = ev["price_rm"] * 0.90  # 10% down, read from the row so a re-price does not break it
        assert out["components"]["loan_interest_rm"] == round(financed * 0.0175 * 7, 0)

    def test_loan_interest_positive(self):
        assert abs(engines.loan_interest_total(100_000) - 12_250) < 0.01  # 7yr @ 1.75% flat


class TestEnergyEngine:
    def test_home_split_80_20_cheaper_than_station_only(self, catalog):
        ev = _by_slug(catalog, "byd-atto-3")
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
                "holding_cost_5yr_rm": 40_000 + i * 10_000,
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
            "holding_cost_5yr_rm": 40_000 + i * 6_000,
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


def test_gate_passes_only_on_a_charger_of_the_buyers_own():
    no_access = {**BASE_PROFILE, "home_postcode": "91000",
                 "can_charge_home": False, "can_charge_work": False}
    assert engines.bev_charging_gate(no_access)["passed"] is False

    for override in ({"can_charge_home": True}, {"can_charge_work": True}):
        assert engines.bev_charging_gate({**no_access, **override})["passed"] is True

    # 290 public points around KLCC are not somewhere to charge (issue 34)
    city = engines.bev_charging_gate({**no_access, "home_postcode": "50000"})
    assert city["passed"] is False and city["reason"] == "public_only"
    assert city["stations_within_radius"] >= engines.BEV_GATE_MIN_STATIONS


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

    def _calibration(self):
        """The 22 points the constants were fitted on, frozen at fit time.

        Read from the live catalog until 2026-11-12, when six of these cars left it
        (no longer sold new) and others were re-priced to their current variant.
        Their measured servicing costs are still the data the fit describes.
        """
        path = Path(__file__).parent / "fixtures" / "maintenance_calibration.json"
        return json.loads(path.read_text())["rows"]

    def test_fit_reproduces_the_measured_rows_it_was_calibrated_on(self):
        """Guards the constants against drifting away from their own fit."""
        rows = [
            {"type": r["type"], "price_rm": r["price_rm"],
             "ownership": {"maintenance_rm_yr": r["maintenance_rm_yr"]}}
            for r in self._calibration()
        ]
        assert len(rows) == 22, "calibration set changed; refit before trusting this"
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
        """Absent data must not read as a small boot; 10 of 170 trims have none."""
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


_MID = {"save_money": 50, "environment": 50, "convenience": 50, "future_proofing": 50}


class TestNothingFitsTheBudget:
    """issue.md issues 28 and 29: both empty-pool fallbacks returned the catalogue.

    A budget under the cheapest car fell back to every model with the cost axis
    still anchored on the stated figure, so all of them clipped to the same
    worst cost and a RM20,000 buyer was shown a RM648,888 EQS at rank 3.
    """

    def _cheapest(self, vehicles):
        return min(float(v["price_rm"]) for v in vehicles)

    @pytest.mark.parametrize("budget", [1, 5_000, 20_000, 60_000])
    def test_a_budget_below_the_market_gets_the_nearest_cars(self, budget):
        bundle = scoring.score_catalog({**BASE_PROFILE, "budget_max_rm": budget},
                                       _MID, with_stability=False)
        ranking = bundle["ranking"]
        assert bundle["budget"]["applied"] is False
        assert bundle["budget"]["fallback"] == "nearest_over_budget"
        assert len(ranking) == scoring.NEAREST_FALLBACK
        cheapest = sorted(float(v["price_rm"]) for v in load_catalog())
        assert sorted(r["price_rm"] for r in ranking) == cheapest[:scoring.NEAREST_FALLBACK]

    @pytest.mark.parametrize("budget", [1, 5_000, 20_000, 60_000])
    def test_cost_still_separates_them(self, budget):
        """The axis must neither saturate nor invert: nobody clips at either end."""
        bundle = scoring.score_catalog({**BASE_PROFILE, "budget_max_rm": budget},
                                       _MID, with_stability=False)
        lo, hi = bundle["bounds"]["holding_cost_5yr_rm"]
        assert hi > lo
        costs = [r["holding_cost_5yr_rm"] for r in bundle["ranking"]]
        assert all(lo < c < hi for c in costs), (lo, hi, costs)

    def test_the_normal_path_reports_no_fallback(self):
        bundle = scoring.score_catalog({**BASE_PROFILE, "budget_max_rm": 150_000},
                                       _MID, with_stability=False)
        assert bundle["budget"]["applied"] is True
        assert bundle["budget"]["fallback"] is None
        assert bundle["budget"]["scale_max_rm"] == 150_000

    def test_gate_failure_never_brings_the_evs_back(self):
        """RM80,000 plus the stretch buys three cars, all EVs, and this buyer
        cannot charge one.

        The gate used to empty the pool and then refill it with the whole
        catalogue: the EVs it had just removed, 89 more, and every car over
        budget, under `budget.applied: True`.
        """
        profile = {**BASE_PROFILE, "home_postcode": "91000", "budget_max_rm": 80_000,
                   "can_charge_home": False, "can_charge_work": False}
        bundle = scoring.score_catalog(profile, _MID, with_stability=False)
        ranking = bundle["ranking"]
        assert bundle["feasibility"]["passed"] is False
        in_reach = [v for v in load_catalog()
                    if float(v["price_rm"]) <= 80_000 * scoring.BUDGET_STRETCH]
        assert in_reach and all(v["type"] == "ev" for v in in_reach)
        assert bundle["feasibility"]["bev_removed"] == len(in_reach)
        assert not [r for r in ranking if r["type"] == "ev"]
        assert bundle["budget"]["applied"] is False
        assert bundle["budget"]["fallback"] == "nearest_over_budget"
        runnable = sorted(float(v["price_rm"]) for v in load_catalog() if v["type"] == "hybrid")
        assert sorted(r["price_rm"] for r in ranking) == runnable[:scoring.NEAREST_FALLBACK]

    @pytest.mark.parametrize("budget", [0, -5, 1, 29_999, float("inf"), float("nan"), None, "x"])
    def test_bounds_never_invert(self, budget):
        (lo, hi), *_ = criteria_bounds({"budget_max_rm": budget}, 10_000)
        assert hi > lo and hi < float("inf")


class TestTripDistanceUsesTheRealHome:
    """issue.md issue 30: unmapped postcode prefixes were measured from KL."""

    def test_an_unmapped_prefix_is_not_scored_from_kl(self):
        # Jertih, Terengganu: no station names a 22xxx postcode, so the prefix
        # table misses and the old lookup put this buyer in Kuala Lumpur. (18xxx
        # was the example until 2026-11-14, when the postcode parser stopped
        # reading Gua Musang's lot number as its postcode and mapped it.)
        assert "22" not in engines._load_prefix_centroids()
        km = engines.destination_distance_km(
            {"home_postcode": "22000", "destination_region": "kl"})
        assert km > 250

    @pytest.mark.parametrize("postcode", ["50400", "18300", "22000", "02600", "91000", "96000", ""])
    def test_it_agrees_with_the_distance_the_results_page_shows(self, postcode):
        profile = {"home_postcode": postcode, "destination_region": "kl"}
        route = engines.infrastructure_access(profile)["route"]
        km = engines.destination_distance_km(profile)
        if route.get("local"):
            assert km < engines.LOCAL_TRIP_KM * engines.ROAD_FACTOR
        else:
            # haversine against the page's equirectangular projection
            assert km == pytest.approx(route["route_km"], rel=0.02)


class TestLongTripsAreDriven:
    """issue.md issue 32: long trips changed convenience scores and nothing else.

    Annual mileage was the commute alone, so the kilometres of a monthly or
    weekly long trip were never costed, and never emitted any CO2.
    """

    def _energy(self, catalog, slug, profile):
        return engines.energy_engine(_by_slug(catalog, slug), profile,
                                     engines.build_features(profile), scoring.energy_context())

    def test_more_frequent_trips_mean_more_kilometres(self):
        km = [engines.annual_mileage_km(dict(BASE_PROFILE, long_trip_frequency=f))
              for f in ("rarely", "monthly", "weekly")]
        assert km[0] < km[1] < km[2]
        assert km[0] > engines.commute_km_yr(BASE_PROFILE)

    def test_a_hybrid_burns_fuel_in_proportion(self, catalog):
        rarely = dict(BASE_PROFILE, long_trip_frequency="rarely")
        weekly = dict(BASE_PROFILE, long_trip_frequency="weekly")
        a = self._energy(catalog, "toyota-camry-hybrid", rarely)
        b = self._energy(catalog, "toyota-camry-hybrid", weekly)
        ratio = engines.annual_mileage_km(weekly) / engines.annual_mileage_km(rarely)
        assert b["litres_yr"] / a["litres_yr"] == pytest.approx(ratio, rel=0.01)

    def test_an_ev_pays_highway_rates_past_its_range(self, catalog):
        """Trip kilometres beyond the usable range cost more per km than the commute."""
        commute_only = dict(BASE_PROFILE, destination_region="kl", long_trip_km=0)
        tripper = dict(BASE_PROFILE, long_trip_frequency="weekly")
        a = self._energy(catalog, "proton-emas-5", commute_only)
        b = self._energy(catalog, "proton-emas-5", tripper)
        per_km_a = a["cost_rm_yr"] / engines.annual_mileage_km(commute_only)
        per_km_b = b["cost_rm_yr"] / engines.annual_mileage_km(tripper)
        assert per_km_b > per_km_a * 1.15
        # CO2 does not care where the kWh was bought
        assert (b["co2_kg_yr"] / engines.annual_mileage_km(tripper)
                == pytest.approx(a["co2_kg_yr"] / engines.annual_mileage_km(commute_only), rel=0.01))

    def test_a_trip_within_range_never_sees_a_dc_charger(self, catalog):
        """A 60 km round trip costs less per km than one past the car's range."""
        local = dict(BASE_PROFILE, destination_region="kl", long_trip_km=0,
                     long_trip_frequency="weekly")
        far = dict(BASE_PROFILE, long_trip_km=0, long_trip_frequency="weekly")
        assert engines.build_features(local)["long_trip_round_km"] < 100
        per_km = lambda p: (self._energy(catalog, "proton-emas-5", p)["cost_rm_yr"]  # noqa: E731
                            / engines.annual_mileage_km(p))
        assert per_km(local) < per_km(far)

    def test_a_stated_distance_overrides_the_region_estimate(self):
        stated = dict(BASE_PROFILE, long_trip_km=200)
        assert engines.long_trip_one_way_km(stated) == 200
        unstated = dict(BASE_PROFILE, long_trip_km=0)
        assert engines.long_trip_one_way_km(unstated) == engines.destination_distance_km(unstated)

    def test_a_sea_crossing_is_not_driven(self):
        kuching = dict(BASE_PROFILE, home_postcode="93000", destination_region="kl",
                       long_trip_km=0, long_trip_frequency="weekly")
        assert engines.long_trip_one_way_km(kuching) == 0.0
        assert engines.annual_mileage_km(kuching) == engines.commute_km_yr(kuching)
        within = dict(kuching, destination_region="east_malaysia")
        assert engines.long_trip_one_way_km(within) > 0

    def test_a_sea_crossing_forces_no_charging_stop(self, catalog):
        ev = _by_slug(catalog, "proton-emas-5")
        fly = dict(BASE_PROFILE, home_postcode="93000", destination_region="kl", long_trip_km=0)
        local = dict(fly, destination_region="east_malaysia")
        score = lambda p: engines.behaviour_engine(ev, p, engines.build_features(p))  # noqa: E731
        assert score(fly) >= score(local)

    def test_rescaling_annual_km_keeps_the_driving_mix(self, catalog):
        """breakeven_km_per_year rescales annual_km. Cost must rise with it and
        stay near proportional: the home rate climbs with the kWh drawn (see
        TestHomeChargingIsTheRealBill), so it is no longer exactly linear."""
        ev = _by_slug(catalog, "proton-emas-5")
        features = engines.build_features(BASE_PROFILE)
        energy = scoring.energy_context()
        at = lambda km: engines.energy_engine(  # noqa: E731
            ev, BASE_PROFILE, {**features, "annual_km": km}, energy)["cost_rm_yr"]
        assert at(10_000) < at(20_000) < at(30_000)
        assert at(30_000) == pytest.approx(3 * at(10_000), rel=0.25)


class TestDepreciationIsCountedOnce:
    """issue.md issue 33: price voted twice, as depreciation and as resale."""

    def _bundle(self, **over):
        return scoring.score_catalog({**BASE_PROFILE, **over}, _MID, with_stability=False)

    def test_the_cost_criterion_excludes_depreciation(self):
        for row in self._bundle()["ranking"]:
            lines = {line["key"]: line["amount_rm"] for line in row["cost_breakdown_5yr"]["lines"]}
            assert row["holding_cost_5yr_rm"] == pytest.approx(
                row["total_cost_5yr_rm"] - lines["depreciation"])
            # the figure the buyer is shown still includes it
            assert row["total_cost_5yr_rm"] > row["holding_cost_5yr_rm"]

    def test_resale_is_the_only_criterion_that_sees_retention(self):
        """Two cars identical but for what they are worth in five years must
        differ on resale and on nothing else."""
        from app.engines.topsis import CRITERIA
        assert "holding_cost_5yr_rm" in CRITERIA and "total_cost_5yr_rm" not in CRITERIA
        row = dict(self._bundle()["ranking"][0])
        twin = dict(row, slug="twin", resale_retained_pct=row["resale_retained_pct"] - 10)
        differing = [c for c in CRITERIA if row[c] != twin[c]]
        assert differing == ["resale_retained_pct"]

    def test_resale_bounds_cover_the_catalogue(self):
        from app.engines.topsis import RESALE_CEILING_PCT, RESALE_FLOOR_PCT
        values = [engines.resale_retained_pct(v)[0] for v in load_catalog()]
        assert RESALE_FLOOR_PCT < min(values) and max(values) < RESALE_CEILING_PCT, (
            min(values), max(values))

    @pytest.mark.parametrize("budget", [80_000, 150_000, 400_000, 1_000_000])
    def test_no_affordable_car_clips_the_cost_axis(self, budget):
        bundle = self._bundle(budget_max_rm=budget)
        lo, hi = bundle["bounds"]["holding_cost_5yr_rm"]
        inside = [r for r in bundle["ranking"] if r["price_rm"] <= budget]
        assert all(lo < r["holding_cost_5yr_rm"] < hi for r in inside)

    def test_a_bigger_budget_can_change_the_answer(self):
        """The RM67,800 Bingo used to win every budget from RM80,000 to RM250,000."""
        winners = {self._bundle(budget_max_rm=b, daily_km=40)["ranking"][0]["slug"]
                   for b in (80_000, 150_000, 400_000, 800_000)}
        assert len(winners) >= 2


class TestChargingAccessIsRespected:
    """issue.md issue 34. The rule: never recommend a plug-in car to a buyer
    with neither home nor workplace charging. Recommending a hybrid to someone
    who can charge is a legitimate answer and is not tested against."""

    NO_CHARGER = {"can_charge_home": False, "can_charge_work": False}

    @pytest.mark.parametrize("postcode", ["50400", "10050", "80000", "93000", "91000", "18300"])
    @pytest.mark.parametrize("budget", [1, 60_000, 80_000, 95_000, 120_000, 400_000])
    @pytest.mark.parametrize("slider", ["save_money", "environment", "convenience", "future_proofing"])
    def test_no_plug_in_car_is_ever_ranked(self, postcode, budget, slider):
        profile = {**BASE_PROFILE, **self.NO_CHARGER, "home_postcode": postcode,
                   "budget_max_rm": budget}
        bundle = scoring.score_catalog(profile, {**_MID, slider: 100}, with_stability=False)
        assert bundle["ranking"]
        assert {r["type"] for r in bundle["ranking"]} == {"hybrid"}
        assert bundle["feasibility"]["passed"] is False

    @pytest.mark.parametrize("access", [{"can_charge_home": True}, {"can_charge_work": True}])
    def test_either_private_charger_keeps_them(self, access):
        profile = {**BASE_PROFILE, **self.NO_CHARGER, **access}
        bundle = scoring.score_catalog(profile, _MID, with_stability=False)
        assert {"ev", "phev", "hybrid"} <= {r["type"] for r in bundle["ranking"]}
        assert bundle["feasibility"]["bev_removed"] == 0
        assert bundle["feasibility"]["phev_removed"] == 0

    def test_a_budget_that_only_reaches_evs_gets_the_nearest_hybrids(self):
        """Nothing under RM99,800 is a hybrid, so this buyer is shown the ten
        cheapest hybrids and told they are over budget, not an EV they cannot
        charge."""
        profile = {**BASE_PROFILE, **self.NO_CHARGER, "budget_max_rm": 80_000}
        bundle = scoring.score_catalog(profile, _MID, with_stability=False)
        assert bundle["budget"]["fallback"] == "nearest_over_budget"
        hybrids = sorted(float(v["price_rm"]) for v in load_catalog() if v["type"] == "hybrid")
        assert sorted(r["price_rm"] for r in bundle["ranking"]) == hybrids[:scoring.NEAREST_FALLBACK]


class TestCo2CeilingIsAKnownLimit:
    """issue.md issue 31, accepted: cars above the CO2 ceiling tie at the worst
    value rather than the ceiling being raised for them.

    Raising it from 0.23 to 0.36 kg/km would shrink the part of the axis that
    ordinary cars occupy by a third, weakening the environment slider for every
    buyer in order to separate a handful of cars that are already last on it.
    This holds the cost of that choice where it is: only cars far up the market.
    """

    def test_only_top_of_market_cars_exceed_it(self, catalog):
        from app.engines.topsis import CO2_CEILING_KG_PER_KM
        features = engines.build_features(BASE_PROFILE)
        energy = scoring.energy_context()
        over = [v for v in catalog
                if engines.energy_engine(v, BASE_PROFILE, features, energy)["co2_kg_yr"]
                / features["annual_km"] > CO2_CEILING_KG_PER_KM]
        assert len(over) <= 11, sorted(v["id"] for v in over)
        assert all(float(v["price_rm"]) >= 350_000 for v in over), (
            "a mainstream car now clips the CO2 axis; raise CO2_CEILING_KG_PER_KM")


class TestHomeChargingIsTheRealBill:
    """issue.md issue 35: one anchor rate, RM0.4986/kWh, for every car and
    every mileage. The rate is now bill(household + car) - bill(household)."""

    @pytest.fixture
    def tariff(self):
        return scoring.energy_context()["tariff"]

    def test_the_bill_has_tnbs_steps_in_tnbs_places(self, tariff):
        tou = tariff["domestic_tou"]
        bill = lambda kwh: engines.tnb_tou_bill(kwh * 0.6, kwh * 0.4, tou)  # noqa: E731
        # retail charge, fuel adjustment on every kWh and service tax start at 601
        assert bill(601) - bill(600) > 10
        # the dearer energy rate is at 1,501 kWh, not 600: 10 sen on every kWh
        assert bill(1501) - bill(1500) > 100
        # between steps one more kWh costs about one kWh
        assert 0.3 < bill(520) - bill(519) < 0.6

    def test_the_bill_is_monotonic(self, tariff):
        tou = tariff["domestic_tou"]
        bills = [engines.tnb_tou_bill(k * 0.6, k * 0.4, tou) for k in range(0, 2001, 5)]
        assert all(b >= a for a, b in zip(bills, bills[1:]))

    def test_a_stated_bill_inverts_back_to_itself(self, tariff):
        for kwh in (180, 420, 580, 760, 1200, 1700):
            bill = engines._household_bill(kwh, tariff)
            assert engines.estimate_household_kwh(bill, tariff) == pytest.approx(kwh, abs=1.0)

    def test_a_heavy_charger_pays_more_per_kwh(self, tariff):
        """280 kWh a month takes a 400 kWh household past 600: about RM0.65."""
        light = engines.home_ev_marginal_rate({}, tariff, 80)
        heavy = engines.home_ev_marginal_rate({}, tariff, 280)
        assert light == pytest.approx(0.50, abs=0.03)
        assert heavy == pytest.approx(0.65, abs=0.03)

    def test_it_no_longer_needs_a_stated_bill_to_notice(self, tariff):
        with_bill = engines.home_ev_marginal_rate({"monthly_electricity_bill_rm": 111}, tariff, 280)
        without = engines.home_ev_marginal_rate({}, tariff, 280)
        assert with_bill == pytest.approx(without, rel=0.02)

    def test_home_is_still_far_cheaper_than_public(self, tariff):
        public = float(tariff["public_charging_rm_per_kwh"]["blended"])
        for ev in (20, 80, 150, 280, 500, 900):
            for bill in (0, 80, 250, 600, 1200):
                rate = engines.home_ev_marginal_rate({"monthly_electricity_bill_rm": bill}, tariff, ev)
                # the top of the range is a 1,170 kWh household pushed past
                # 1,501 kWh, where every kWh in the house is re-priced
                assert 0.30 < rate < public, (ev, bill, rate)
