"""Carro.my used car scraper.

SvelteKit app: POST https://carro.co/_actions/getBuyCarListingData
with a JSON filter payload. Response body is SvelteKit "devalue"
serialization; see decode_devalue().
"""
from pathlib import Path
import json
import sys
import time
import urllib.parse
import urllib.request

sys.path.insert(0, str(Path(__file__).resolve().parent))
from http_client import post_json  # noqa: E402
import db  # noqa: E402
import matcher  # noqa: E402

API = "https://carro.co/_actions/getBuyCarListingData"
HEADERS = {
    "Content-Type": "application/json",
    "Origin": "https://carro.co",
    "Referer": "https://carro.co/",
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "*/*",
}
PAGE_SIZE = 18


def decode_devalue(data):
    """Decode SvelteKit devalue payload (structure used by carro listings)."""
    if not isinstance(data, list) or not data:
        return data
    length = len(data)

    def resolve(idx):
        v = data[idx]
        if isinstance(v, list) and v and all(isinstance(x, int) for x in v):
            return [resolve(x) for x in v]
        if isinstance(v, dict) and v and all(
            isinstance(k, str) and isinstance(x, int) and (-1 <= x < length)
            for k, x in v.items()
        ):
            return {k: (None if x == -1 else resolve(x)) for k, x in v.items()}
        return v

    props = data[0]
    if isinstance(props, dict):
        return {k: resolve(v) for k, v in props.items()}
    return resolve(0)


def search(children=None, parent=None, max_pages=10, base_payload=None):
    payload = base_payload or {
        "countryCode": "my",
        "locale": "en",
        "currentItemIndex": 0,
        "searchAfter": [0, 0, 0, 0, 0],
        "filters": {
            "fuelType": [],
            "availability": [],
            "transmission": [],
            "bodyType": [],
            "colors": [],
            "promotions": [],
            "brand": {"parent": [parent] if parent else [], "children": children or []},
            "instalment": {"min": None, "max": None},
            "mileage": {"min": None, "max": None},
            "manufactureYear": {"min": None, "max": None},
            "price": {"min": None, "max": None},
            "360view": [],
            "location": [],
            "carroExclusive": [],
        },
        "sorting": {"fieldName": "time", "order": "desc"},
    }
    seen = set()
    results = []
    for page in range(max_pages):
        raw = post_json(API, json.dumps(payload).encode(), headers=HEADERS, timeout=30)
        root = decode_devalue(raw)
        cars = root.get("carList") or []
        if not cars:
            break
        results.extend(cars)
        for c in cars:
            seen.add(c.get("id"))
        search_after = root.get("searchAfter")
        if not search_after:
            break
        payload["searchAfter"] = search_after
        payload["currentItemIndex"] += len(cars)
        if len(cars) < PAGE_SIZE:
            break
        time.sleep(0.3)
    return results


def normalize_car(c):
    price_raw = c.get("listedPrice")
    if price_raw is None:
        price_raw = c.get("allInPrice")
    if price_raw is None and c.get("price"):
        price_raw = int(str(c["price"]).replace("RM", "").replace(",", "").strip())
    fuel = c.get("fuel_type") or ""
    fuel_map = {"petrol": "petrol", "diesel": "diesel", "electric": "electric", "elektrik": "electric", "hybrid": "hybrid"}
    return {
        "source_id": str(c.get("slug") or c.get("id")),
        "title": c.get("title"),
        "price_rm": price_raw,
        "year": c.get("manufactureYear"),
        "mileage_km": int(str(c["mileage"]).replace(",", "").replace("km", "").strip()) if c.get("mileage") else None,
        "fuel_type": fuel_map.get(fuel.lower(), fuel.lower() or None),
        "transmission": c.get("transmissionType"),
        "location": c.get("location"),
        "url": "https://carro.co" + c["detailUrl"] if c.get("detailUrl") else None,
        "raw": {"original_registration_date": c.get("original_registration_date"), "brand": c.get("brand"), "model": c.get("model"), "variant": c.get("variant")},
    }


def scrape_children(children, parent=None):
    cars = search(children=children, parent=parent)
    total = new = 0
    for c in cars:
        if not c.get("title"):
            continue
        norm = normalize_car(c)
        m = matcher.match_title(norm["title"])
        vehicle_id = m["vehicle_id"] if m else None
        norm["vehicle_id"] = vehicle_id
        if db.upsert_listing({**norm, "source": "carro", "run_id": db._ACTIVE_RUN}):
            new += 1
        total += 1
    return total, new


def main():
    db.init_db()
    db._ACTIVE_RUN = db.start_run("carro")
    total = new = 0
    try:
        # fetch all EV/hybrid-relevant makes used by the catalog
        parents = ["PROTON", "BYD", "TESLA", "XPENG", "VOLVO", "MG", "AION", "GWM", "CHERY",
                   "SMART", "TOYOTA", "HONDA", "NISSAN", "HYUNDAI", "KIA", "BMW", "MERCEDES-BENZ",
                   "MAZDA", "AUDI", "VOLKSWAGEN", "SUZUKI", "LEXUS", "PORSCHE", "LOTUS", "ZEEKR",
                   "DENZA", "DONGFENG", "JAC", "MAXUS", "RENAULT", "LEAPMOTOR", "NETA", "WULING",
                   "SERES", "ICAUR", "GAC", "JAEÇOO".replace("JAEÇOO", "JAECOO"), "OMODA", "FOTON"]
        for p in parents:
            t, n = scrape_children(None, parent=p)
            total += t
            new += n
            print(f"{p}: seen={t} new={n}")
    finally:
        db.finish_run(db._ACTIVE_RUN, total, new)
    print(f"carro total seen={total} new={new}")


if __name__ == "__main__":
    main()