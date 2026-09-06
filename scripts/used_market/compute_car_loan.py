#!/usr/bin/env python3
"""Compute 7-year hire purchase instalment for every catalog vehicle.

Terms (standard Malaysia new-car HP):
  90% margin of financing (10% down payment), 7-year tenure.

Rates (flat % p.a., crosschecked Aug 2026):
  EV    1.75% - Maybank Accelerated Payment Package "as low as 1.75% for
                EV/Hybrid vehicles" (maybank2u.com.my official page, 2026).
                Also lowest advertised EV rate per calculatormalaysia.com
                (1.75%, EIR ~3.24%) and KayaToday (Jun 2026).
  Hybrid 2.00% - green-car financing tier for hybrids (CIMB/Hong Leong/Bank
                 Islam 2.00% per calculatormalaysia.com 2026 table; CIMB
                 Green Car Financing offers preferential rates for hybrid
                 and EV). PHEV treated as hybrid (banks have no separate
                 PHEV rate; plug-in hybrids qualify for green financing).
  Note: Maybank's 1.75% tier also covers hybrids below 100 g/km CO2; we keep
  hybrid at 2.00% (the typical non-MB green tier) per user direction that
  EV loans differ from hybrid loans.

Formula (flat rate, verified against iMoney's live calculator example:
RM100,000 car, 10% down, RM90,000 @ 2.85% x 7yr -> interest RM17,955,
monthly RM1,285.18 - exact):
  loan          = price * 0.90
  interest      = loan * rate * years
  monthly       = (loan + interest) / (years * 12)

Note: Hire Purchase (Amendment) Act 2026 (in force 1 Jun 2026) moves new
loans to reducing-balance with published EIR; banks still advertise flat
rates and the monthly instalment is unchanged for the same EIR.

Usage: python3 compute_car_loan.py [--apply] [--years 7] [--margin 0.9]
"""
import argparse
import json
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent.parent / "data"
CATALOG_PATH = BASE / "catalog_vehicles.json"

RATES = {"ev": 0.0175, "hybrid": 0.0200, "phev": 0.0200}
RATE_SOURCES = {
    "ev": "Maybank Accelerated Payment 1.75% (EV/Hybrid <100g/km), maybank2u.com.my + calculatormalaysia.com 2026",
    "hybrid": "green hybrid tier 2.00% (CIMB/HLB/Bank Islam), calculatormalaysia.com 2026",
    "phev": "treated as hybrid: green 2.00% tier, no separate PHEV rate at banks",
}
DEFAULT_YEARS = 7
DEFAULT_MARGIN = 0.90


def half_up(x, digits=2):
    factor = 10 ** digits
    return __import__("math").floor(x * factor + 0.5) / factor


def loan_monthly(price, rate, years=DEFAULT_YEARS, margin=DEFAULT_MARGIN):
    loan = price * margin
    interest = loan * rate * years
    monthly = (loan + interest) / (years * 12)
    return loan, interest, monthly


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true", help="write results into catalog ownership")
    ap.add_argument("--years", type=int, default=DEFAULT_YEARS, help=f"tenure in years (default {DEFAULT_YEARS})")
    ap.add_argument("--margin", type=float, default=DEFAULT_MARGIN, help=f"margin of financing (default {DEFAULT_MARGIN})")
    args = ap.parse_args()

    # self-test against iMoney live example
    loan, interest, monthly = loan_monthly(100_000, 0.0285, 7, 0.90)
    assert abs(loan - 90_000) < 1e-6 and abs(interest - 17_955) < 0.01 and abs(monthly - 1_285.18) < 0.01, \
        f"formula check failed: {loan=} {interest=} {monthly=}"
    print(f"self-test OK: RM90,000 @ 2.85% x 7yr -> interest RM17,955.00, monthly RM1,285.18 (iMoney)")

    data = json.loads(CATALOG_PATH.read_text())
    vehicles = data["vehicles"]
    results = []
    for v in vehicles:
        vtype = v.get("type")
        price = v.get("price_rm")
        rate = RATES.get(vtype)
        if rate is None:
            results.append((v["id"], None, "non-electrified type"))
            continue
        if price is None:
            results.append((v["id"], None, "missing price_rm"))
            continue
        loan, interest, monthly = loan_monthly(price, rate, args.years, args.margin)
        results.append((v["id"], rate, loan, interest, monthly,
                        f"{vtype} @ {rate:.2%} flat x {args.years}yr, {args.margin:.0%} financing"))

    if not args.apply:
        print(f"{'id':38s} {'type':>6s} {'rate':>6s} {'price':>9s} {'loan':>9s} {'interest':>9s} {'$/mo':>9s}")
        by_type = {}
        for v, r in zip(vehicles, results):
            rid, rate, loan, interest, monthly, basis = r
            if rate is None:
                continue
            by_type[v["type"]] = by_type.get(v["type"], 0) + 1
            print(f"{rid:38s} {v['type']:>6s} {rate:6.2%} {v['price_rm']:9,} {loan:9,.0f} {interest:9,.0f} {monthly:9.2f}")
        print(f"\n{sum(by_type.values())} vehicles ({', '.join(f'{k}:{n}' for k, n in sorted(by_type.items()))}); "
              f"run with --apply to write into catalog")
        return

    by_id = {r[0]: r for r in results}
    for v in vehicles:
        rid = v["id"]
        _, rate, loan, interest, monthly, basis = by_id[rid]
        ownership = v.setdefault("ownership", {})
        if rate is not None:
            ownership["loan_rate_pct"] = round(rate * 100, 2)
            ownership["loan_tenure_yrs"] = args.years
            ownership["loan_down_payment_rm"] = round(v["price_rm"] * (1 - args.margin))
            ownership["loan_monthly_rm"] = half_up(monthly)
            ownership["loan_total_interest_rm"] = round(interest)
            ownership["loan_note"] = (f"hire purchase, {args.years}yr @ {rate:.2%} flat, "
                                      f"{args.margin:.0%} financing ({basis})")
        else:
            for k in ("loan_rate_pct", "loan_tenure_yrs", "loan_down_payment_rm",
                      "loan_monthly_rm", "loan_total_interest_rm", "loan_note"):
                ownership.pop(k, None)
    CATALOG_PATH.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n")
    print(f"updated {len(vehicles)} vehicles -> {CATALOG_PATH}")


if __name__ == "__main__":
    main()
