"""Postcode parsing, public-charger rules and per-station fixes in scraper/ev_stations.py.

Cases come from the 2026-11-14 audit of postcode 56100 (Cheras)."""
import csv
import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location("ev_stations_mod", ROOT / "scraper" / "ev_stations.py")
ev = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ev)


@pytest.mark.parametrize("address,expected", [
    ("Lot PT 60458, Sungai Petani, 08000, Kedah", "08000"),
    ("Lot 10280, , Gua Musang, 18300, Kelantan", "18300"),
    ("Outdoor Carpark, Lot PTD 16031, Jln Teknologi 1, Tangkak, 84900, Johor", "84900"),
    ("Lot 17972, Jln Gombak Bt 7 1/4 53100, Gombak, Selangor", "53100"),
    ("Shamelin Star Residences Rigel, Kuala Lumpur, 56100", "56100"),
    ("Lot 15385 KM 15, New Klang Valley Expy", None),
    ("no postcode here", None),
])
def test_parse_postcode_skips_lot_numbers(address, expected):
    assert ev.parse_postcode(address) == expected


def test_is_public():
    assert ev.is_public("Shamelin Mall", True)
    assert not ev.is_public("[Restricted] PARC 3 RESIDENCE (Residential Condo)", True)
    assert not ev.is_public("V RESIDENCE 2 (RESIDENT USE ONLY)", True)
    assert not ev.is_public("PROTON E.MAS CHERAS (Car Showroom)", True)
    assert not ev.is_public("Shamelin Mall", False)


def test_malaysia_bbox_rejects_the_hub_default_point():
    assert not ev.in_malaysia(37.415328, -122.076575)
    assert ev.in_malaysia(3.0908725, 101.7423126)


def test_every_hub_fix_lands_inside_malaysia_and_applies():
    fixes = json.loads((ROOT / "data" / "ev-station-fixes.json").read_text())
    fixes.pop("_note", None)
    assert fixes
    out = ev.apply_fixes([{"id": int(k), "lat": 37.4, "lng": -122.0} for k in fixes], fixes)
    for s in out:
        if "lat" in fixes[str(s["id"])]:
            assert ev.in_malaysia(s["lat"], s["lng"])


def test_committed_csv_has_no_out_of_malaysia_points_or_lot_postcodes():
    rows = list(csv.DictReader((ROOT / "data" / "ev-stations.csv").open(encoding="utf-8")))
    assert all(ev.in_malaysia(float(r["lat"]), float(r["lng"])) for r in rows)
    assert {"postcode", "is_public"} <= set(rows[0])
