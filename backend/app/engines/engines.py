"""Feature engineering + 4 domain engines, each emitting a 0-100 score.

Pipeline order (plan Section 5):
1. Data integration
2. Feature engineering (annual mileage, charging convenience, station density, ...)
3. Four engines: Financial / Behaviour / Infrastructure / Energy
4. TOPSIS over the 6-criteria matrix

Policy engine removed 2026-08-14 (policy no longer considered in the score).
"""

from __future__ import annotations

import csv
import json
import math
import re
from collections import defaultdict

from ..config import DATA_DIR

# ---------------------------------------------------------------------------
# Feature engineering
# ---------------------------------------------------------------------------

_density: dict | None = None
_prefix_coords: dict | None = None


def _load_density() -> dict:
    """Real charging-station density per postcode (built from ev-stations.csv)."""
    global _density
    if _density is None:
        with open(DATA_DIR / "ev_station_density.json", encoding="utf-8") as fh:
            _density = json.load(fh)
    return _density


def _load_prefix_centroids() -> dict:
    """Approx home coords per 2-digit postcode prefix, from real station geodata."""
    global _prefix_coords
    if _prefix_coords is None:
        acc: dict[str, list[float]] = defaultdict(lambda: [0.0, 0.0, 0])
        try:
            with open(DATA_DIR / "ev-stations.csv", encoding="utf-8") as fh:
                for r in csv.DictReader(fh):
                    m = re.search(r"(\d{5})\s*$", r.get("address") or "")
                    if not m or not r.get("lat") or not r.get("lng"):
                        continue
                    a = acc[m.group(1)[:2]]
                    a[0] += float(r["lat"])
                    a[1] += float(r["lng"])
                    a[2] += 1
            _prefix_coords = {p: (v[0] / v[2], v[1] / v[2]) for p, v in acc.items() if v[2]}
        except Exception:
            _prefix_coords = {}
    return _prefix_coords


def _haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    R = 6371.0
    la1, lo1, la2, lo2 = map(math.radians, [a[0], a[1], b[0], b[1]])
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def annual_mileage_km(profile: dict) -> float:
    daily = float(profile.get("daily_km", 0) or 0)
    days = float(profile.get("trips_per_week", 0) or 0)
    return daily * days * 52


def long_trip_weight(profile: dict) -> float:
    """0.0 (rare trips) .. 0.85 (weekly long trips)."""
    return {"rarely": 0.1, "monthly": 0.45, "weekly": 0.85}.get(
        profile.get("long_trip_frequency", "rarely"), 0.1
    )


# Approximate region destination centroids (city-cluster coords)
_REGION_CENTROIDS: dict[str, tuple[float, float]] = {
    "kl": (3.14, 101.69),
    "north": (5.41, 100.33),      # Penang
    "south": (1.49, 103.74),      # JB
    "east_coast": (5.33, 103.1),  # Kota Bharu
    "east_malaysia": (3.80, 113.20),  # Borneo midpoint (Kuching-KK)
    "singapore": (1.35, 103.82),
}
_KL = _REGION_CENTROIDS["kl"]


def destination_distance_km(profile: dict) -> float:
    """One-way road distance from the user's home to the usual destination region.

    Home position approximated by the postcode-prefix centroid of real charging
    stations (falls back to KL); road distance approximated as 1.25x great-circle.
    Minimum 30 km to avoid degenerate zero scores.
    """
    dest = _REGION_CENTROIDS.get(profile.get("destination_region", "kl"), _KL)
    pfx = str(profile.get("home_postcode", ""))[:2]
    prefix_coords = _load_prefix_centroids()
    home = prefix_coords.get(pfx, _KL)
    gc = _haversine_km(home, dest)
    road = gc * 1.25
    return max(30.0, road)


# ---------------------------------------------------------------------------
# Infrastructure access look-up (D-INFRA): real station counts near the user
# and along their long-trip corridor, straight from data/ev-stations.csv.
# ---------------------------------------------------------------------------

_stations: list[tuple[float, float]] | None = None
_postcode_coords: dict[str, tuple[float, float]] | None = None

