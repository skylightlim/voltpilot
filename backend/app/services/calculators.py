"""Standalone Malaysian motoring calculators.

These are the same formulas the catalogue was built with, exposed so a buyer
can run them against their own numbers rather than only seeing the result for a
car we picked. Each one names its source, because every figure here is a claim
about Malaysian regulation or a published bank/insurer rate rather than a
modelling choice we are free to make up.

The batch scripts under `scripts/used_market/` still hold their own copy of
these constants — they populate the catalogue offline and must run without the
web app. `tests/test_calculators.py` asserts this module reproduces the values
stored in `data/catalog_vehicles.json`, so the two cannot drift apart silently.
"""
from __future__ import annotations

import math

from ..config import load_catalog

# --- hire purchase -------------------------------------------------------
# Flat rates advertised for green financing, crosschecked Aug 2026: Maybank
# Accelerated Payment Package quotes "as low as 1.75%" for EV/hybrid; the
# hybrid tier sits at 2.00% across CIMB / Hong Leong / Bank Islam.
LOAN_RATES_PCT = {"ev": 1.75, "hybrid": 2.00, "phev": 2.00, "ice": 2.70}
DEFAULT_TENURE_YEARS = 7
DEFAULT_MARGIN = 0.90  # 90% financing, i.e. 10% down

# The Hire Purchase (Amendment) Act 2026 abolished the flat-rate structure and
# the Rule of 78 on 2026-06-01, moving hire purchase to reducing balance on an
# Effective Interest Rate. The advertised rate is still quoted flat, so the
# instalment is unchanged; what changed is how a settlement is computed. The
# EIR below is the rate that actually amortises this instalment schedule.
HIRE_PURCHASE_ACT_2026 = "Hire Purchase (Amendment) Act 2026, in force 2026-06-01"


def _half_up(x: float, digits: int = 2) -> float:
    factor = 10 ** digits
    return math.floor(x * factor + 0.5) / factor


def _effective_rate_pct(principal: float, monthly: float, months: int) -> float:
    """The reducing-balance APR that amortises `monthly` over `months`.

    Bisection rather than a closed form: there isn't one, and 60 iterations
    settles it well inside a basis point.
    """
    if principal <= 0 or monthly <= 0 or months <= 0:
        return 0.0
    lo, hi = 0.0, 1.0  # monthly rate bounds
    for _ in range(60):
        mid = (lo + hi) / 2
        # present value of the instalment stream at `mid`
        pv = monthly * months if mid == 0 else monthly * (1 - (1 + mid) ** -months) / mid
        if pv > principal:
            lo = mid
        else:
            hi = mid
    return _half_up((lo + hi) / 2 * 12 * 100, 2)


def loan(price_rm: float, *, vehicle_type: str = "ev", down_payment_rm: float | None = None,
         tenure_years: int = DEFAULT_TENURE_YEARS, flat_rate_pct: float | None = None) -> dict:
    """Malaysian hire-purchase instalment, flat-rate quoted, EIR disclosed."""
    price = max(float(price_rm or 0), 0.0)
    rate_pct = float(flat_rate_pct if flat_rate_pct is not None
                     else LOAN_RATES_PCT.get(vehicle_type, LOAN_RATES_PCT["ice"]))
    years = max(int(tenure_years or 0), 1)
    down = price * (1 - DEFAULT_MARGIN) if down_payment_rm is None else float(down_payment_rm)
    down = min(max(down, 0.0), price)

    financed = price - down
    interest = financed * (rate_pct / 100) * years
    months = years * 12
    monthly = (financed + interest) / months if months else 0.0

    return {
        "price_rm": _half_up(price),
        "down_payment_rm": _half_up(down),
        "down_payment_pct": _half_up(down / price * 100 if price else 0.0, 1),
        "financed_rm": _half_up(financed),
        "flat_rate_pct": rate_pct,
        "tenure_years": years,
        "monthly_rm": _half_up(monthly),
        "total_interest_rm": _half_up(interest),
        "total_payable_rm": _half_up(down + financed + interest),
        "effective_rate_pct": _effective_rate_pct(financed, monthly, months),
        "basis": (
            f"{int(DEFAULT_MARGIN * 100)}% margin convention, {rate_pct}% flat p.a. "
            f"over {years} years. Quoted flat; {HIRE_PURCHASE_ACT_2026} requires the "
            "effective rate to be disclosed, which is the figure roughly double it."
        ),
    }


