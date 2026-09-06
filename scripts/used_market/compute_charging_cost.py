#!/usr/bin/env python3
"""Compute monthly EV/PHEV charging cost for catalog vehicles from user answers.

Inputs (user answers):
  daily_km       - how far the user drives per day
  days_per_week  - how many days per week they drive
  has_home_charger - True -> 95% of charging at home (ToU tariff), 5% public
                     False -> 100% public (JomCharge blended rate)

Home charging cost = marginal TNB bill. We replicate TNB's Domestic ToU
calculator (https://www.mytnb.com.my/tariff/index.html, js/rates.js +
js/calculator-domesticTOU.js, v1.1.65, fetched Aug 2026):

  DOMESTIC_TOU (Domestic ToU Tariff):
    usage thresholds: ST starts >600 kWh (8% service tax on that portion),
    tier2 energy rates apply >=1501 kWh total, RM10 retail charge if >600 kWh,
    KWTBB 1.6% if total >300 kWh, incentive rebate by total consumption tier,
    AFA fuel adjustment -0.0145/kWh (only if total >600 kWh).
    tier1 energy: peak 0.2852 / off-peak 0.2443
    tier2 energy: peak 0.3852 / off-peak 0.3443
    capacity 0.0455, network 0.1285
    ToU windows (from page): Mon-Fri peak 2pm-10pm, off-peak otherwise;
    Sat/Sun/public holidays off-peak all day.
  Home charging split: 90% off-peak / 10% peak (overnight charging habit).
  Baseline household: 400 kWh/month, 60% peak / 40% off-peak (typical
  residential evening usage; configurable below).

Public charging: JomCharge app rates (plugshare listings Aug 2026): AC RM1.10
/kWh, DC RM1.40/kWh; blended 50/50 -> RM1.25/kWh (configurable).

Vehicle efficiency from catalog specs.energy_kwh_per_100km; fallback estimate
battery_kwh / range_km * 100; final fallback 17.0 kWh/100km (typical EV).
Non-plug-in hybrids (type "hybrid") are excluded.

Usage:
  python3 compute_charging_cost.py --daily-km 40 --days-per-week 6 --has-home-charger
  python3 compute_charging_cost.py --daily-km 40 --days-per-week 6 --no-home-charger --export
"""
import argparse
import json
import math
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent.parent / "data"
CATALOG_PATH = BASE / "catalog_vehicles.json"
EXPORT_PATH = BASE / "charging_cost_dataset.json"

# --- TNB Domestic ToU constants (rates.js v1.1.65) ---
USAGE_THRESHOLD = 600        # kWh; usage above this is subject to 8% service tax
HIGH_USAGE_THRESHOLD = 1501  # >= ; tier2 energy rates apply
KWTBB_THRESHOLD = 300
ST_RATE = 0.08               # 8% service tax on >600 kWh portion
KWTBB_RATE = 0.016           # 1.6% on energy+capacity+network+incentive if total >300
RETAIL_CHARGE = 10.00        # RM10 if total >600 kWh (subject to 8% service tax)
# AFA = automatic fuel adjustment RM/kWh; live table from TNB rates.js v1.1.65 (FUEL_BY_MONTH):
# 2025-07:0  2025-08:-0.0145  2025-09:-0.0110  2025-10:-0.0650  2025-11:-0.0891  2025-12:-0.0642
# 2026-01:-0.0499  2026-02:-0.0277  2026-03:-0.0215  2026-04:-0.0047  2026-05:+0.0138
# 2026-06:+0.0259  2026-07:+0.0359  2026-08:+0.0380  2026-09:+0.0500  2026-10:+0.0681  2026-11:+0.0750
# Only applies when total >600 kWh. Override with --afa.
FUEL_BY_MONTH = {
    "2025-07": 0.0, "2025-08": -0.0145, "2025-09": -0.0110, "2025-10": -0.0650,
    "2025-11": -0.0891, "2025-12": -0.0642, "2026-01": -0.0499, "2026-02": -0.0277,
    "2026-03": -0.0215, "2026-04": -0.0047, "2026-05": 0.0138, "2026-06": 0.0259,
    "2026-07": 0.0359, "2026-08": 0.0380, "2026-09": 0.0500, "2026-10": 0.0681,
    "2026-11": 0.0750,
}
AFA = FUEL_BY_MONTH["2026-08"]
ENERGY = {
    1: {"peak": 0.2852, "off_peak": 0.2443},
    2: {"peak": 0.3852, "off_peak": 0.3443},
}
CAPACITY_RATE = 0.0455
NETWORK_RATE = 0.1285
# incentive (rebate) tiers: rate applied to ALL usage, chosen by total consumption
INCENTIVE_TIERS = [
    (200, -0.25), (250, -0.245), (300, -0.225), (350, -0.21), (400, -0.17),
    (450, -0.145), (500, -0.12), (550, -0.105), (600, -0.09), (650, -0.075),
    (700, -0.055), (750, -0.045), (800, -0.04), (850, -0.025), (900, -0.01),
    (1000, -0.005), (1500, 0.0),
]

