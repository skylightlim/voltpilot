#!/usr/bin/env python3
"""Validate the seed data the decision engine depends on.

Runs as part of the daily refresh so data problems surface the day they appear
rather than months later in a recommendation. Checks fall into two classes:

  ERROR  - the engine will produce a wrong answer, or cannot run at all
  WARN   - the engine falls back to a documented default; usable but weaker

Exit code is 1 only on ERROR, so warnings do not fail the daily job.

Usage:
    python3 scripts/validate_data.py
    python3 scripts/validate_data.py --json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = Path(__import__("os").environ.get("DATA_DIR", ROOT / "data"))

ERROR, WARN = "error", "warn"


def _add(out: list, level: str, check: str, detail: str, ids: list | None = None) -> None:
    out.append({"level": level, "check": check, "detail": detail,
                "count": len(ids) if ids is not None else 1,
                "ids": (ids or [])[:10]})


def validate() -> list[dict]:
    out: list[dict] = []

    cat_path = DATA / "catalog_vehicles.json"
    if not cat_path.exists():
        _add(out, ERROR, "catalog.present", f"missing {cat_path}")
        return out
    V = json.loads(cat_path.read_text())["vehicles"]

    if not V:
        _add(out, ERROR, "catalog.nonempty", "catalog has no vehicles")
        return out

    ids = [v.get("id") for v in V]
    dupes = sorted({i for i in ids if ids.count(i) > 1})
    if dupes:
        _add(out, ERROR, "catalog.unique_ids", "duplicate vehicle ids", dupes)

    bad_type = [v["id"] for v in V if v.get("type") not in ("ev", "hybrid", "phev")]
    if bad_type:
        _add(out, ERROR, "catalog.type", "type must be ev/hybrid/phev", bad_type)

    bad_price = [v["id"] for v in V
                 if not isinstance(v.get("price_rm"), (int, float))
                 or not 20_000 <= v["price_rm"] <= 3_000_000]
    if bad_price:
        _add(out, ERROR, "catalog.price_rm", "missing or out of range (RM20k-3M)", bad_price)

    no_tax = [v["id"] for v in V if v.get("ownership", {}).get("road_tax_rm") is None]
    if no_tax:
        _add(out, ERROR, "ownership.road_tax_rm", "required by the TCO engine", no_tax)

    # --- EV / PHEV energy inputs -----------------------------------------
    ev_no_range = [v["id"] for v in V if v["type"] == "ev" and not v["specs"].get("range_km")]
    if ev_no_range:
        _add(out, ERROR, "specs.range_km", "EV range drives the behaviour engine", ev_no_range)

    no_batt = [v["id"] for v in V
               if v["type"] in ("ev", "phev") and not v["specs"].get("battery_kwh")]
    if no_batt:
        _add(out, WARN, "specs.battery_kwh",
             "absent; _kwh100 falls back to 17.0 kWh/100km", no_batt)

    # A battery too small to deliver the claimed range is internally impossible.
    impossible = []
    for v in V:
        b, r = v["specs"].get("battery_kwh"), v["specs"].get("range_km")
        if b and r and r > 20 and b / r * 100 < 5:      # < 5 kWh per 100 km
            impossible.append(f"{v['id']}({b}kWh/{r}km)")
    if impossible:
        _add(out, ERROR, "specs.battery_vs_range",
             "battery cannot deliver the stated range (<5 kWh/100km)", impossible)

    no_cc = [v["id"] for v in V
             if v["type"] in ("hybrid", "phev") and not v["specs"].get("engine_cc")]
    if no_cc:
        _add(out, WARN, "specs.engine_cc",
             "absent; road tax and insurance bands cannot be recomputed", no_cc)

    # WLTP combined figures are far below real charge-sustaining consumption,
    # and the energy engine already discounts fuel by ev_share — using them
    # double-counts the electric portion.
    wltp = [f"{v['id']}({v['specs']['fuel_l_per_100km']})" for v in V
            if v["type"] == "phev" and (v["specs"].get("fuel_l_per_100km") or 99) < 2.5]
    if wltp:
        _add(out, WARN, "specs.fuel_l_per_100km",
             "PHEV figure looks like WLTP combined, not charge-sustaining", wltp)

    no_ins = [v["id"] for v in V if not v.get("ownership", {}).get("insurance_rm_yr")]
    if no_ins:
        _add(out, WARN, "ownership.insurance_rm_yr",
             "absent; TCO falls back to price x 1.5%", no_ins)

    no_maint = [v["id"] for v in V if not v.get("ownership", {}).get("maintenance_rm_yr")]
    if no_maint:
        _add(out, WARN, "ownership.maintenance_rm_yr",
             "absent; TCO uses the type-median fallback in engines.py", no_maint)

    # --- supporting files -------------------------------------------------
    fuel_path = DATA / "fuel.json"
    if not fuel_path.exists():
        _add(out, ERROR, "fuel.present", f"missing {fuel_path}")
    else:
        fuel = json.loads(fuel_path.read_text())
        co2 = fuel.get("co2_factors", {})
        by_region = co2.get("grid_kg_co2_per_kwh_by_region", {})
        for region in ("peninsular", "east_malaysia"):
            f = by_region.get(region)
            if not f or not 0.05 <= f <= 1.5:
                _add(out, ERROR, "fuel.grid_factor",
                     f"{region} grid factor missing or implausible: {f}")
        ron95 = fuel.get("fuel", {}).get("ron95_rm_per_l")
        if not ron95 or not 1.0 <= ron95 <= 10.0:
            _add(out, ERROR, "fuel.ron95", f"implausible RON95 price: {ron95}")

    stations = DATA / "ev-stations.csv"
    if not stations.exists():
        _add(out, ERROR, "stations.present", f"missing {stations}")
    else:
        rows = stations.read_text().strip().splitlines()
        if len(rows) < 100:
            _add(out, ERROR, "stations.count",
                 f"only {len(rows)-1} stations; the BEV feasibility gate needs real coverage")

    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    findings = validate()
    errors = [f for f in findings if f["level"] == ERROR]
    warns = [f for f in findings if f["level"] == WARN]

    if args.json:
        print(json.dumps({"errors": len(errors), "warnings": len(warns),
                          "findings": findings}, indent=2))
    else:
        for f in errors + warns:
            tag = "ERROR" if f["level"] == ERROR else "warn "
            print(f"[{tag}] {f['check']:<32} {f['count']:>3}  {f['detail']}")
            if f["ids"]:
                print(f"         {', '.join(map(str, f['ids']))}"
                      f"{' …' if f['count'] > len(f['ids']) else ''}")
        print(f"\n{len(errors)} error(s), {len(warns)} warning(s)")

    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