# --- comprehensive motor insurance --------------------------------------
# PIAM-standardised No-Claim Discount for private cars, by policy year.
NCD_LADDER_PCT = (0.0, 25.0, 30.0, 38.33, 45.0, 55.0)

# EV: sum-insured banded rate, from calculatormalaysia.com's EV calculator.
EV_RATE_BANDS = ((50_000, 0.028), (100_000, 0.026), (200_000, 0.025),
                 (300_000, 0.024), (400_000, 0.0238), (None, 0.0235))
SST_PCT = 8.0
STAMP_DUTY_RM = 10.0

# ICE/hybrid: rate x market value + a base set by engine capacity, from
# carbase.my's calculator, verified at 12+ probe points Aug 2026.
ICE_RATE_PENINSULAR, ICE_RATE_EAST = 0.026, 0.0203
ICE_BASE_PENINSULAR = (247.80, 279.50, 313.10, 346.60, 378.30, 410.00, 443.60, 475.30)
ICE_BASE_EAST = (175.90, 199.70, 223.60, 246.20, 270.10, 292.70, 316.60, 339.20)
CC_BANDS = ((0, 1400), (1401, 1650), (1651, 2200), (2201, 3050),
            (3051, 4100), (4101, 4250), (4251, 4400), (4401, None))


def ncd_pct(policy_year: int) -> float:
    """Discount for that policy year. Year 1 is 0%; it tops out at 55% from year 6."""
    return NCD_LADDER_PCT[min(max(int(policy_year or 1), 1), len(NCD_LADDER_PCT)) - 1]


def _cc_band(cc: float) -> int:
    for i, (_lo, hi) in enumerate(CC_BANDS):
        if hi is None or cc <= hi:
            return i
    return len(CC_BANDS) - 1


def insurance(sum_insured_rm: float, *, vehicle_type: str = "ev", engine_cc: float = 0,
              policy_year: int = 1, east_malaysia: bool = False) -> dict:
    """Annual comprehensive premium, car-only (no windscreen/liability add-ons).

    Two formulas, because EVs are not rated on engine capacity: an EV has none,
    so insurers price it off the sum insured alone.
    """
    si = max(float(sum_insured_rm or 0), 0.0)
    discount = ncd_pct(policy_year) / 100
    is_ev = vehicle_type == "ev"

    if is_ev:
        rate = next(r for cap, r in EV_RATE_BANDS if cap is None or si <= cap)
        base = si * rate * (0.9 if east_malaysia else 1.0)
        gross = base * (1 - discount)
        total = gross * (1 + SST_PCT / 100) + STAMP_DUTY_RM
        source = "calculatormalaysia.com EV calculator (SI-banded rate, +8% SST, +RM10 stamp)"
    else:
        cc = max(float(engine_cc or 0), 0.0)
        rate = ICE_RATE_EAST if east_malaysia else ICE_RATE_PENINSULAR
        base = (ICE_BASE_EAST if east_malaysia else ICE_BASE_PENINSULAR)[_cc_band(cc)]
        gross = (rate * si + base) * (1 - discount)
        total = gross
        source = "carbase.my insurance calculator (rate x market value + engine-cc base)"

    return {
        "sum_insured_rm": _half_up(si),
        "vehicle_type": vehicle_type,
        "region": "east_malaysia" if east_malaysia else "peninsular",
        "policy_year": int(policy_year or 1),
        "ncd_pct": ncd_pct(policy_year),
        "premium_rm": _half_up(total),
        "basis": source,
    }


# --- road tax ------------------------------------------------------------
# JPJ "Garis Panduan Pengiraan Kadar LKM Bajet 2009", Peninsular, private.
# Each row is (cc_lo, cc_hi, base_rm, progressive) where progressive is
# (rm_per_cc_above, threshold_cc) or 0 for the flat bands.
SALOON_SCHEDULE = ((0, 1000, 20, None), (1001, 1200, 55, None), (1201, 1400, 70, None),
                   (1401, 1600, 90, None), (1601, 1800, 200, (0.40, 1600)),
                   (1801, 2000, 280, (0.50, 1800)), (2001, 2500, 380, (1.00, 2000)),
                   (2501, 3000, 880, (2.50, 2500)), (3001, None, 2130, (4.50, 3000)))
