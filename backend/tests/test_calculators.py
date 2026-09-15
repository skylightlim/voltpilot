"""The calculators must reproduce the catalogue they claim to be built from.

`app/services/calculators.py` and `scripts/used_market/compute_*.py` hold the
same Malaysian formulas: the scripts populate the catalogue offline and must run
without the web app, and the service answers requests without shelling out to a
batch script. That is a deliberate duplication, and duplicated financial
constants drift. These tests make the drift fail here rather than ship.
"""
from __future__ import annotations

import pytest

from app.config import load_catalog
from app.services import calculators as calc


@pytest.fixture(scope="module")
def catalog():
    return load_catalog()


class TestLoanMatchesCatalog:
    def test_every_stored_instalment_is_reproduced(self, catalog):
        """The catalogue stores loan_monthly_rm for all 184 trims."""
        off = []
        for v in catalog:
            own = v.get("ownership") or {}
            stored = own.get("loan_monthly_rm")
            if not stored:
                continue
            got = calc.loan(
                v["price_rm"], vehicle_type=v["type"],
                down_payment_rm=own.get("loan_down_payment_rm"),
                tenure_years=own.get("loan_tenure_yrs") or 7,
                flat_rate_pct=own.get("loan_rate_pct"),
            )["monthly_rm"]
            if abs(got - float(stored)) > 1.0:
                off.append(f"{v['id']}: stored {stored}, computed {got}")
        assert not off, f"{len(off)} instalments drifted: {off[:5]}"

    def test_total_interest_is_reproduced(self, catalog):
        off = []
        for v in catalog:
            own = v.get("ownership") or {}
            stored = own.get("loan_total_interest_rm")
            if not stored:
                continue
            got = calc.loan(
                v["price_rm"], vehicle_type=v["type"],
                down_payment_rm=own.get("loan_down_payment_rm"),
                tenure_years=own.get("loan_tenure_yrs") or 7,
                flat_rate_pct=own.get("loan_rate_pct"),
            )["total_interest_rm"]
            if abs(got - float(stored)) > 1.0:
                off.append(f"{v['id']}: stored {stored}, computed {got}")
        assert not off, f"{len(off)} interest totals drifted: {off[:5]}"

    def test_the_effective_rate_is_roughly_double_the_flat_rate(self):
        """A flat rate charges interest on the full principal for the whole term.

        Disclosing only the flat figure is what the 2026 amendment stopped, so
        the calculator has to show both or it is repeating the old problem.
        """
        out = calc.loan(100_000, vehicle_type="ev")
        assert out["flat_rate_pct"] == 1.75
        assert 3.0 < out["effective_rate_pct"] < 3.6

    def test_a_bigger_deposit_lowers_the_instalment(self):
        small = calc.loan(150_000, down_payment_rm=15_000)["monthly_rm"]
        large = calc.loan(150_000, down_payment_rm=60_000)["monthly_rm"]
        assert large < small

    def test_paying_cash_costs_no_interest(self):
        out = calc.loan(120_000, down_payment_rm=120_000)
        assert out["financed_rm"] == 0
        assert out["total_interest_rm"] == 0


class TestInsuranceMatchesCatalog:
    def test_every_stored_premium_is_reproduced(self, catalog):
        """184 of 184 rows carry insurance_rm_yr, computed at 0% NCD."""
        off = []
        for v in catalog:
            own = v.get("ownership") or {}
            stored = own.get("insurance_rm_yr")
            if not stored:
                continue
            got = calc.insurance(
                v["price_rm"], vehicle_type=v["type"],
                engine_cc=(v.get("specs") or {}).get("engine_cc") or 0,
                policy_year=1,
            )["premium_rm"]
            if abs(got - float(stored)) > 2.0:
                off.append(f"{v['id']} ({v['type']}): stored {stored}, computed {got}")
        assert not off, f"{len(off)} premiums drifted: {off[:5]}"

    @pytest.mark.parametrize("year,expected", [(1, 0.0), (2, 25.0), (3, 30.0),
                                               (4, 38.33), (5, 45.0), (6, 55.0), (9, 55.0)])
    def test_the_ncd_ladder_is_the_piam_one(self, year, expected):
        assert calc.ncd_pct(year) == expected

    def test_no_claim_discount_reduces_the_premium(self):
        year1 = calc.insurance(150_000, vehicle_type="ev", policy_year=1)["premium_rm"]
        year6 = calc.insurance(150_000, vehicle_type="ev", policy_year=6)["premium_rm"]
        assert year6 < year1 * 0.5

    def test_east_malaysia_is_cheaper_than_peninsular(self):
        west = calc.insurance(150_000, vehicle_type="ev")["premium_rm"]
        east = calc.insurance(150_000, vehicle_type="ev", east_malaysia=True)["premium_rm"]
        assert east < west


class TestRoadTax:
    @pytest.mark.parametrize("cc,expected", [
        (1000, 20), (1300, 70), (1500, 90),
        (1800, 280),                      # 1601-1800 band tops out at its own base
        (2000, 380), (2500, 880),         # progressive bands, at their upper edge
    ])
    def test_the_saloon_schedule_matches_jpj(self, cc, expected):
        assert calc.road_tax_ice(cc) == pytest.approx(expected, abs=0.01)

    def test_a_non_saloon_pays_more_in_the_small_bands(self):
        """An MPV or SUV is rated higher than a saloon of the same capacity."""
        assert calc.road_tax_ice(1500, non_saloon=True) > calc.road_tax_ice(1500)

    def test_an_ev_is_looked_up_rather_than_computed(self):
        """The JPJ EV bracket table is not in this repo, so it is not invented."""
        out = calc.road_tax_for_catalog_vehicle("proton-emas-5")
        assert out and out["type"] == "ev"
        assert out["road_tax_rm"] is not None and "JPJ" in out["basis"]

    def test_an_unknown_slug_returns_nothing(self):
        assert calc.road_tax_for_catalog_vehicle("not-a-car") is None


