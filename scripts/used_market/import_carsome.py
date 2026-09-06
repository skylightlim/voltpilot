"""Import carsome JSONL listings into used_market.db with matching."""
import json
import sys

sys.path.insert(0, "/home/skylight/ai-transport-platform/scripts/used_market")
import db  # noqa: E402
import matcher  # noqa: E402


def main(path="/home/skylight/ai-transport-platform/data/used_market_raw/carsome_listings.jsonl"):
    db.init_db()
    db._ACTIVE_RUN = db.start_run("carsome")
    total = new = 0
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            r = json.loads(line)
            total += 1
            m = matcher.match_title(r["carName"])
            if db.upsert_listing({
                "source": "carsome",
                "source_id": str(r["carId"]),
                "vehicle_id": m["vehicle_id"] if m else None,
                "title": r["carName"],
                "price_rm": r["expSellingPrice"],
                "year": r.get("carYear"),
                "url": r["url"],
                "run_id": db._ACTIVE_RUN,
            }):
                new += 1
    db.finish_run(db._ACTIVE_RUN, total, new)
    print(f"carsome imported total={total} new={new}")


if __name__ == "__main__":
    main()