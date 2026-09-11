from __future__ import annotations

from ..config import load_fuel, load_tariff

# Fuel scenarios (FEATURES P3). The whole EV-versus-hybrid energy comparison
# rests on a policy decision the interface never mentions: RON95 is subsidised
# to RM1.99 under BUDI95 while its market price is RM3.77. At the pump price an
# efficient hybrid costs RM7.16 per 100 km against an EV's RM8.44, so the EV is
# dearer to run; at the market price the hybrid costs RM13.57 and the ordering
# reverses. data/fuel.json already carries both figures.
FUEL_SCENARIOS = ("subsidised", "market")

_energy_ctx: dict[str, dict] = {}


def energy_context(scenario: str = "subsidised") -> dict:
    """Tariff, fuel and emissions context. `scenario` swaps the RON95 price.

    Cached per scenario. "subsidised" is what a buyer pays today; "market" is
    the unsubsidised level from data/fuel.json, for answering what happens if
    BUDI95 ends inside a five-year ownership period.
    """
    if scenario not in FUEL_SCENARIOS:
        raise ValueError(f"unknown fuel scenario: {scenario}")
    if scenario not in _energy_ctx:
        tariff = load_tariff()
        fuel = load_fuel()
        fuel_block = dict(fuel["fuel"])
        if scenario == "market":
            market = fuel.get("market_rm_per_l") or {}
            if market.get("ron95"):
                fuel_block["ron95_rm_per_l"] = float(market["ron95"])
            if market.get("diesel"):
                fuel_block["diesel_rm_per_l"] = float(market["diesel"])
        _energy_ctx[scenario] = {
            # D-HC: flatten so engines can read home rate + public rate from one dict
            "tariff": {
                **tariff["tnb_tariffs"],
                "public_charging_rm_per_kwh": tariff["public_charging_rm_per_kwh"],
            },
            "fuel": fuel_block,
            "co2": {
                "grid": fuel["co2_factors"]["grid_kg_co2_per_kwh"],
                "petrol": fuel["co2_factors"]["petrol_kg_co2_per_l"],
                # per-grid-region factors; "grid" above stays the peninsular default
                "grid_by_region": fuel["co2_factors"].get("grid_kg_co2_per_kwh_by_region", {}),
            },
        }
    return _energy_ctx[scenario]