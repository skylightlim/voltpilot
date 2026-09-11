"""Market evidence behind the numbers the engine scores (FEATURES P2 and P7).

Two data assets the platform collects and has never shown a user: 14,164 used
listings in data/used_market.db, and 852 charging points in
data/ev-stations-full.json carrying network, connector, power and price that the
scoring pipeline reads none of.

Resale is now a scored criterion, so the retained-value figure already moves
recommendations. Showing the listings it was fitted from turns an assertion into
evidence, and makes the 22-of-184 measurement coverage visible rather than
implied.
"""

from __future__ import annotations

import json
import sqlite3
from functools import lru_cache

from ..config import DATA_DIR

USED_DB = DATA_DIR / "used_market.db"
STATIONS_FULL = DATA_DIR / "ev-stations-full.json"

# Listings below this are data errors rather than bargains. The carlist importer
# stored prices as text until 2026-09-10, so anything this low is a survivor of
# that corruption; see issue.md issue 3.
MIN_PLAUSIBLE_PRICE_RM = 5_000.0


def used_listings(vehicle_id: str, limit: int = 8) -> dict:
    """Real advertised prices for one model, newest model year first."""
    if not USED_DB.exists():
        return {"available": False, "listings": [], "by_age": []}
    con = sqlite3.connect(f"file:{USED_DB}?mode=ro", uri=True)
    try:
        rows = con.execute(
            """SELECT title, year, mileage_km, price_rm, source, url FROM listings
               WHERE vehicle_id = ? AND price_rm > ? AND year IS NOT NULL
               ORDER BY year DESC, price_rm ASC LIMIT ?""",
            (vehicle_id, MIN_PLAUSIBLE_PRICE_RM, limit),
        ).fetchall()
        ages = con.execute(
            """SELECT year, COUNT(*), AVG(price_rm), MIN(price_rm), MAX(price_rm)
               FROM listings WHERE vehicle_id = ? AND price_rm > ? AND year IS NOT NULL
               GROUP BY year ORDER BY year DESC""",
            (vehicle_id, MIN_PLAUSIBLE_PRICE_RM),
        ).fetchall()
    finally:
        con.close()

    return {
        "available": bool(rows),
        "total_listings": sum(r[1] for r in ages),
        "listings": [
            {
                "title": t, "year": y, "mileage_km": m,
                "price_rm": round(p, 0), "source": s, "url": u,
            }
            for t, y, m, p, s, u in rows
        ],
        "by_age": [
            {
                "year": y, "count": n,
                "avg_price_rm": round(avg, 0),
                "min_price_rm": round(lo, 0),
                "max_price_rm": round(hi, 0),
            }
            for y, n, avg, lo, hi in ages
        ],
    }


@lru_cache(maxsize=1)
def _stations_full() -> list[dict]:
    try:
        with open(STATIONS_FULL, encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, json.JSONDecodeError):
        return []
    return data if isinstance(data, list) else []


# Anything at or above this is a fast charger you would use mid-journey rather
# than a destination point you leave the car at.
DC_FAST_KW = 50.0


def charger_mix(home: tuple[float, float], radius_km: float) -> dict:
    """What the charging points near a postcode are actually like.

    infrastructure_engine counts operational points and stops there, which is
    why it returns the same score for every EV regardless of how fast it
    charges. The richer file carries network, connector, power and price for
    852 points and is read by nothing.
    """
    from ..engines.engines import _haversine_km

    near = []
    for station in _stations_full():
        try:
            lat, lng = float(station["lat"]), float(station["lng"])
        except (KeyError, TypeError, ValueError):
            continue
        if _haversine_km(home, (lat, lng)) <= radius_km:
            near.append(station)

    def power_of(station: dict) -> float:
        try:
            return float(station.get("powerNumeric") or 0)
        except (TypeError, ValueError):
            return 0.0

    fast = [s for s in near if power_of(s) >= DC_FAST_KW]
    networks: dict[str, int] = {}
    for station in near:
        name = (station.get("network") or "Unknown Network").strip()
        networks[name] = networks.get(name, 0) + 1

    powers = sorted((power_of(s) for s in near if power_of(s) > 0), reverse=True)
    return {
        "radius_km": radius_km,
        "total": len(near),
        "dc_fast": len(fast),
        "ac_or_slow": len(near) - len(fast),
        "fastest_kw": powers[0] if powers else None,
        "median_kw": powers[len(powers) // 2] if powers else None,
        "networks": [
            {"name": n, "count": c}
            for n, c in sorted(networks.items(), key=lambda kv: -kv[1])[:5]
        ],
    }