class TestAffordability:
    """The loan solved backwards. People budget in instalments, not sticker prices."""

    @pytest.mark.parametrize("budget", [600, 1200, 1500, 3000, 8000])
    def test_it_round_trips_through_the_loan_calculator(self, budget):
        """The strongest check available: the two must agree exactly."""
        out = calc.affordability(budget, vehicle_type="ev", down_payment_rm=20_000)
        back = calc.loan(out["max_price_rm"], vehicle_type="ev", down_payment_rm=20_000)
        assert back["monthly_rm"] == pytest.approx(budget, abs=0.05)

    def test_a_deposit_raises_the_reachable_price_one_for_one(self):
        """A deposit is not financed, so it adds to the price it does not fund."""
        none = calc.affordability(1_500, down_payment_rm=0)["max_price_rm"]
        with_down = calc.affordability(1_500, down_payment_rm=30_000)["max_price_rm"]
        assert with_down == pytest.approx(none + 30_000, abs=1.0)

    def test_a_longer_tenure_reaches_further(self):
        short = calc.affordability(1_500, tenure_years=3)["max_price_rm"]
        long = calc.affordability(1_500, tenure_years=9)["max_price_rm"]
        assert long > short

    def test_it_reports_what_is_actually_in_range(self, catalog):
        out = calc.affordability(1_500, down_payment_rm=20_000)
        expected = sum(1 for v in catalog if v["price_rm"] <= out["max_price_rm"])
        assert out["cars_in_range"] == expected
        assert all(e["price_rm"] <= out["max_price_rm"] for e in out["examples"])

    def test_a_zero_budget_reaches_only_the_deposit(self):
        assert calc.affordability(0, down_payment_rm=50_000)["max_price_rm"] == 50_000


class TestDepreciation:
    def test_it_matches_the_fitted_curve_at_five_years(self):
        """The curve's own retained_5yr is the figure the ranking uses."""
        from app.config import load_depreciation_curve

        curve = load_depreciation_curve()
        for vtype in ("ev", "hybrid", "phev"):
            expected = curve["by_type"][vtype]["retained_5yr"] * 100
            got = calc.depreciation(100_000, vehicle_type=vtype, years=5)["schedule"][-1]["retained_pct"]
            assert got == pytest.approx(expected, abs=0.6), vtype

    def test_value_falls_every_year(self):
        sched = calc.depreciation(200_000, vehicle_type="ev", years=8)["schedule"]
        values = [s["value_rm"] for s in sched]
        assert values == sorted(values, reverse=True)

    def test_a_measured_model_is_labelled_measured(self):
        """22 of 184 trims have their own curve; the rest must not claim one."""
        from app.config import load_depreciation_curve

        measured = next(iter(load_depreciation_curve()["by_model"]))
        out = calc.depreciation(150_000, slug=measured)
        assert out["basis"] == "measured"
        assert "own used listings" in out["basis_note"]

    def test_an_unmeasured_model_says_so(self):
        out = calc.depreciation(150_000, vehicle_type="ev", slug="not-a-measured-car")
        assert out["basis"] == "type_curve"
        assert "not this model alone" in out["basis_note"]


class TestOwnership:
    def test_it_agrees_with_the_five_year_breakdown_the_ranking_uses(self, catalog):
        """A standalone figure that disagreed with the recommendation is worse
        than not having one, so this runs the same engines."""
        from app.services import costing

        out = calc.ownership("proton-emas-5", annual_km=15_000)
        vehicle = next(v for v in catalog if v["id"] == "proton-emas-5")
        direct = costing.five_year_breakdown(vehicle, out["running_cost_rm_yr"])
        assert out["total_rm"] == pytest.approx(direct["total_rm"], abs=1.0)

    def test_the_stated_mileage_is_the_mileage_used(self):
        """build_features derives annual km from daily x days; it must round-trip."""
        from app.engines import engines

        for km in (5_000, 15_000, 40_000):
            out = calc.ownership("proton-emas-5", annual_km=km)
            assert out["annual_km"] == pytest.approx(km, abs=1.0)
            # and more driving must cost more
        low = calc.ownership("proton-emas-5", annual_km=5_000)["total_rm"]
        high = calc.ownership("proton-emas-5", annual_km=40_000)["total_rm"]
        assert high > low

    def test_depreciation_is_the_largest_line(self):
        """68% of a five-year total, and the reason this calculator exists."""
        out = calc.ownership("proton-emas-5", annual_km=15_000)
        assert out["lines"][0]["key"] == "depreciation"

    def test_losing_home_charging_costs_more_to_run(self):
        home = calc.ownership("proton-emas-5", can_charge_home=True)["running_cost_rm_yr"]
        away = calc.ownership("proton-emas-5", can_charge_home=False)["running_cost_rm_yr"]
        assert away > home

    def test_an_unknown_slug_returns_nothing(self):
        assert calc.ownership("not-a-car") is None