AREA_RADIUS_KM = 15.0     # what "in your area" means
ROUTE_CORRIDOR_KM = 25.0  # how far off the line a station still serves the trip
ROAD_FACTOR = 1.25        # straight-line -> road distance, as in destination_distance_km
LOCAL_TRIP_KM = 40.0      # below this the "route" is just the user's own area


def _load_stations() -> list[tuple[float, float]]:
    """Operational public charging points with usable coordinates."""
    global _stations
    if _stations is None:
        out: list[tuple[float, float]] = []
        try:
            with open(DATA_DIR / "ev-stations.csv", encoding="utf-8") as fh:
                for r in csv.DictReader(fh):
                    if str(r.get("is_operational", "")).strip().lower() != "true":
                        continue
                    try:
                        out.append((float(r["lat"]), float(r["lng"])))
                    except (TypeError, ValueError, KeyError):
                        continue
        except OSError:
            out = []
        _stations = out
    return _stations


def _load_postcode_centroids() -> dict[str, tuple[float, float]]:
    """Exact 5-digit postcode centroids, where stations name one in their address."""
    global _postcode_coords
    if _postcode_coords is None:
        acc: dict[str, list[float]] = defaultdict(lambda: [0.0, 0.0, 0])
        try:
            with open(DATA_DIR / "ev-stations.csv", encoding="utf-8") as fh:
                for r in csv.DictReader(fh):
                    m = re.search(r"(\d{5})", r.get("address") or "")
                    if not m or not r.get("lat") or not r.get("lng"):
                        continue
                    a = acc[m.group(1)]
                    a[0] += float(r["lat"])
                    a[1] += float(r["lng"])
                    a[2] += 1
            _postcode_coords = {k: (v[0] / v[2], v[1] / v[2]) for k, v in acc.items() if v[2]}
        except OSError:
            _postcode_coords = {}
    return _postcode_coords


# Postcode ranges -> (state, geographic centroid). Station geodata only covers
# 51 of the ~98 live prefixes, and every miss used to resolve to KL. That told a
# Tawau user they had 318 chargers within 20 km — KL's count, 1,500 km away —
# and inflated BEV feasibility in exactly the states where charging is sparsest.
# Centroids are geographic, not capital-city, so an unresolved postcode reads as
# the middle of its state rather than optimistically as its best-served city.
_STATE_RANGES: list[tuple[int, int, str, tuple[float, float]]] = [
    (1000, 2800, "Perlis", (6.44, 100.20)),
    (5000, 9810, "Kedah", (5.98, 100.66)),
    (10000, 14400, "Penang", (5.36, 100.40)),
    (15000, 18500, "Kelantan", (5.75, 102.10)),
    (20000, 24300, "Terengganu", (4.99, 103.10)),
    (25000, 28800, "Pahang", (3.81, 102.90)),
    (30000, 36810, "Perak", (4.60, 101.09)),
    (39000, 39200, "Pahang", (4.47, 101.38)),
    (40000, 48300, "Selangor", (3.24, 101.45)),
    (49000, 49000, "Pahang", (3.81, 102.90)),
    (50000, 60999, "Kuala Lumpur", (3.14, 101.69)),
    (62000, 62988, "Putrajaya", (2.93, 101.70)),
    (63000, 68100, "Selangor", (3.05, 101.60)),
    (70000, 73509, "Negeri Sembilan", (2.73, 102.13)),
    (75000, 78309, "Melaka", (2.24, 102.35)),
    (79000, 86900, "Johor", (1.94, 103.36)),
    (87000, 87033, "Labuan", (5.28, 115.24)),
    (88000, 91309, "Sabah", (5.42, 116.90)),
    (93000, 98859, "Sarawak", (2.50, 113.00)),
]


# Three postcodes sit inside a neighbouring state's block. Bandar Baharu is a
# Kedah district whose codes fall in Perak's 34xxx and Penang's 14xxx ranges, so
# a range lookup alone hands those residents the wrong state's charging network.
# Found by cross-checking this table against the frontend's 2,925-entry exact
# postcode map; tests/test_postcode.py keeps the two in agreement.
_POSTCODE_OVERRIDES: dict[str, tuple[str, tuple[float, float]]] = {
    "34950": ("Kedah", (5.18, 100.52)),
    "14290": ("Kedah", (5.18, 100.52)),
    "14390": ("Kedah", (5.18, 100.52)),
}


