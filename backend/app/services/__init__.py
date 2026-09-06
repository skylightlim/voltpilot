from __future__ import annotations

from ..config import load_fuel, load_tariff

_energy_ctx: dict | None = None


def energy_context() -> dict:
    global _energy_ctx
    if _energy_ctx is None:
        tariff = load_tariff()
        fuel = load_fuel()
        _energy_ctx = {
            # D-HC: flatten so engines can read home rate + public rate from one dict
            "tariff": {
                **tariff["tnb_tariffs"],
                "public_charging_rm_per_kwh": tariff["public_charging_rm_per_kwh"],
            },
            "fuel": fuel["fuel"],
            "co2": {
                "grid": fuel["co2_factors"]["grid_kg_co2_per_kwh"],
                "petrol": fuel["co2_factors"]["petrol_kg_co2_per_l"],
                # per-grid-region factors; "grid" above stays the peninsular default
                "grid_by_region": fuel["co2_factors"].get("grid_kg_co2_per_kwh_by_region", {}),
            },
        }
    return _energy_ctx