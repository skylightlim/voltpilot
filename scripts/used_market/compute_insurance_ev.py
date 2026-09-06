#!/usr/bin/env python3
"""Compute annual comprehensive motor insurance premium for every catalog EV.

Formula reverse-engineered from https://calculatormalaysia.com/insurance/ev-car-insurance-calculator-malaysia/
(Next.js client bundle chunk 27236, validated live on the rendered calculator, Aug 2026):

  base_rate by sum insured: <=50k:2.8%  <=100k:2.6%  <=200k:2.5%  <=300k:2.4%  <=400k:2.38%  >400k:2.35%
  base       = SI * base_rate * (Peninsular 1.0 / East MY 0.9)
  gross      = base * (1 - NCD) + addons
  total      = gross * 1.08 (8% SST) + RM10 stamp duty

Add-ons in the calculator (windscreen, special perils, EV home wall charger RM12k, LLP RM56.70,
LLPN RM7.50) are all OFF by default; we compute the car-only premium (vehicle + battery, no
charger/liability/windscreen extras). Battery damage from accidents is covered under the base
comprehensive policy; battery degradation is excluded (manufacturer warranty matter).

Validated against the live calculator: car-only total RM4,060.00 @ SI150k/0%NCD/Peninsular
(confirmed by unchecking all 5 add-on toggles in the UI); with LLP+LLPN it is RM4,129.34.

Usage: python3 compute_insurance_ev.py [--apply]
"""
import json
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent.parent / "data"
CATALOG_PATH = BASE / "catalog_vehicles.json"

RATE_BANDS = [(50000, 0.028), (100000, 0.026), (200000, 0.025), (300000, 0.024), (400000, 0.0238), (None, 0.0235)]
ADDONS_DEFAULT = 0.0  # car-only: all add-ons (charger/windscreen/special perils/liability) excluded
SST = 0.08
STAMP_DUTY = 10


def ev_insurance_total(si, ncd=0.0, east=False):
    rate = next(r for cap, r in RATE_BANDS if cap is None or si <= cap)
    base = si * rate * (0.9 if east else 1.0)
    gross = base * (1 - ncd) + ADDONS_DEFAULT
    return gross * (1 + SST) + STAMP_DUTY


def main():
    apply = "--apply" in sys.argv
    data = json.loads(CATALOG_PATH.read_text())
    vehicles = data["vehicles"]
    results = []
    for v in vehicles:
        if v.get("type") != "ev":
            results.append((v["id"], None, ""))
            continue
        price = v.get("price_rm")
        if price is None:
            results.append((v["id"], None, "missing price_rm"))
            continue
        rate = next(r for cap, r in RATE_BANDS if cap is None or price <= cap)
        prem = round(ev_insurance_total(price))
        results.append((v["id"], prem, f"SI RM{price:,.0f} @ {rate:.2%}"))

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
        if v.get("type") != "ev":
            continue
        rid = v["id"]
        _, prem, basis = by_id[rid]
        ownership = v.setdefault("ownership", {})
        if prem is not None:
            ownership["insurance_rm_yr"] = prem
            ownership["insurance_note"] = "comprehensive car+battery only, Peninsular, 0% NCD, incl. SST+stamp (calculatormalaysia.com EV formula)" + (f" ({basis})" if basis else "")
        else:
            ownership.pop("insurance_rm_yr", None)
    CATALOG_PATH.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n")
    print(f"updated {len(vehicles)} vehicles -> {CATALOG_PATH}")


if __name__ == "__main__":
    main()