def state_for_postcode(postcode: str) -> tuple[str, tuple[float, float]] | None:
    """State and geographic centroid for a Malaysian postcode, if it is in range."""
    key = str(postcode or "")[:5]
    override = _POSTCODE_OVERRIDES.get(key)
    if override is not None:
        return override
    try:
        n = int(key)
    except ValueError:
        return None
    for lo, hi, name, centre in _STATE_RANGES:
        if lo <= n <= hi:
            return name, centre
    return None


def home_coordinates(postcode: str) -> tuple[float, float]:
    """Best available home position.

    Exact postcode centroid, else 2-digit prefix, else the centroid of the state
    the postcode belongs to, and only then KL. The state step exists because the
    previous KL fallback silently gave East Malaysian users Klang Valley
    infrastructure — see _STATE_RANGES.
    """
    p = str(postcode or "")[:5]
    exact = _load_postcode_centroids()
    if p in exact:
        return exact[p]
    prefix = _load_prefix_centroids().get(p[:2])
    if prefix is not None:
        return prefix
    st = state_for_postcode(p)
    return st[1] if st else _KL


# Spec Step 02 — hard feasibility gate for battery-electric candidates.
# 20 km is the specification's radius; AREA_RADIUS_KM (15 km) stays the display
# radius so the "in your area" panel keeps its existing meaning.
BEV_GATE_RADIUS_KM = 20.0
BEV_GATE_MIN_STATIONS = 5


def public_stations_within(postcode: str, radius_km: float = BEV_GATE_RADIUS_KM) -> int:
    """Operational public charging points within radius_km of the user's postcode."""
    home = home_coordinates(postcode)
    return sum(1 for st in _load_stations() if _haversine_km(home, st) <= radius_km)


def bev_charging_gate(profile: dict) -> dict:
    """Can this user actually charge a BEV?

    Spec Step 02: keep BEV candidates when home OR workplace charging is
    available, or when at least 5 public points sit within 20 km. Only when the
    user has neither private option AND fewer than 5 public points does the
    specification remove every BEV.

    This screens; it does not score. The infrastructure and behaviour engines
    still rank the survivors exactly as before.
    """
    home_ok = bool(profile.get("can_charge_home"))
    work_ok = bool(profile.get("can_charge_work"))
    stations = public_stations_within(profile.get("home_postcode", ""))
    public_ok = stations >= BEV_GATE_MIN_STATIONS
    passed = home_ok or work_ok or public_ok
    if home_ok or work_ok:
        reason = "private_charging"
    elif public_ok:
        reason = "public_charging"
    else:
        reason = "no_charging_access"
    return {
        "passed": passed,
        "reason": reason,
        "stations_within_radius": stations,
        "radius_km": BEV_GATE_RADIUS_KM,
        "min_stations": BEV_GATE_MIN_STATIONS,
    }


def classify_area(count: int) -> str:
    """Public-access class for the count of stations around the user."""
    if count >= 50:
        return "good"
    if count >= 25:
        return "moderate"
    if count >= 10:
        return "limited"
    return "very_poor"


def classify_route(density_per_100km: float, max_gap_km: float) -> str:
    """Weighted density/gap capability: a dense route with one huge gap still fails."""
    ds = 1.0 if density_per_100km >= 5 else 0.67 if density_per_100km >= 2 else 0.33 if density_per_100km >= 1 else 0.0
    gs = 1.0 if max_gap_km <= 50 else 0.67 if max_gap_km <= 100 else 0.33 if max_gap_km <= 150 else 0.0
    capability = 0.60 * ds + 0.40 * gs
    return "good" if capability >= 0.80 else "moderate" if capability >= 0.50 else "poor"


