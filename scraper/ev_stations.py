"""Refresh data/ev-stations.csv from the PLANMalaysia MEVnet_EVCB layer.

Source: https://gisdev.planmalaysia.gov.my/server/rest/services/Hosted/MEVnet_EVCB/FeatureServer/0

The MY EV Hub feed (tools.evcharge.my) is no longer fetched: its server rejected the
GitHub runner's TLS handshake on every daily run. data/ev-stations-full.json is now a
frozen MY EV Hub snapshot (852 points, last pulled 2026-09-06) and is the base this
script merges against; it is never rewritten here.

Hub rows get per-station corrections from data/ev-station-fixes.json and points
outside Malaysia are dropped. Each row carries a parsed `postcode` (last valid 5-digit
number, lot numbers skipped) and `is_public` (working and not residents-only/private).

Each run rebuilds ev-stations.csv as: the frozen hub rows (source=myevhub, with kW,
price and status) plus every MEVnet "Existing" site with no hub point within
MEVNET_DEDUPE_KM (source=mevnet, locations only, assumed operational). MEVnet
snapshots are dated 2023-2025. Unlike the old hub fetch, a MEVnet failure is a real
failure: the run exits non-zero and leaves the CSV untouched.

Usage:
    python -m scraper.ev_stations            (from repo root)
    python scraper/ev_stations.py
"""

from __future__ import annotations

import csv
import json
import math
import re
import sys
from pathlib import Path

import requests  # noqa: F401  (kept: raise_for_status/exceptions used below)

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts" / "used_market"))
from http_client import session as _session  # noqa: E402

MEVNET_URL = (
    "https://gisdev.planmalaysia.gov.my/server/rest/services/Hosted/"
    "MEVnet_EVCB/FeatureServer/0/query"
)
MEVNET_DEDUPE_KM = 0.2
MEVNET_PAGE = 1000  # the layer's maxRecordCount
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
    "source",
    "postcode",
    "is_public",
]

FIXES_PATH = DATA_DIR / "ev-station-fixes.json"
# Peninsular + Borneo, with margin. Anything outside is a feed default (the hub has
# emitted Mountain View, CA) and would poison distance maths and prefix centroids.
MY_BBOX = (0.8, 7.5, 99.4, 119.5)  # lat_min, lat_max, lng_min, lng_max

_POSTCODE_RE = re.compile(r"(?<!\d)(\d{5})(?!\d)")
# "Lot 10280", "PTD 16031", "KM 15385": lot/marker numbers are not postcodes.
_LOT_BEFORE_RE = re.compile(r"\b(?:lot|pt|ptd|plo|no|km|batu)\.?\s*$", re.I)
# Chargers the public cannot use: gated condos, private/showroom bays, residents-only.
_NON_PUBLIC_RE = re.compile(
    r"\[restricted\]|\(private\)|\(residential|condo|resident'?s?\s+use|showroom", re.I
)

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


def parse_postcode(*texts: str | None) -> str | None:
    """Last valid 5-digit Malaysian postcode in the first text that has one.

    Last, not first: addresses lead with lot numbers ("Lot PT 60458, Sungai Petani,
    08000") and the postcode follows the town. Lot/KM-prefixed numbers are skipped.
    """
    for text in texts:
        found = []
        for m in _POSTCODE_RE.finditer(text or ""):
            pc = m.group(1)
            if not _LOT_BEFORE_RE.search((text or "")[: m.start()]) and "01" <= pc[:2] <= "98":
                found.append(pc)
        if found:
            return found[-1]
    return None


def is_public(name: str | None, operational: object) -> bool:
    """Open to any driver and working: not residents-only/private/showroom, not offline."""
    return str(operational).lower() == "true" and not _NON_PUBLIC_RE.search(name or "")


def in_malaysia(lat: float, lng: float) -> bool:
    return MY_BBOX[0] <= lat <= MY_BBOX[1] and MY_BBOX[2] <= lng <= MY_BBOX[3]


def apply_fixes(stations: list[dict], fixes: dict) -> list[dict]:
    """Copy of the hub rows with per-station coordinate/postcode corrections applied."""
    out = []
    for s in stations:
        fix = fixes.get(str(s.get("id")))
        s = dict(s)
        if fix:
            for k in ("lat", "lng", "postcode"):
                if k in fix:
                    s[k] = fix[k]
        out.append(s)
    return out


