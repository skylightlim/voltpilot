"""The 14 Nov 2026 round: BUDI95's monthly quota, Solar ATAP, published servicing,
and the chat analyst's knowledge.

Each test pins a behaviour a buyer would notice if it regressed: petrol past the
quota priced as if it were still subsidised, a solar payback credited at NEM's
full retail rate, a servicing figure that is not the brand's published one, or a
chat that answers tariff questions without the policy brief.
"""

from __future__ import annotations

import pytest

from app.config import load_catalog, load_fuel
from app.engines import engines
from app.engines.engines import build_features
from app.services import analyst as A
from app.services import energy_context
from app.services.costing import breakeven_km_per_year, five_year_breakdown
from app.services.solar import solar_estimate

from test_golden_ranking import GOLDEN_PROFILES

CATALOG = {v["id"]: v for v in load_catalog()}


def _without_quota(energy: dict) -> dict:
    fuel = {k: v for k, v in energy["fuel"].items()
            if k not in ("ron95_quota_l_yr", "ron95_over_quota_rm_per_l")}
    return {**energy, "fuel": fuel}


class TestBudi95Quota:
    def test_quota_comes_from_fuel_json(self):
        quota = load_fuel()["budi95"]["quota_l_per_month"]
        assert energy_context("subsidised")["fuel"]["ron95_quota_l_yr"] == quota * 12

    def test_litres_within_the_quota_pay_the_pump_price(self):
        fuel = energy_context("subsidised")["fuel"]
        litres = fuel["ron95_quota_l_yr"] - 1
        assert engines.petrol_cost_rm(litres, fuel) == pytest.approx(litres * fuel["ron95_rm_per_l"])

    def test_litres_past_the_quota_pay_the_market_price(self):
        fuel = energy_context("subsidised")["fuel"]
        quota = fuel["ron95_quota_l_yr"]
        cost = engines.petrol_cost_rm(quota + 1000, fuel)
        assert cost == pytest.approx(
            quota * fuel["ron95_rm_per_l"] + 1000 * fuel["ron95_over_quota_rm_per_l"])

    def test_the_market_scenario_has_no_quota_to_apply(self):
        fuel = energy_context("market")["fuel"]
        assert "ron95_quota_l_yr" not in fuel
        assert engines.petrol_cost_rm(5000, fuel) == pytest.approx(5000 * fuel["ron95_rm_per_l"])

    def test_a_thirsty_hybrid_at_high_mileage_costs_more_than_flat_pricing(self):
        profile = GOLDEN_PROFILES["kv_home_charging"]
        hybrid = CATALOG["toyota-vios"]
        hybrid = {**hybrid, "specs": {**hybrid["specs"], "fuel_l_per_100km": 9.0}}
        feat = {**build_features(profile), "annual_km": 60_000}
        with_quota = engines.energy_engine(hybrid, profile, feat, energy_context("subsidised"))
        flat = engines.energy_engine(hybrid, profile, feat, _without_quota(energy_context("subsidised")))
        assert with_quota["cost_rm_yr"] > flat["cost_rm_yr"]

    def test_the_quota_creates_a_breakeven_the_flat_price_hid(self):
        """Against a 9 L/100 km hybrid the hybrid is cheaper at low mileage, and
        only the quota makes the EV win at high mileage. The crossing used to be
        drawn the EV-first way by construction."""
        profile = GOLDEN_PROFILES["kv_home_charging"]
        features = build_features(profile)
        hybrid = CATALOG["toyota-vios"]
        hybrid = {**hybrid, "specs": {**hybrid["specs"], "fuel_l_per_100km": 9.0}}
        ev = CATALOG["byd-sealion-7"]
        energy = energy_context("subsidised")

        out = breakeven_km_per_year(ev, hybrid, energy, profile, features)
        assert out["verdict"] == "crossover"
        assert out["cheaper_below"] == "hybrid"
        quota_km = energy["fuel"]["ron95_quota_l_yr"] / 9.0 * 100
        assert out["breakeven_km_per_year"] > quota_km

        flat = breakeven_km_per_year(ev, hybrid, _without_quota(energy), profile, features)
        assert flat["verdict"] == "hybrid_always"