# --- assumptions ---
BASE_HOUSEHOLD_KWH = 400.0
BASE_PEAK_SHARE = 0.6        # baseline household peak/off-peak split
CHARGE_PEAK_SHARE = 0.1      # home charging split (90% off-peak / 10% peak)
HOME_SHARE = 0.95            # home-charger users charge 95% at home (user assumption)
JOMCHARGE_AC = 1.10          # RM/kWh, from JomCharge app (plugshare, Aug 2026)
JOMCHARGE_DC = 1.40
PUBLIC_AC_SHARE = 0.5
DEFAULT_EFF = 17.0           # kWh/100km fallback for unknown vehicles
CHARGER_EFFICIENCY = 0.90    # wall-to-battery losses ~10%


def half_up(x, digits=2):
    factor = 10 ** digits
    return math.floor(x * factor + 0.5) / factor


def incentive_rate(total_kwh):
    if total_kwh < 0:
        return 0.0
    for max_kwh, rate in INCENTIVE_TIERS:
        if total_kwh <= max_kwh:
            return rate
    return 0.0


def tnb_domestic_tou_bill(peak_kwh, off_peak_kwh, afa=AFA):
    """Faithful port of DomesticTOU.calculateBill (single month, isPercent=False,
    afaPrev = afa = current month AFA). Returns total bill RM and component dict."""
    total = peak_kwh + off_peak_kwh

    usage_peak_nonst = min(peak_kwh, USAGE_THRESHOLD)
    usage_peak_st = peak_kwh - usage_peak_nonst
    if total > USAGE_THRESHOLD:
        usage_offpeak_nonst = 0 if usage_peak_nonst >= USAGE_THRESHOLD else USAGE_THRESHOLD - usage_peak_nonst
    else:
        usage_offpeak_nonst = min(off_peak_kwh, USAGE_THRESHOLD)
    usage_offpeak_st = off_peak_kwh - usage_offpeak_nonst
    nonst = usage_peak_nonst + usage_offpeak_nonst
    st = usage_peak_st + usage_offpeak_st

    tier = 2 if total >= HIGH_USAGE_THRESHOLD else 1
    energy_peak_rate = ENERGY[tier]["peak"]
    energy_offpeak_rate = ENERGY[tier]["off_peak"]

    energy_peak_nonst = half_up(usage_peak_nonst * energy_peak_rate)
    energy_peak_st = half_up(usage_peak_st * energy_peak_rate)
    energy_offpeak_nonst = half_up(usage_offpeak_nonst * energy_offpeak_rate)
    energy_offpeak_st = half_up(usage_offpeak_st * energy_offpeak_rate)
    energy_peak = half_up(energy_peak_nonst + energy_peak_st)
    energy_offpeak = half_up(energy_offpeak_nonst + energy_offpeak_st)
    energy_total = half_up(energy_peak + energy_offpeak)

    # fuel adjustment: only if total > 600; single month -> round(kwh)*AFA
    if total <= USAGE_THRESHOLD:
        fuel = {"nonst": 0.0, "st": 0.0, "total": 0.0}
    else:
        fuel_nonst = round(nonst) * afa if nonst else 0.0
        fuel_total = round(total) * afa
        fuel = {"nonst": half_up(fuel_nonst), "st": half_up(fuel_total - fuel_nonst), "total": half_up(fuel_total)}

    capacity = {"rate": CAPACITY_RATE, "nonst": half_up(nonst * CAPACITY_RATE), "st": half_up(st * CAPACITY_RATE)}
    capacity["total"] = half_up(capacity["nonst"] + capacity["st"])
    network = {"rate": NETWORK_RATE, "nonst": half_up(nonst * NETWORK_RATE), "st": half_up(st * NETWORK_RATE)}
    network["total"] = half_up(network["nonst"] + network["st"])

    retail_total = RETAIL_CHARGE if total > USAGE_THRESHOLD else 0.0

    inc_rate = incentive_rate(total)
    inc_nonst = half_up(nonst * inc_rate)
    inc_st = half_up(st * inc_rate)
    inc_total = half_up(inc_nonst + inc_st)

    current_nonst = half_up(energy_peak_nonst + energy_offpeak_nonst
                            + fuel["nonst"] + capacity["nonst"] + network["nonst"] + inc_nonst)
    current_st = half_up(energy_peak_st + energy_offpeak_st
                         + fuel["st"] + capacity["st"] + network["st"]
                         + retail_total + inc_st)  # retail charge sits in the ST portion
    current_total = half_up(current_nonst + current_st)

    st_total = half_up(current_st * ST_RATE)
    kwtbb_base = energy_total + capacity["total"] + network["total"] + inc_total
    kwtbb = half_up(kwtbb_base * KWTBB_RATE) if total > KWTBB_THRESHOLD else 0.0
    total_bill = half_up(current_total + st_total + kwtbb)

    return {
        "total_kwh": total, "tier": tier, "energy_rate_peak": energy_peak_rate,
        "energy_rate_offpeak": energy_offpeak_rate, "energy_peak": energy_peak,
        "energy_offpeak": energy_offpeak, "energy_total": energy_total,
        "fuel": fuel, "capacity": capacity, "network": network,
        "retail": retail_total, "incentive_rate": inc_rate, "incentive": inc_total,
        "current_total": current_total, "st_total": st_total, "kwtbb": kwtbb,
        "total_bill": total_bill,
    }