def infrastructure_access(profile: dict) -> dict:
    """Stations near home, and charging density along the usual long-trip corridor.

    The corridor is the straight line home -> destination centroid; stations
    within ROUTE_CORRIDOR_KM of it are projected onto the line to measure
    spacing. Distances are scaled by ROAD_FACTOR so they read as road km,
    consistent with destination_distance_km.
    """
    stations = _load_stations()
    home = home_coordinates(profile.get("home_postcode", ""))
    dest = _REGION_CENTROIDS.get(profile.get("destination_region", "kl"), _KL)

    area_count = sum(1 for s in stations if _haversine_km(home, s) <= AREA_RADIUS_KM)

    # equirectangular projection about the corridor midpoint - accurate enough
    # over Malaysian distances and far cheaper than per-station great circles
    lat0 = math.radians((home[0] + dest[0]) / 2)
    kx = 111.320 * math.cos(lat0)
    ky = 110.574

    def xy(pt: tuple[float, float]) -> tuple[float, float]:
        return (pt[1] * kx, pt[0] * ky)

    hx, hy = xy(home)
    dx, dy = xy(dest)
    vx, vy = dx - hx, dy - hy
    span = math.hypot(vx, vy)
    route_km = max(30.0, span * ROAD_FACTOR)

    # Destination inside the user's own conurbation: there is no corridor to
    # measure, and projecting a whole metro's chargers onto a token 30 km line
    # yields a nonsense density. Say so instead of inventing a statistic.
    if span < LOCAL_TRIP_KM:
        return {
            "area": {
                "count": area_count,
                "radius_km": AREA_RADIUS_KM,
                "status": classify_area(area_count),
            },
            "route": {
                "destination_region": profile.get("destination_region", "kl"),
                "local": True,
                "status": classify_area(area_count),
            },
            "source": f"{len(stations)} operational stations (data/ev-stations.csv)",
        }

    positions: list[float] = []
    if span > 1e-6:
        for s in stations:
            sx, sy = xy(s)
            t = ((sx - hx) * vx + (sy - hy) * vy) / (span * span)
            if not 0.0 <= t <= 1.0:
                continue
            perp = abs((sx - hx) * vy - (sy - hy) * vx) / span
            if perp <= ROUTE_CORRIDOR_KM:
                positions.append(t * route_km)

    positions.sort()
    density = len(positions) / (route_km / 100) if route_km else 0.0
    # the gap that matters is the longest run with no charger, endpoints included
    max_gap = route_km
    if positions:
        marks = [0.0, *positions, route_km]
        max_gap = max(b - a for a, b in zip(marks, marks[1:]))

    return {
        "area": {
            "count": area_count,
            "radius_km": AREA_RADIUS_KM,
            "status": classify_area(area_count),
        },
        "route": {
            "destination_region": profile.get("destination_region", "kl"),
            "route_km": round(route_km, 0),
            "stations": len(positions),
            "density_per_100km": round(density, 1),
            "max_gap_km": round(max_gap, 0),
            "corridor_km": ROUTE_CORRIDOR_KM,
            "local": False,
            "status": classify_route(density, max_gap),
        },
        "source": f"{len(stations)} operational stations (data/ev-stations.csv)",
    }


def region_density_base(postcode: str) -> float:
    """Charging-station density score (0-100) by Malaysian postcode.

    Real density from data/ev_station_density.json (built from ev-stations.csv):
    2-digit prefix score on log scale + exact 5-digit postcode bonus.
    Falls back to the bootstrap table for prefixes with no stations at all.
    """
    density = _load_density()
    p = str(postcode or "")[:5]
    prefix_scores = density.get("prefix_scores", {})
    exact = density.get("exact_postcode_scores", {})
    if p in exact:
        return float(exact[p])
    if p[:2] in prefix_scores:
        return float(prefix_scores[p[:2]])
    # bootstrap fallback for station-less areas
    if p in {"50000", "47800", "46300", "43650", "63000", "50400"}:
        return 88
    if p[:2] in {"50", "51", "40", "41", "42", "43", "46", "47", "63"}:
        return 62
    if p[:2] in {"10", "11", "13", "80", "81", "90", "91", "75"}:
        return 38
    if p[:2] in {"30", "31", "32", "33", "34", "35", "70"}:
        return 24
    if p[:2] in {"20", "05", "09", "15", "16", "17", "60", "88"}:
        return 14
    return 6