class TestSolarAtap:
    def test_banner_is_computed_under_atap(self):
        s = solar_estimate()
        assert s["scheme"] == "Solar ATAP"
        assert s["capex_rm"] > 0 and s["savings_rm_per_year"] > 0
        # The reference home pays back inside the 10 years ATAP credits run.
        assert s["payback_years"] < s["credit_years"]

    def test_exports_are_worth_less_than_the_old_nem_banner_claimed(self):
        """NEM's static banner said RM4,300 a year; ATAP credits only the energy
        charge, so the same 5 kW roof cannot be worth that to this household."""
        assert solar_estimate()["savings_rm_per_year"] < 4300

    def test_a_battery_saves_less_than_the_panels_do(self):
        s = solar_estimate()
        assert 0 <= s["battery"]["extra_savings_rm_per_year"] < s["savings_rm_per_year"]

    def test_credit_is_capped_at_imports(self, monkeypatch):
        """Past the point where exports exceed what the house imports, a bigger
        roof earns nothing more: the extra is forfeited. Capacity and network
        charges stay on the bill because the credit is worth the energy charge
        only, so it never reaches zero this way either."""
        from app.services import solar as solar_mod

        base = solar_mod.load_solar()

        def at(kw: float) -> dict:
            monkeypatch.setattr(solar_mod, "load_solar", lambda: dict(base, system_kw=kw))
            return solar_mod.solar_estimate()

        big, huge = at(20), at(50)
        assert huge["bill_after_rm_month"] == big["bill_after_rm_month"] > 0
        assert huge["forfeited_kwh_month"] > big["forfeited_kwh_month"] > 0


class TestPublishedServicing:
    def test_the_five_year_line_is_the_published_total(self):
        car = CATALOG["honda-city"]
        line = next(ln for ln in five_year_breakdown(car, 0.0)["lines"]
                    if ln["key"] == "maintenance")
        assert line["amount_rm"] == round(car["ownership"]["maintenance_5yr_rm"])

    def test_published_rows_name_their_source(self):
        for car in CATALOG.values():
            own = car.get("ownership") or {}
            if own.get("maintenance_5yr_rm"):
                assert own.get("maintenance_note"), car["id"]
                assert own["maintenance_rm_yr"] == round(own["maintenance_5yr_rm"] / 5), car["id"]
                assert five_year_breakdown(car, 0.0)["maintenance_basis"] == "measured"

    def test_the_best_sellers_are_covered(self):
        """The point of the round: the cars most buyers look at carry the
        brand's own figure, not the price-band estimate."""
        for slug in ("proton-emas-5", "proton-emas-7", "honda-city", "honda-hrv-ehev",
                     "toyota-yaris-cross", "toyota-vios", "honda-cr-v"):
            assert engines.maintenance_rm_yr(CATALOG[slug])[1] == "measured", slug


class TestChatKnowledge:
    @pytest.mark.asyncio
    async def test_the_chat_sees_the_policy_brief(self, monkeypatch):
        seen = {}

        async def fake_generate(client, *, contents, config):
            seen["system"] = config["system_instruction"]
            return type("R", (), {"text": "ok"})()

        async def fake_rotation(run):
            return await run(None)

        monkeypatch.setattr(A.settings, "gemini_api_keys", ["k"])
        monkeypatch.setattr(A, "_generate_once", fake_generate)
        monkeypatch.setattr(A, "_with_key_rotation", fake_rotation)
        await A.chat_reply({"ranking": [], "profile": {}}, "When should I charge?", "en")
        system = seen["system"]
        assert "Solar ATAP" in system and "BUDI95" in system and "2pm-10pm" in system
        assert "solar_reference" in system

    def test_offline_solar_question_is_not_answered_as_degradation(self):
        reply = A._mock_chat({"ranking": [{"brand": "X", "model": "Y", "type": "ev"}]},
                             "Should I add solar at home, and is a battery worth it?", "en")
        assert "ATAP" in reply and "degrade" not in reply