def monthly_kwh(daily_km, days_per_week, eff_kwh_per_100km):
    monthly_km = daily_km * days_per_week * 52 / 12
    return monthly_km * eff_kwh_per_100km / 100, monthly_km


def home_charging_cost(charge_kwh):
    """Marginal home cost = bill(household+charge) - bill(household)."""
    base_peak = BASE_HOUSEHOLD_KWH * BASE_PEAK_SHARE
    base_off = BASE_HOUSEHOLD_KWH * (1 - BASE_PEAK_SHARE)
    charge_peak = charge_kwh * CHARGE_PEAK_SHARE
    charge_off = charge_kwh * (1 - CHARGE_PEAK_SHARE)
    base_bill = tnb_domestic_tou_bill(base_peak, base_off)["total_bill"]
    total_bill = tnb_domestic_tou_bill(base_peak + charge_peak, base_off + charge_off)["total_bill"]
    return total_bill - base_bill


def public_rate():
    return JOMCHARGE_AC * PUBLIC_AC_SHARE + JOMCHARGE_DC * (1 - PUBLIC_AC_SHARE)


def vehicle_eff(v):
    specs = v.get("specs", {})
    eff = specs.get("energy_kwh_per_100km")
    estimated = False
    if not eff:
        battery, rng = specs.get("battery_kwh"), specs.get("range_km")
        if battery and rng:
            eff = round(battery / rng * 100, 1)
        else:
            eff = DEFAULT_EFF
        estimated = True
    return eff, estimated


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--daily-km", type=float, required=True, help="km driven per day (user answer)")
    ap.add_argument("--days-per-week", type=float, required=True, help="days driven per week (user answer)")
    grp = ap.add_mutually_exclusive_group(required=True)
    grp.add_argument("--has-home-charger", action="store_true", help="95% home / 5% public")
    grp.add_argument("--no-home-charger", action="store_true", help="100% public JomCharge")
    ap.add_argument("--export", action="store_true", help="write dataset JSON for Gemini analysis")
    args = ap.parse_args()

    data = json.loads(CATALOG_PATH.read_text())
    pub_rate = public_rate()
    results = []
    for v in data["vehicles"]:
        if v.get("type") not in ("ev", "phev"):
            continue
        eff, estimated = vehicle_eff(v)
        kwh, monthly_km = monthly_kwh(args.daily_km, args.days_per_week, eff)
        kwh = kwh / CHARGER_EFFICIENCY
        if args.has_home_charger:
            home_kwh = kwh * HOME_SHARE
            pub_kwh = kwh * (1 - HOME_SHARE)
            home_cost = home_charging_cost(home_kwh)
            pub_cost = pub_kwh * pub_rate
        else:
            home_kwh = pub_kwh = 0.0
            home_cost = 0.0
            pub_cost = kwh * pub_rate
        month_cost = home_cost + pub_cost
        year_cost = month_cost * 12
        cost_per_100km = month_cost / monthly_km * 100 if monthly_km else None
        results.append({
            "id": v["id"], "type": v["type"], "model": f"{v['brand']} {v['model']}",
            "eff_kwh_100km": eff, "eff_estimated": estimated,
            "monthly_km": round(monthly_km), "monthly_charge_kwh": round(kwh, 1),
            "home_kwh": round(home_kwh, 1), "public_kwh": round(pub_kwh, 1),
            "home_rm_month": round(home_cost, 2), "public_rm_month": round(pub_cost, 2),
            "total_rm_month": round(month_cost, 2), "total_rm_year": round(year_cost),
            "rm_per_100km": round(cost_per_100km, 2) if cost_per_100km is not None else None,
        })

    if args.export:
        EXPORT_PATH.write_text(json.dumps({
            "inputs": {
                "daily_km": args.daily_km, "days_per_week": args.days_per_week,
                "charging_mode": "home95_public5" if args.has_home_charger else "public100",
                "home_assumptions": {
                    "base_household_kwh": BASE_HOUSEHOLD_KWH,
                    "base_peak_share": BASE_PEAK_SHARE,
                    "charge_peak_share": CHARGE_PEAK_SHARE,
                    "home_share": HOME_SHARE,
                    "charger_efficiency": CHARGER_EFFICIENCY,
                },
                "public_rate_rm_kwh": pub_rate,
                "public_rate_source": f"JomCharge app AC RM{JOMCHARGE_AC}/kWh DC RM{JOMCHARGE_DC}/kWh, "
                                      f"{int(PUBLIC_AC_SHARE*100)}/{int((1-PUBLIC_AC_SHARE)*100)} AC/DC blend",
                "tnb_tariff": "Domestic ToU (TNB calculator-domesticTOU.js v1.1.65)",
            },
            "vehicles": results,
        }, indent=1, ensure_ascii=False) + "\n")
        print(f"exported {len(results)} vehicles -> {EXPORT_PATH}")

    print(f"inputs: {args.daily_km} km/day x {args.days_per_week} days/wk  "
          f"mode={'home 95% / public 5%' if args.has_home_charger else 'public 100%'}  "
          f"public rate RM{pub_rate:.2f}/kWh")
    print(f"{'id':38s} {'eff':>5s} {'kWh/mo':>8s} {'home$':>8s} {'pub$':>8s} {'$/mo':>8s} {'$/yr':>7s} {'$/100km':>8s}")
    for r in results:
        est = "*" if r["eff_estimated"] else " "
        print(f"{r['id']:38s} {r['eff_kwh_100km']:5.1f}{est} {r['monthly_charge_kwh']:8.1f} "
              f"{r['home_rm_month']:8.2f} {r['public_rm_month']:8.2f} {r['total_rm_month']:8.2f} "
              f"{r['total_rm_year']:7d} {r['rm_per_100km'] if r['rm_per_100km'] is not None else '-':>8}")
    print(f"\n{len(results)} plug-in vehicles (ev+phev); * = efficiency estimated from battery/range")


if __name__ == "__main__":
    main()