NON_SALOON_SCHEDULE = ((0, 1000, 20, None), (1001, 1200, 85, None), (1201, 1400, 100, None),
                       (1401, 1600, 120, None), (1601, 1800, 300, (0.30, 1600)),
                       (1801, 2000, 360, (0.40, 1800)), (2001, 2500, 440, (0.80, 2000)),
                       (2501, 3000, 840, (1.60, 2500)), (3001, None, 1640, (1.60, 3000)))


def road_tax_ice(engine_cc: float, *, non_saloon: bool = False) -> float:
    """Annual LKM for a combustion or hybrid car, Peninsular, private individual."""
    cc = max(float(engine_cc or 0), 0.0)
    schedule = NON_SALOON_SCHEDULE if non_saloon else SALOON_SCHEDULE
    for lo, hi, base, progressive in schedule:
        if hi is not None and cc > hi:
            continue
        if cc < lo:
            continue
        if not progressive:
            return float(base)
        per_cc, threshold = progressive
        return float(base) + (cc - threshold) * per_cc
    return float(schedule[-1][2])


def road_tax_for_catalog_vehicle(slug: str) -> dict | None:
    """The stored road tax for a catalogue car, with the basis it was computed on.

    EVs are looked up rather than computed. The JPJ EV schedule is keyed on
    motor power in watts and the bracket table it was applied from was a one-off
    input that is not in this repository, so computing one here would mean
    inventing a schedule. Looking up the figure that was actually applied is the
    honest option; `road_tax_ice` covers everything with an engine.
    """
    for v in load_catalog():
        if v["id"] == slug:
            own = v.get("ownership") or {}
            return {
                "slug": slug,
                "road_tax_rm": own.get("road_tax_rm"),
                "basis": own.get("road_tax_note") or "",
                "type": v["type"],
            }
    return None


# --- affordability (the loan, solved backwards) --------------------------
def affordability(monthly_budget_rm: float, *, vehicle_type: str = "ev",
                  tenure_years: int = DEFAULT_TENURE_YEARS,
                  down_payment_rm: float = 0.0,
                  flat_rate_pct: float | None = None) -> dict:
    """The dearest car a monthly figure supports, and how many are in range.

    People budget in instalments, not sticker prices, so this is the loan run
    backwards. With a flat rate the instalment is linear in the financed amount:

        monthly = financed * (1 + rate * years) / months

    so the financed amount falls straight out, and the price is that plus
    whatever is put down. The deposit is added rather than assumed at 10%,
    because a buyer with RM40,000 saved can reach a very different car from one
    with nothing, on the same monthly figure.
    """
    monthly = max(float(monthly_budget_rm or 0), 0.0)
    years = max(int(tenure_years or 0), 1)
    rate_pct = float(flat_rate_pct if flat_rate_pct is not None
                     else LOAN_RATES_PCT.get(vehicle_type, LOAN_RATES_PCT["ice"]))
    down = max(float(down_payment_rm or 0), 0.0)

    months = years * 12
    financed = monthly * months / (1 + (rate_pct / 100) * years)
    price = financed + down

    affordable = [v for v in load_catalog() if float(v["price_rm"]) <= price]
    affordable.sort(key=lambda v: -float(v["price_rm"]))

    return {
        "monthly_budget_rm": _half_up(monthly),
        "down_payment_rm": _half_up(down),
        "tenure_years": years,
        "flat_rate_pct": rate_pct,
        "max_price_rm": _half_up(price),
        "financed_rm": _half_up(financed),
        "total_interest_rm": _half_up(financed * (rate_pct / 100) * years),
        "cars_in_range": len(affordable),
        "catalog_total": len(load_catalog()),
        "examples": [
            {"slug": v["id"],
             "label": " ".join(x for x in (v["brand"], v["model"], v.get("variant") or "") if x).strip(),
             "type": v["type"], "price_rm": float(v["price_rm"])}
            for v in affordable[:5]
        ],
        "basis": (
            f"{rate_pct}% flat p.a. over {years} years. A deposit raises the reachable "
            "price one-for-one, because it is not financed."
        ),
    }