def charging_convenience_score(profile: dict) -> float:
    """0-100: the home-charging lifeline dominates (D-HC).

    Workplace charging is the second lifeline: a modest top-up when home
    charging already exists, but a large one when it does not - a daily 8-hour
    park at a charger removes most of the public-network dependency.
    """
    home = bool(profile.get("can_charge_home"))
    work = bool(profile.get("can_charge_work"))
    base = region_density_base(profile.get("home_postcode", ""))
    if home:
        return min(100.0, 55 + base * 0.5 + (8 if work else 0))
    if work:
        # capped below the home-charging band: an 8-hour workday top-up covers
        # the commute but never a home charger's always-full convenience
        return min(92.0, base * 0.85 + 18)
    return base * 0.85


# ---------------------------------------------------------------------------
# Grid + tariff context derived from the profile (grid region, electricity bill)
# ---------------------------------------------------------------------------


def grid_co2_factor(profile: dict, co2: dict) -> float:
    """kg CO2 per kWh for the grid that actually charges this car.

    Peninsular runs on gas/coal; East Malaysia is pulled down by hydro-dominant
    Sarawak, so the same kWh carries roughly half the CO2.
    """
    by_region = co2.get("grid_by_region") or {}
    region = str(profile.get("grid_region") or "peninsular")
    return float(by_region.get(region, co2["grid"]))


def estimate_household_kwh(bill_rm: float, tariff: dict) -> float:
    """Invert a monthly TNB bill into approximate household kWh.

    All-in Domestic ToU rate at a typical 60/40 peak split, plus the fixed
    retail charge. Tier 2 applies to the whole consumption once the household
    crosses the threshold, so the two branches are deliberately discontinuous.
    """
    tou = tariff.get("domestic_tou") or {}
    if not tou or bill_rm <= 0:
        return 0.0
    retail = float(tou.get("retail_charge_rm", 0) or 0)
    fixed = float(tou.get("capacity_rate", 0)) + float(tou.get("network_rate", 0))
    peak_share = float(
        (tariff.get("home_household_assumptions") or {}).get("base_peak_share", 0.6) or 0.6
    )
    kwtbb = 1 + float(tou.get("kwtbb_rate", 0) or 0)

    def all_in(tier: str, with_extras: bool) -> float:
        e = tou[tier]
        rate = float(e["peak"]) * peak_share + float(e["off_peak"]) * (1 - peak_share) + fixed
        if with_extras:
            rate = (rate + float(tou.get("afa_rm_per_kwh", 0) or 0)) * kwtbb
            return rate * (1 + float(tou.get("service_tax_rate", 0) or 0))
        return rate * kwtbb

    threshold = float(tou.get("usage_threshold_kwh", 600) or 600)
    low = max(0.0, (bill_rm - retail) / all_in("energy_tier1", False))
    if low <= threshold:
        return low
    return max(threshold, (bill_rm - retail) / all_in("energy_tier2", True))


def home_ev_marginal_rate(profile: dict, tariff: dict, ev_kwh_month: float) -> float:
    """RM/kWh for charging at home, given what the household already draws.

    Anchored on the validated marginal rate (computed for the reference
    household in data/tariff.json). Adding EV load on top of an already-heavy
    household pushes the WHOLE bill into tier 2, so the increment carries the
    tier uplift, AFA, KWTBB and service tax on top of the anchor.
    """
    anchor = float(tariff["home_ev_marginal_rm_per_kwh"])
    tou = tariff.get("domestic_tou") or {}
    bill = float(profile.get("monthly_electricity_bill_rm") or 0)
    if not tou or bill <= 0:
        return anchor

    baseline = estimate_household_kwh(bill, tariff)
    threshold = float(tou.get("usage_threshold_kwh", 600) or 600)
    if baseline + ev_kwh_month <= threshold:
        return anchor

    charge_peak = float(
        (tariff.get("home_household_assumptions") or {}).get("charge_peak_share", 0.1) or 0.1
    )
    t1, t2 = tou["energy_tier1"], tou["energy_tier2"]
    uplift = (float(t2["peak"]) - float(t1["peak"])) * charge_peak + (
        float(t2["off_peak"]) - float(t1["off_peak"])
    ) * (1 - charge_peak)
    uplift += float(tou.get("afa_rm_per_kwh", 0) or 0)
    uplift *= 1 + float(tou.get("kwtbb_rate", 0) or 0)
    uplift *= 1 + float(tou.get("service_tax_rate", 0) or 0)
    return anchor + uplift


