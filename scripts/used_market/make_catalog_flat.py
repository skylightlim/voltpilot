"""Regenerate catalog_flat.json for node scrapers (brand/model/id only)."""
from pathlib import Path
import json
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import matcher  # noqa: E402

OUT = str(Path(__file__).resolve().parents[2] / "data" / "used_market_raw/catalog_flat.json")

flat = [{"brand": v["brand"], "model": v["model"], "id": v["id"]} for v in matcher.load_catalog()]
with open(OUT, "w") as f:
    json.dump(flat, f)
print(f"wrote {len(flat)} vehicles to {OUT}")
