"""Fetch the MY EV Hub charging-station directory and refresh the data/ seed files.

Source: https://tools.evcharge.my/charging-stations-directory
API:    https://tools.evcharge.my/_api/ev-stations   (returns the full list in one call)

Outputs:
    data/ev-stations-full.json   raw API payload
    data/ev-stations.csv         flat table (id, name, address, lat/lng, operator,
                                 charger type, power kW, price, status)

Usage:
    python -m scraper.ev_stations            (from repo root)
    python scraper/ev_stations.py
"""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

import requests  # noqa: F401  (kept: raise_for_status/exceptions used below)

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts" / "used_market"))
from http_client import session as _session  # noqa: E402

API_URL = "https://tools.evcharge.my/_api/ev-stations"
REPO_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_DIR / "data"

CSV_COLUMNS = [
    "id",
    "name",
    "address",
    "lat",
    "lng",
    "operator",
    "charger_type",
    "power_kw",
    "power",
    "price",
    "status",
    "is_operational",
]

KEY_MAP = {
    "id": "id",
    "name": "name",
    "address": "address",
    "lat": "lat",
    "lng": "lng",
    "operator": "network",
    "charger_type": "chargerType",
    "power_kw": "powerNumeric",
    "power": "power",
    "price": "price",
    "status": "status",
    "is_operational": "isOperational",
}


def fetch_stations(timeout: int = 60) -> list[dict]:
    # shared pooled session: adds retry/backoff on 429 and 5xx
    resp = _session().get(API_URL, timeout=timeout)
    resp.raise_for_status()
    data = resp.json()
    if not isinstance(data, list):
        raise ValueError(f"Unexpected payload: expected list, got {type(data).__name__}")
    return data


def write_json(data: list[dict], path: Path) -> None:
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def write_csv(data: list[dict], path: Path) -> None:
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        for row in data:
            writer.writerow({out: row.get(src) for out, src in KEY_MAP.items()})


def main() -> int:
    stations = fetch_stations()
    write_json(stations, DATA_DIR / "ev-stations-full.json")
    write_csv(stations, DATA_DIR / "ev-stations.csv")

    operators = {s.get("network") for s in stations}
    operational = sum(1 for s in stations if s.get("isOperational"))
    print(
        f"OK: {len(stations)} stations, {len(operators)} operators, "
        f"{operational} operational"
    )
    print(f"    {DATA_DIR / 'ev-stations-full.json'}")
    print(f"    {DATA_DIR / 'ev-stations.csv'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())