def build_features(profile: dict) -> dict:
    return {
        "annual_km": annual_mileage_km(profile),
        "long_trip_weight": long_trip_weight(profile),
        "long_trip_km": float(profile.get("long_trip_km", 0) or 0),
        "destination_km": destination_distance_km(profile),
        "charging_convenience": charging_convenience_score(profile),
        "region_density": region_density_base(profile.get("home_postcode", "")),
        "can_charge_home": bool(profile.get("can_charge_home")),
        "can_charge_work": bool(profile.get("can_charge_work")),
        "grid_region": str(profile.get("grid_region") or "peninsular"),
    }


# ---------------------------------------------------------------------------
# Financial engine — 10-yr TCO EXCLUDING purchase price and running cost (D18)
# Components: loan interest, insurance, maintenance, opportunity cost, road tax
# (resale value set aside 2026-08-14)
# ---------------------------------------------------------------------------


def loan_interest_total(principal: float, years: int = 7, flat_rate_pct: float = 1.75) -> float:
    """Malaysian hire-purchase flat rate: interest = principal * rate * years."""
    flat = float(flat_rate_pct or 0) / 100
    if flat <= 0 or years <= 0:
        return 0.0
    return principal * flat * years


def _loan_parameters(vehicle: dict) -> tuple[float, float, int, float]:
    """(financed, flat_rate_pct, tenure_yrs, down_payment) from catalog ownership."""
    own = vehicle.get("ownership", {})
    price = float(vehicle["price_rm"])
    rate = float(own.get("loan_rate_pct") or 1.75)
    tenure = int(own.get("loan_tenure_yrs") or 7)
    down = float(own.get("loan_down_payment_rm") or price * 0.1)
    return max(0.0, price - down), rate, tenure, down


# Servicing cost when the catalog has no measured figure. Only 22 of 184 rows
# carry one, so the fallback decides this for most vehicles — and a single flat
# RM600 charged a hybrid the same servicing as a battery EV, understating 50 of
# 57 hybrids by roughly a third. These are the medians of the rows that DO carry
# a figure (EV n=15 -> 600, hybrid n=7 -> 950). No PHEV row carries one, so PHEV
# takes the hybrid median: it has the same engine servicing plus a drive battery,
# making the hybrid figure a floor rather than a guess in the other direction.
# Kept in code, not written into the catalog, so the data file holds only
# measured values and this stays visibly an estimate.
_MAINTENANCE_FALLBACK_RM_YR = {"ev": 600.0, "hybrid": 950.0, "phev": 950.0}


def _maintenance_fallback(vehicle: dict) -> float:
    return _MAINTENANCE_FALLBACK_RM_YR.get(vehicle.get("type", ""), 600.0)


def financial_tco_excluding(vehicle: dict) -> dict:
    """10-yr TCO excluding purchase price and running cost (D18).

    Uses per-vehicle hire-purchase terms (7yr @ 1.75% EV / 2.00% hybrid flat)
    and per-vehicle road tax; opportunity cost on the actual down payment.
    """
    price = float(vehicle["price_rm"])
    own = vehicle.get("ownership", {})
    financed, rate, tenure, down = _loan_parameters(vehicle)
    insurance = float(own.get("insurance_rm_yr") or (price * 0.015))
    maintenance = float(own.get("maintenance_rm_yr") or _maintenance_fallback(vehicle))
    road_tax = float(own.get("road_tax_rm", 0))

    interest = loan_interest_total(financed, tenure, rate)
    insurance_paid = insurance * 10
    maintenance_paid = maintenance * 10
    opportunity = down * 0.035 * 10
    road_tax_paid = road_tax * 10

    total = interest + insurance_paid + maintenance_paid + opportunity + road_tax_paid
    return {
        "tco_excluding_rm": round(total, 0),
        "components": {
            "loan_interest_rm": round(interest, 0),
            "insurance_10yr_rm": round(insurance_paid, 0),
            "maintenance_10yr_rm": round(maintenance_paid, 0),
            "opportunity_cost_rm": round(opportunity, 0),
            "road_tax_10yr_rm": round(road_tax_paid, 0),
        },
    }


