#!/usr/bin/env python3
"""Record where every engine-critical catalog figure came from.

Road tax is derived from a published JPJ schedule and validates against it
exactly. Maintenance is twenty-two hand-entered numbers. In the JSON the two are
indistinguishable, so a reader cannot tell a computed figure from a guess — on a
product whose pitch is that the recommendation is not a black box.

This writes a `provenance` block per vehicle mapping field -> how we know it:

    measured   a published figure for this exact vehicle
    computed   derived by a cited formula or schedule
    estimated  a fallback, median or approximation
    (absent)   no figure; the engine falls back to a documented default

The catalog already carries free-text road_tax_note / insurance_note / loan_note
and a structured specs.fuel_src triple. Rather than invent a third convention,
this derives the structured form from those and leaves the notes in place as the
human-readable copy.

Usage: python3 scripts/build_provenance.py [--apply]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "data" / "catalog_vehicles.json"

MEASURED, COMPUTED, ESTIMATED = "measured", "computed", "estimated"


def provenance_for(v: dict) -> dict:
    own = v.get("ownership", {})
    specs = v.get("specs", {})
    out: dict[str, dict] = {}

    # --- price: the on-the-road figure the whole ranking hangs off ----------
    if v.get("price_rm"):
        out["price_rm"] = {"method": MEASURED, "basis": "published on-the-road price"}

    # --- road tax: two cited JPJ schedules, chosen by powertrain -----------
    if own.get("road_tax_rm") is not None:
        note = own.get("road_tax_note", "")
        basis = (
            "JPJ Lampiran B, EV kW schedule (2026)"
            if note.startswith("EV")
            else "JPJ Budget-2009 engine-cc schedule, Peninsular private"
        )
        out["road_tax_rm"] = {"method": COMPUTED, "basis": basis}

    # --- insurance: reverse-engineered calculator formulae ------------------
    if own.get("insurance_rm_yr"):
        ev = v.get("type") == "ev"
        out["insurance_rm_yr"] = {
            "method": COMPUTED,
            "basis": (
                "calculatormalaysia.com EV formula, Peninsular, 0% NCD, incl. SST + stamp"
                if ev
                else "carbase.my comprehensive formula, Peninsular, 0% NCD"
            ),
        }

    # --- financing: a stated product, not an observation --------------------
    if own.get("loan_total_interest_rm") is not None:
        out["loan_total_interest_rm"] = {
            "method": COMPUTED,
            "basis": own.get("loan_note", "hire purchase, flat rate"),
        }

    # --- maintenance: measured on 22 rows; the rest fall back in code -------
    if own.get("maintenance_rm_yr"):
        out["maintenance_rm_yr"] = {"method": MEASURED, "basis": "published service schedule"}

    # --- consumption --------------------------------------------------------
    if specs.get("fuel_l_per_100km"):
        # A PHEV figure below 2.5 L/100km is a WLTP *combined* number, which
        # already assumes mostly-electric driving. The energy engine discounts
        # fuel again by ev_share, so using it double-counts the electric share.
        # Say so here rather than let it pass as a measured figure.
        if v.get("type") == "phev" and specs["fuel_l_per_100km"] < 2.5:
            out["fuel_l_per_100km"] = {
                "method": ESTIMATED,
                "basis": "WLTP combined, not charge-sustaining — understates petrol use",
                "caveat": True,
            }
        else:
            entry = {"method": MEASURED, "basis": specs.get("fuel_src") or "manufacturer figure"}
            if specs.get("fuel_as_of_date"):
                entry["as_of"] = specs["fuel_as_of_date"]
            if specs.get("fuel_source_url"):
                entry["url"] = specs["fuel_source_url"]
            out["fuel_l_per_100km"] = entry

    if specs.get("energy_kwh_per_100km"):
        out["energy_kwh_per_100km"] = {"method": MEASURED, "basis": "manufacturer figure"}
    elif specs.get("battery_kwh") and specs.get("range_km"):
        out["energy_kwh_per_100km"] = {
            "method": COMPUTED,
            "basis": "battery_kwh / range_km",
        }

    return out


def main() -> int:
    apply = "--apply" in sys.argv
    data = json.loads(CATALOG.read_text())
    vehicles = data["vehicles"]

    counts: dict[str, int] = {}
    caveats = 0
    for v in vehicles:
        prov = provenance_for(v)
        for entry in prov.values():
            counts[entry["method"]] = counts.get(entry["method"], 0) + 1
            if entry.get("caveat"):
                caveats += 1
        if apply:
            v["provenance"] = prov

    total = sum(counts.values())
    print(f"{len(vehicles)} vehicles, {total} attributed figures")
    for method in (MEASURED, COMPUTED, ESTIMATED):
        n = counts.get(method, 0)
        print(f"  {method:<10} {n:>4}  ({n / total:.0%})")
    print(f"  flagged with a caveat: {caveats}")

    if not apply:
        print("\n(run with --apply to write into the catalog)")
        return 0

    CATALOG.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n")
    print(f"\nupdated {CATALOG}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
