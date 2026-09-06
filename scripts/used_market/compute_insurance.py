#!/usr/bin/env python3
"""Compute annual comprehensive motor insurance premium (Peninsular, 0% NCD) for every catalog hybrid/PHEV.

Formula reverse-engineered from https://www.carbase.my/tool/insurance-calculator (server-side
POST /tool/insurance-calculator/calculate, verified at 12+ probe points, Aug 2026):

  premium = rate * market_price + base(engine_cc_band)
    Peninsular: rate 0.026, bases per cc band [247.80, 279.50, 313.10, 346.60, 378.30, 410.00, 443.60, 475.30]
    East MY:     rate 0.0203, bases per cc band [175.90, 199.70, 223.60, 246.20, 270.10, 292.70, 316.60, 339.20]

  cc bands: 1:<=1400  2:1401-1650  3:1651-2200  4:2201-3050  5:3051-4100  6:4101-4250  7:4251-4400  8:>4400
  NCD discounts (of total): 25% 1st yr, 30% 2nd, 38.33% 3rd, 45% 4th, 55% 5+ yrs — not applied here (0% NCD basis).

Usage: python3 compute_insurance.py [--apply]
"""
import json
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent.parent / "data"
CATALOG_PATH = BASE / "catalog_vehicles.json"

# import MISSING_CC from the road-tax script (same catalog constants)
sys.path.insert(0, str(Path(__file__).resolve().parent))
from compute_road_tax import MISSING_CC  # noqa: E402

RATE_PENINSULAR = 0.026
RATE_EAST = 0.0203
BASE_PENINSULAR = [247.80, 279.50, 313.10, 346.60, 378.30, 410.00, 443.60, 475.30]
BASE_EAST = [175.90, 199.70, 223.60, 246.20, 270.10, 292.70, 316.60, 339.20]
CC_BANDS = [(0, 1400), (1401, 1650), (1651, 2200), (2201, 3050), (3051, 4100), (4101, 4250), (4251, 4400), (4401, None)]


def cc_band(cc):
    for i, (lo, hi) in enumerate(CC_BANDS):
        if hi is None or cc <= hi:
            return i
    return 7


def insurance_rm(price, cc, east=False):
    rate = RATE_EAST if east else RATE_PENINSULAR
    base = (BASE_EAST if east else BASE_PENINSULAR)[cc_band(cc)]
    return rate * price + base


def main():
    apply = "--apply" in sys.argv
    data = json.loads(CATALOG_PATH.read_text())
    vehicles = data["vehicles"]
    results = []
    for v in vehicles:
        if v.get("type") not in ("hybrid", "phev"):
            results.append((v["id"], None, ""))
            continue
        specs = v.get("specs", {})
        cc = specs.get("engine_cc") or MISSING_CC.get(v["id"])
        price = v.get("price_rm")
        if cc is None or price is None:
            results.append((v["id"], None, "missing engine_cc/price_rm"))
            continue
        prem = round(insurance_rm(price, cc))
        results.append((v["id"], prem, f"{cc}cc band{cc_band(cc)+1} x RM{price:,.0f}"))

    if not apply:
        print(f"{'id':38s} {'prem':>8s}  basis")
        for rid, prem, basis in results:
            print(f"{rid:38s} {('RM'+str(prem)) if prem is not None else '-':>8s}  {basis}")
        print()
        print(f"total: {len(results)}  (run with --apply to write into catalog)")
        return

    by_id = {r[0]: r for r in results}
    for v in vehicles:
        # Only touch vehicles this script owns. It previously popped
        # insurance_rm_yr for every out-of-scope row, so running this and its
        # sibling in sequence wiped each other's work and the catalog never held
        # more than one powertrain's premiums at a time.
        if v.get("type") not in ("hybrid", "phev"):
            continue
        rid = v["id"]
        _, prem, basis = by_id[rid]
        ownership = v.setdefault("ownership", {})
        if prem is not None:
            ownership["insurance_rm_yr"] = prem
            ownership["insurance_note"] = "comprehensive, Peninsular, 0% NCD (carbase.my formula)" + (f" ({basis})" if basis else "")
        else:
            ownership.pop("insurance_rm_yr", None)
    CATALOG_PATH.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n")
    print(f"updated {len(vehicles)} vehicles -> {CATALOG_PATH}")


if __name__ == "__main__":
    main()