# ---------------------------------------------------------------------------
# Behaviour engine — driving pattern, range suitability (D18)
# ---------------------------------------------------------------------------


def behaviour_engine(vehicle: dict, profile: dict, feature: dict) -> float:
    annual = feature["annual_km"]
    vtype = vehicle["type"]
    specs = vehicle.get("specs", {})

    if annual <= 0:
        return 60.0

    if vtype == "ev":
        range_km = float(specs.get("range_km", 300) or 300)
        daily = float(profile.get("daily_km", 0) or 0)
        longest_trip = max(float(profile.get("long_trip_km", 0) or 0), feature["destination_km"])
        needed = max(daily * 1.4, longest_trip, 100)

        # range_fit near 1 when range >> need; near 0 when range << need
        ratio = range_km / max(needed, 1.0)
        range_fit = max(0.0, min(1.0, ratio / 2.5))

        home_bonus = 0.9 if profile.get("can_charge_home") else 0.35
        convenience = feature["charging_convenience"] / 100
        # weekly long trips on a station-only EV hurt a lot
        road_penalty = feature["long_trip_weight"] * (1 - home_bonus) * 0.5

        # NEW: stops term - penalty when longest trip > 0.5 * range
        # up to 20% penalty (longer range keeps scoring higher)
        stops_ratio = longest_trip / max(range_km, 1.0)
        stops_penalty = 0.0
        if stops_ratio > 0.5:
            stops_penalty = min(0.20, (stops_ratio - 0.5) * 0.4)

        score = 100 * ((range_fit * 0.55) + (convenience * 0.45)) * (1 - road_penalty) * (1 - stops_penalty)
    else:
        # Hybrids: range anxiety irrelevant (petrol everywhere).
        score = 90.0

    return max(0.0, min(100.0, score))


# ---------------------------------------------------------------------------
# Infrastructure engine — postcode station density + road-trip factor (D18)
# ---------------------------------------------------------------------------


def infrastructure_engine(vehicle: dict, profile: dict, feature: dict) -> float:
    density = region_density_base(profile.get("home_postcode", ""))
    road_factor = feature["long_trip_weight"]
    # corridor DCFC coverage collapses in East Malaysia (worst gap ~387km on
    # real station data) — don't credit trip coverage there
    trip_boost = 0.3 * density * road_factor * (
        0.25 if profile.get("destination_region") == "east_malaysia" else 1.0
    )
    corridor = min(100.0, density + trip_boost)

    if vehicle["type"] == "ev":
        if profile.get("can_charge_home"):
            return corridor
        # no home charger: a workplace charger covers most of the daily need
        return corridor * (0.95 if profile.get("can_charge_work") else 0.85)
    return min(100.0, corridor * 0.55 + 30)


# ---------------------------------------------------------------------------
# Energy engine — TNB ToU vs petrol, 80/20 home/station split (D-HC, D18)
# PHEVs blend: EV-mode share (range vs daily km) on electricity, the rest petrol.
# ---------------------------------------------------------------------------


def _phev_ev_share(vehicle: dict, profile: dict) -> float:
    """Fraction of annual km the PHEV runs on battery.

    Coverage = EV range / daily km. With home charging the battery tops up
    nightly so the share equals daily coverage; without it, public charging
    only captures about half of that.
    """
    specs = vehicle.get("specs", {})
    range_km = float(specs.get("range_km", 0) or 0)
    daily = max(float(profile.get("daily_km", 0) or 0), 1.0)
    commute_cov = min(1.0, range_km / daily) if range_km > 0 else 0.35

    # Long trips are the part the commute term cannot see. `specs.range_km` on a
    # PHEV is the ELECTRIC range (65-170 km here), so range/daily was >= 1 for 22
    # of 25 PHEVs at a normal commute. That pinned the share to exactly 1.0, made
    # litres_yr = l100 * (1 - 1.0) = 0, and modelled those cars as burning no
    # petrol at all — scoring them as pure EVs on both running cost and CO2.
    # On a round trip only the first EV-range km are electric.
    round_trip = max(2.0 * destination_distance_km(profile), 1.0)
    trip_cov = min(1.0, range_km / round_trip) if range_km > 0 else 0.1

    w = long_trip_weight(profile)  # 0.1 rarely .. 0.85 weekly
    coverage = (1.0 - w) * commute_cov + w * trip_cov

    if profile.get("can_charge_home"):
        return coverage
    # no home charger: opportunistic public top-ups only
    return min(coverage, 0.5)