def _km(a: tuple[float, float], b: tuple[float, float]) -> float:
    p = math.pi / 180
    h = (
        math.sin((b[0] - a[0]) * p / 2) ** 2
        + math.cos(a[0] * p) * math.cos(b[0] * p) * math.sin((b[1] - a[1]) * p / 2) ** 2
    )
    return 12742 * math.asin(math.sqrt(h))


def fetch_mevnet(timeout: int = 60) -> list[dict]:
    """Existing MEVnet sites as CSV-shaped rows (paged: the layer caps at 1000)."""
    rows: list[dict] = []
    offset = 0
    while True:
        resp = _session().get(
            MEVNET_URL,
            params={
                "where": "status='Existing'",
                "outFields": "objectid,location,pbt,state,latitude,longitude",
                "returnGeometry": "false",
                "orderByFields": "objectid",
                "resultOffset": offset,
                "resultRecordCount": MEVNET_PAGE,
                "f": "json",
            },
            timeout=timeout,
        )
        resp.raise_for_status()
        payload = resp.json()
        if "error" in payload:
            raise ValueError(f"MEVnet error: {payload['error']}")
        feats = payload.get("features", [])
        for f in feats:
            a = f["attributes"]
            lat, lng = a.get("latitude"), a.get("longitude")
            if lat is None or lng is None:
                continue
            rows.append(
                {
                    "id": f"mevnet-{a['objectid']}",
                    "name": (a.get("location") or "").strip(),
                    "address": ", ".join(
                        x.strip().title() for x in (a.get("pbt"), a.get("state")) if x
                    ),
                    "lat": lat,
                    "lng": lng,
                    "operator": "MEVnet",
                    "is_operational": True,
                    "source": "mevnet",
                }
            )
        if not payload.get("exceededTransferLimit"):
            return rows
        offset += len(feats)


def merge_mevnet(stations: list[dict], mevnet: list[dict]) -> list[dict]:
    """MEVnet rows with no MY EV Hub point within MEVNET_DEDUPE_KM."""
    hub = [(float(s["lat"]), float(s["lng"])) for s in stations if s.get("lat") and s.get("lng")]
    return [
        m for m in mevnet
        if all(_km((m["lat"], m["lng"]), h) > MEVNET_DEDUPE_KM for h in hub)
    ]


def write_csv(data: list[dict], path: Path, extra: list[dict] | None = None) -> None:
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        for row in data:
            out_row = {out: row.get(src) for out, src in KEY_MAP.items()}
            out_row["source"] = "myevhub"
            out_row["postcode"] = row.get("postcode") or parse_postcode(
                row.get("address"), row.get("name")
            )
            out_row["is_public"] = is_public(row.get("name"), row.get("isOperational"))
            writer.writerow(out_row)
        for row in extra or []:
            out_row = {c: row.get(c) for c in CSV_COLUMNS}
            out_row["is_public"] = is_public(row.get("name"), row.get("is_operational"))
            writer.writerow(out_row)


def main() -> int:
    stations = json.loads((DATA_DIR / "ev-stations-full.json").read_text(encoding="utf-8"))
    fixes = json.loads(FIXES_PATH.read_text(encoding="utf-8")) if FIXES_PATH.exists() else {}
    stations = apply_fixes(stations, fixes)
    kept = [s for s in stations if in_malaysia(float(s["lat"]), float(s["lng"]))]
    for s in stations:
        if s not in kept:
            print(f"WARN: dropped hub point outside Malaysia: {s['id']} {s['name']!r} "
                  f"({s['lat']}, {s['lng']}); add it to data/ev-station-fixes.json")
    stations = kept
    mevnet = [m for m in fetch_mevnet() if in_malaysia(m["lat"], m["lng"])]
    added = merge_mevnet(stations, mevnet)
    if not added:
        raise ValueError("MEVnet returned no sites outside the hub footprint; refusing to write")
    write_csv(stations, DATA_DIR / "ev-stations.csv", added)
    print(f"OK: {len(stations)} frozen MY EV Hub points + {len(added)} MEVnet-only sites")
    print(f"    {DATA_DIR / 'ev-stations.csv'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
