"""CariCarz.com used car scraper via web-api.caricarz.com/elasticsearch/car_list.

The model/model_group filter fields are ignored by the API, so we use
`keyword` (fuzzy match, e.g. "eMas 5") per catalog vehicle. Results are
paginated (per_page=18, meta.last_page) and deduped by ads_id.
"""
from pathlib import Path
import json
import re
import sys
import time
import urllib.request

sys.path.insert(0, str(Path(__file__).resolve().parent))
from http_client import get_text, post_json  # noqa: E402
import db  # noqa: E402
import matcher  # noqa: E402

API = "https://web-api.caricarz.com/elasticsearch/car_list"
HEADERS = {
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0.0.0",
    "Referer": "https://www.caricarz.com/",
}


def _num(s):
    if s is None:
        return None
    if isinstance(s, (int, float)):
        return float(s)
    m = re.search(r"[\d,]+\.?\d*", str(s))
    return float(m.group(0).replace(",", "")) if m else None


def call(keyword="", page="1", brand=""):
    body = {
        "user_type": "", "setting_car_category": [], "certified": None, "promo": None,
        "video": None, "condition": "", "brand": brand, "model_group": "", "model": "",
        "variant": [], "state": [], "city": [],
        "price": {"min_price": None, "max_price": None},
        "year": {"min_year": "", "max_year": ""},
        "mileage": {"min_mileage": None, "max_mileage": None},
        "sort": {"sort_price": "", "sort_year": "", "sort_mileage": "", "sort_ads_title": ""},
        "body_type": [], "color": [], "fuel_type": [], "page": page, "keyword": keyword,
        "automall": 0,
    }
    return post_json(API, json.dumps(body).encode(), headers=HEADERS, timeout=30)


def parse_item(a):
    title = a.get("ads_title", "")
    year = matcher.extract_year(title)
    m = matcher.match_title(title)
    slug = a.get("ads_slug") or ""
    url = "https://www.caricarz.com/" + slug if slug else None
    if not url:
        url = f"https://www.caricarz.com/cars-for-sale?keyword={a.get('ads_id')}"
    return {
        "url": url,
        "name": title,
        "price": _num(a.get("ads_price")),
        "year": year,
        "mileage": _num(a.get("ads_mileage")),
        "location": a.get("dealer_state") or a.get("ads_location"),
        "ads_id": a.get("ads_id"),
        "vehicle_id": m["vehicle_id"] if m else None,
    }


def scrape(query=None, brand="", max_pages=5):
    total_seen = new = 0
    try:
        r = call(keyword=query, page="1", brand=brand)
    except Exception as e:
        print(f"  fetch fail: {e}")
        return 0, 0
    meta = r.get("meta") or {}
    pages = min(int(meta.get("last_page") or 1), max_pages)
    for page in range(1, pages + 1):
        if page > 1:
            try:
                r = call(keyword=query, page=str(page), brand=brand)
            except Exception as e:
                print(f"  fetch fail page {page}: {e}")
                time.sleep(3)
                continue
        for a in r.get("data", []) or []:
            it = parse_item(a)
            if not it["name"]:
                continue
            total_seen += 1
            if db.upsert_listing({
                "source": "caricarz",
                "source_id": str(it["ads_id"]),
                "vehicle_id": it["vehicle_id"],
                "title": it["name"],
                "price_rm": it["price"],
                "year": it["year"],
                "url": it["url"],
                "run_id": db._ACTIVE_RUN,
            }):
                new += 1
        time.sleep(0.7)
    return total_seen, new


def main():
    db.init_db()
    db._ACTIVE_RUN = db.start_run("caricarz")
    total = new = 0
    for v in matcher.load_catalog():
        q = f"{v['brand']} {v['model']}"
        t, n = scrape(query=q, max_pages=3)
        total += t
        new += n
        print(f"caricarz {q}: seen={t} new={n}", flush=True)
    db.finish_run(db._ACTIVE_RUN, total, new)
    print(f"caricarz DONE total={total} new={new}")


if __name__ == "__main__":
    main()