def _kwh100(vehicle: dict) -> float:
    specs = vehicle.get("specs", {})
    kwh100 = specs.get("energy_kwh_per_100km")
    if kwh100 and 5 <= float(kwh100) <= 40:
        return float(kwh100)
    battery, rng = specs.get("battery_kwh"), specs.get("range_km")
    if battery and rng and float(battery) > 5 and float(rng) > 20:
        return float(battery) / float(rng) * 100
    return 17.0


def _charger_efficiency(tariff: dict) -> float:
    return float(tariff.get("home_household_assumptions", {}).get("charger_efficiency", 0.9) or 0.9)


def energy_engine(vehicle: dict, profile: dict, feature: dict, energy: dict) -> dict:
    annual = feature["annual_km"]
    tariff = energy["tariff"]
    fuel = energy["fuel"]
    co2 = energy["co2"]
    vtype = vehicle["type"]
    specs = vehicle.get("specs", {})

    eff = _charger_efficiency(tariff)
    grid_co2 = grid_co2_factor(profile, co2)

    def _electricity_cost(drawn_kwh_yr: float) -> float:
        """Cost of a year of charging, split home/public per the D-HC 80/20 rule."""
        station_rate = float(tariff["public_charging_rm_per_kwh"]["blended"])
        if not profile.get("can_charge_home"):
            return drawn_kwh_yr * station_rate
        home_rate = home_ev_marginal_rate(profile, tariff, drawn_kwh_yr * 0.8 / 12)
        return drawn_kwh_yr * (0.8 * home_rate + 0.2 * station_rate)

    if vtype == "ev":
        kwh100 = _kwh100(vehicle)
        kwh_yr = (annual / 100) * kwh100
        litres_yr = 0.0
        drawn = kwh_yr / eff
        cost = _electricity_cost(drawn)
        co2_yr = drawn * grid_co2
    elif vtype == "phev":
        ev_share = _phev_ev_share(vehicle, profile)
        kwh100 = _kwh100(vehicle)
        l100 = float(specs.get("fuel_l_per_100km", 5.0) or 5.0)
        kwh_yr = (annual / 100) * kwh100 * ev_share
        litres_yr = (annual / 100) * l100 * (1 - ev_share)
        drawn = kwh_yr / eff
        cost = _electricity_cost(drawn) + litres_yr * float(fuel["ron95_rm_per_l"])
        co2_yr = drawn * grid_co2 + litres_yr * float(co2["petrol"])
    else:
        l100 = float(specs.get("fuel_l_per_100km", 5.0) or 5.0)
        kwh_yr = 0.0
        litres_yr = (annual / 100) * l100
        cost = litres_yr * float(fuel["ron95_rm_per_l"])
        co2_yr = litres_yr * float(co2["petrol"])

    return {
        "cost_rm_yr": round(cost, 0),
        "co2_kg_yr": round(co2_yr, 0),
        "kwh_yr": round(kwh_yr, 0),
        "litres_yr": round(litres_yr, 0),
        "ev_share": round(ev_share, 3) if vtype == "phev" else (1.0 if vtype == "ev" else 0.0),
    }


def normalize_cost_scores(raw: dict[str, float], invert: bool = True) -> dict[str, float]:
    """Linear map raw scores -> 0-100 (lower raw = higher score for costs)."""
    if not raw:
        return {}
    lo, hi = min(raw.values()), max(raw.values())
    span = hi - lo or 1
    out = {}
    for k, v in raw.items():
        out[k] = round(100 * ((hi - v) / span if invert else (v - lo) / span), 1)
    return out