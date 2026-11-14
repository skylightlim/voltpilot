"""Rooftop solar under Solar ATAP, with and without a home battery (D-SOLAR).

The banner used to print three constants: RM34,000, RM4,300 a year, 7.9 years.
They came from the NEM era, when every exported kWh was netted against an
imported one at the full retail rate and spare credit rolled over for a year.
NEM 3.0 took its last applications on 30 Jun 2025. A home installing now goes
on Solar ATAP (Energy Commission GP/ST/No.60/2025, in force 1 Jan 2026), which
credits exports at the Energy Charge alone, only up to that month's imports,
and forfeits the rest. That is worth roughly half as much per exported kWh,
which is also why a battery is now a question worth asking.

So the banner is computed instead: one reference household (data/solar_avg.json)
is billed on TNB's own arithmetic, engines.tnb_tou_bill over tariff.json, with
no panels, with panels, and with panels plus a battery. Because the bill comes
from tariff.json, the figures move when the tariff or the monthly AFA does.

The household is on the standard Domestic tariff, not ToU. ToU is opt-in and
most homes have not opted in, and the Energy Charge that ATAP credits exports
at is the standard tariff's one. Still one reference household, as D6 decided:
no irradiance model, no per-buyer roof.
"""

from __future__ import annotations

from ..config import load_solar, load_tariff
from ..engines import engines


def _general_tariff(tariff: dict) -> dict:
    """tariff.json's ToU block with both periods at the standard Energy Charge.

    The standard Domestic tariff differs from ToU only in the energy rate, which
    is one figure around the clock. Everything else (capacity, network, retail,
    AFA, the efficiency incentive, KWTBB, service tax) is shared, so the ToU
    bill function prices it exactly once both periods carry the same rate.
    """
    tou = dict(tariff["domestic_tou"])
    general = tariff["domestic_general"]
    for tier in ("energy_tier1", "energy_tier2"):
        rate = float(general[tier])
        tou[tier] = {"peak": rate, "off_peak": rate}
    return tou


def _bill(kwh: float, tou: dict) -> float:
    """A month's bill for `kwh` imported. One rate, so the split is immaterial."""
    return engines.tnb_tou_bill(kwh, 0.0, tou)


def _month(imported: float, exported: float, tou: dict, energy_charge: float) -> dict:
    """One month under Solar ATAP.

    Exports earn the Energy Charge, capped at what the house imported that
    month; the rest is forfeited. The credit cannot touch AFA, and a negative
    bill is set to zero with no payout (guideline 3.6.1, 14.1).
    """
    credited = min(exported, imported)
    bill = _bill(imported, tou)
    afa = imported * float(tou.get("afa_rm_per_kwh", 0) or 0) if imported > float(
        tou.get("usage_threshold_kwh", 600) or 600
    ) else 0.0
    credit = min(credited * energy_charge, max(0.0, bill - afa))
    return {
        "bill_rm": bill - credit,
        "credited_kwh": credited,
        "forfeited_kwh": exported - credited,
    }


def solar_estimate() -> dict:
    """Capex, yearly saving and payback for the reference household.

    Two options, panels alone and panels with a battery, each against the same
    house with neither. The battery soaks up the day's surplus and gives it back
    in the evening, so a stored kWh is worth the full import rate it avoids
    instead of the Energy Charge it would have been credited at.
    """
    s = load_solar()
    tariff = load_tariff()["tnb_tariffs"]
    tou = _general_tariff(tariff)

    house = float(s["household_kwh_month"])
    ev = float(s["ev_kwh_month"])
    demand = house + ev
    generation = float(s["system_kw"]) * float(s["yield_kwh_per_kwp_yr"]) / 12.0

    # Panels make power by day; the car charges overnight.
    used_direct = min(generation, house * float(s["household_daytime_share"]))
    surplus = generation - used_direct

    # Tier 1 holds while the house imports under 1,501 kWh a month, which this
    # one always does; read it from the tariff rather than assume it.
    energy_charge = float(tariff["domestic_general"]["energy_tier1"])

    before = _bill(demand, tou)
    solar = _month(demand - used_direct, surplus, tou, energy_charge)

    # One full cycle a day, limited by what the day leaves over.
    days = 365.0 / 12.0
    stored = min(surplus, float(s["battery_kwh"]) * days)
    returned = stored * float(s["battery_round_trip"])
    imported_b = max(0.0, demand - used_direct - returned)
    battery = _month(imported_b, surplus - stored, tou, energy_charge)

    capex = float(s["system_kw"]) * float(s["capex_rm_per_kw"])
    battery_capex = float(s["battery_capex_rm"])
    saving = (before - solar["bill_rm"]) * 12
    saving_b = (before - battery["bill_rm"]) * 12
    extra = saving_b - saving

    def years(cost: float, per_year: float) -> float | None:
        return round(cost / per_year, 1) if per_year > 0 else None

    return {
        "scheme": "Solar ATAP",
        "system_kw_peak": s["system_kw"],
        "capex_rm": round(capex, -2),
        "savings_rm_per_year": round(saving, -1),
        "payback_years": years(capex, saving),
        "bill_before_rm_month": round(before, 0),
        "bill_after_rm_month": round(solar["bill_rm"], 0),
        "self_used_share": round(used_direct / generation, 2) if generation else 0.0,
        "forfeited_kwh_month": round(solar["forfeited_kwh"], 0),
        "credit_years": s["credit_years"],
        "battery": {
            "kwh": s["battery_kwh"],
            "capex_rm": round(battery_capex, -2),
            "extra_savings_rm_per_year": round(extra, -1),
            "payback_years": years(battery_capex, extra),
            "combined_payback_years": years(capex + battery_capex, saving_b),
        },
        "household_kwh_month": house,
        "ev_kwh_month": ev,
        "rebate_note": s.get("rebate_note", ""),
    }