# --- depreciation --------------------------------------------------------
def depreciation(price_rm: float, *, vehicle_type: str = "ev", slug: str | None = None,
                 years: int = 5) -> dict:
    """Projected resale value year by year, from the fitted used-market curve.

    Exponential decay on the fitted `k_per_year`, which is how the curve was
    built: value(t) = price * exp(-k*t). A per-model curve is used when the
    used market has enough listings for one, and the drivetrain's curve
    otherwise — 22 of 184 trims are measured, so most cars carry an average and
    the response says which, rather than implying precision it does not have.
    """
    from ..config import load_depreciation_curve

    price = max(float(price_rm or 0), 0.0)
    horizon = min(max(int(years or 1), 1), 10)
    curve = load_depreciation_curve() or {}

    entry, basis = None, "fallback"
    if slug:
        entry = (curve.get("by_model") or {}).get(slug)
        if entry:
            basis = "measured"
    if entry is None:
        entry = (curve.get("by_type") or {}).get(vehicle_type)
        if entry:
            basis = "type_curve"

    k = float(entry["k_per_year"]) if entry else 0.16
    schedule = []
    for year in range(1, horizon + 1):
        retained = math.exp(-k * year)
        schedule.append({
            "year": year,
            "retained_pct": _half_up(retained * 100, 1),
            "value_rm": _half_up(price * retained),
            "lost_rm": _half_up(price * (1 - retained)),
        })

    final = schedule[-1]
    return {
        "price_rm": _half_up(price),
        "vehicle_type": vehicle_type,
        "slug": slug,
        "years": horizon,
        "k_per_year": k,
        "basis": basis,
        "schedule": schedule,
        "value_rm": final["value_rm"],
        "total_depreciation_rm": final["lost_rm"],
        "basis_note": {
            "measured": "fitted from this model's own used listings",
            "type_curve": f"fitted from all {vehicle_type} listings, not this model alone",
            "fallback": "no fitted curve available; a flat assumption",
        }[basis],
    }


# --- five-year total cost of ownership -----------------------------------
def ownership(slug: str, *, annual_km: float = 15_000.0, can_charge_home: bool = True,
              home_postcode: str = "50000", fuel_scenario: str = "subsidised") -> dict | None:
    """The full five-year cost for one catalogue car, at this buyer's mileage.

    Runs the real engines rather than approximating them: the same
    `energy_engine` the ranking uses produces the running cost, and the same
    `costing.five_year_breakdown` produces the lines. A standalone calculator
    that disagreed with the recommendation would be worse than not having one.
    """
    from ..engines import engines
    from . import costing, energy_context

    vehicle = next((v for v in load_catalog() if v["id"] == slug), None)
    if vehicle is None:
        return None

    km = max(float(annual_km or 0), 1.0)
    # build_features derives annual km as daily x days x 52; 7 days makes the
    # stated annual figure exact rather than something near it.
    profile = {
        "daily_km": km / 364.0, "trips_per_week": 7,
        "long_trip_frequency": "monthly", "long_trip_km": 300,
        "destination_region": "kl", "can_charge_home": bool(can_charge_home),
        "home_postcode": home_postcode, "budget_max_rm": 0,
        "monthly_electricity_bill_rm": 0,
    }
    features = engines.build_features(profile)
    energy = energy_context(fuel_scenario)
    eng = engines.energy_engine(vehicle, profile, features, energy)
    breakdown = costing.five_year_breakdown(vehicle, eng["cost_rm_yr"])

    total = float(breakdown["total_rm"])
    return {
        "slug": slug,
        "label": " ".join(x for x in (vehicle["brand"], vehicle["model"],
                                      vehicle.get("variant") or "") if x).strip(),
        "type": vehicle["type"],
        "price_rm": float(vehicle["price_rm"]),
        "annual_km": _half_up(km),
        "can_charge_home": bool(can_charge_home),
        "fuel_scenario": fuel_scenario,
        "running_cost_rm_yr": _half_up(eng["cost_rm_yr"]),
        "co2_kg_yr": _half_up(eng["co2_kg_yr"]),
        "years": breakdown["years"],
        "total_rm": _half_up(total),
        "per_month_rm": _half_up(total / (breakdown["years"] * 12)),
        "per_km_rm": _half_up(total / (km * breakdown["years"]), 2),
        "resale_value_rm": breakdown["resale_value_rm"],
        "retained_pct": breakdown["retained_pct"],
        "retained_basis": breakdown["retained_basis"],
        "maintenance_basis": breakdown["maintenance_basis"],
        "lines": breakdown["lines"],
    }
