"""Mudah.my used car scraper.

Server-rendered listing pages embed a schema.org ItemList in
application/ld+json: {url, name, offers.price, image, itemCondition}.

Search URL scheme:
  /malaysia/cars-for-sale?q=<search>&page=<n>
  /malaysia/cars-for-sale?b=<brand>&m=<model>  (brand/model filters)
"""
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, "/home/skylight/ai-transport-platform/scripts/used_market")
import db  # noqa: E402
import matcher  # noqa: E402

BASE = "https://www.mudah.my/malaysia/cars-for-sale"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
    "Accept-Language": "en-MY,en;q=0.9",
}
MAX_PAGES = 50


def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def parse_listings(html):
    """Return list of {url, name, price, year} from ItemList JSON-LD."""
    items = []
    for m in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', html, re.S):
        try:
            data = json.loads(m.group(1))
        except json.JSONDecodeError:
            continue
        if not isinstance(data, list):
            data = [data]
        for blk in data:
            if blk.get("@type") != "ItemList":
                continue
            for entry in blk.get("itemListElement", []):
                p = entry.get("item", {})
                if p.get("@type") != "Product":
                    continue
                url = p.get("url")
                name = p.get("name")
                price = (p.get("offers") or {}).get("price")
                items.append({
                    "url": url,
                    "name": name,
                    "price": float(price) if price is not None else None,
                    "year": matcher.extract_year(name),
                })
    return items


def scrape(query=None, brand=None, model=None, max_pages=8):
    params = {}
    if query:
        params["q"] = query
    total_seen = 0
    new = 0
    prev_first = None
    for page in range(0, max_pages):
        p = dict(params)
        if page > 0:
            p["o"] = page * 30
        url = BASE + ("?" + urllib.parse.urlencode(p) if p else "")
        for attempt in range(4):
            try:
                html = fetch(url)
                break
            except urllib.error.HTTPError as e:
                if e.code == 429:
                    time.sleep(15 * (attempt + 1))
                    continue
                raise
            except urllib.error.URLError as e:
                print(f"  urlerror {e}, sleeping")
                time.sleep(5)
                continue
        else:
            print(f"  giving up on {url} after 429s")
            break
        items = parse_listings(html)
        if not items:
            break
        if prev_first is not None and items[0]["url"] == prev_first:
            break
        prev_first = items[0]["url"]
        for it in items:
            total_seen += 1
            src_id = urllib.parse.urlparse(it["url"]).path.split("/")[-1]
            m = matcher.match_title(it["name"])
            vehicle_id = m["vehicle_id"] if m else None
            if db.upsert_listing({
                "source": "mudah",
                "source_id": src_id,
                "vehicle_id": vehicle_id,
                "title": it["name"],
                "price_rm": it["price"],
                "year": it["year"],
                "url": it["url"],
                "run_id": db._ACTIVE_RUN,
            }):
                new += 1
        time.sleep(1.0)
    return total_seen, new


def main():
    db.init_db()
    db._ACTIVE_RUN = db.start_run("mudah")
    total = new = 0
    try:
        for v in matcher.load_catalog():
            q = f"{v['brand']} {v['model']}"
            t, n = scrape(query=q, max_pages=3)
            total += t
            new += n
            print(f"mudah {q}: seen={t} new={n}", flush=True)
    finally:
        pass
    db.finish_run(db._ACTIVE_RUN, total, new)
    print(f"mudah DONE total={total} new={new}")


if __name__ == "__main__":
    main()