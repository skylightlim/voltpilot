#!/usr/bin/env python3
"""Daily update of Malaysian fuel prices from data.gov.my.

Source: data.gov.my weekly fuel price dataset (id=fuelprice)
    GET https://api.data.gov.my/data-catalogue?id=fuelprice&limit=20000
    Weekly rows since 2017 with two series types:
      - 'level':         absolute pump prices that week (RM/litre)
      - 'change_weekly': weekly delta (ignored here)
    Latest 'level' week wins.

Fields (RM/litre):
    ron95            - market RON95 (untargeted price)
    ron97            - market RON97 (no subsidy)
    diesel           - market diesel
    ron95_skps       - subsidized RON95 (SKPS, eligible consumers)
    diesel_budi      - subsidized diesel (BUDI, individuals)
    diesel_skds      - subsidized diesel (SKDS, logistics sector)
    ron95_budi95     - BUDI RON95 sub-scheme price
    diesel_eastmsia  - East Malaysia diesel

What the platform's cost engines use:
    fuel.ron95_rm_per_l  -> hybrid running cost (pump price consumers pay)
    fuel.co2_factors.*   -> unchanged, NOT touched by this script

This script updates the live price fields + a full market snapshot and
preserves everything else in data/fuel.json (co2_factors, notes).

Run daily, e.g. cron:
    0 6 * * * cd /home/skylight/ai-transport-platform && python3 scripts/update_fuel_prices.py
"""

import json
import sys
import urllib.request
from datetime import datetime, timezone

ROOT = "/home/skylight/ai-transport-platform"
FUEL_PATH = f"{ROOT}/data/fuel.json"
API_URL = "https://api.data.gov.my/data-catalogue?id=fuelprice&limit=20000"

# Pump price = what consumers actually pay at the pump.
# RON95 and diesel have targeted subsidies (SKPS/BUDI/SKDS) that most
# private buyers fall under; RON97 has no subsidy, so market applies.
PUMP_TARGET_KEYS = {
    "ron95": "ron95_rm_per_l",
    "ron97": "ron97_rm_per_l",
    "diesel": "diesel_rm_per_l",
}
PUMP_FALLBACKS = {
    "ron95": ["ron95_skps", "ron95"],
    "ron97": ["ron97"],
    "diesel": ["diesel_budi", "diesel_skds", "diesel"],
}


def fetch_levels() -> list[dict]:
    req = urllib.request.Request(API_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        rows = json.load(resp)
    levels = [r for r in rows if r.get("series_type") == "level"]
    if not levels:
        raise RuntimeError("no 'level' series rows in fuelprice response")
    return sorted(levels, key=lambda r: r["date"])


def main() -> int:
    try:
        levels = fetch_levels()
    except Exception as exc:  # network or schema failure: keep last good file
        print(f"FAIL: could not fetch fuel prices: {exc}", file=sys.stderr)
        return 1

    latest = levels[-1]
    price_date = latest["date"]
    print(f"latest level week: {price_date}")

    try:
        with open(FUEL_PATH) as f:
            fuel = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as exc:
        print(f"FAIL: cannot read {FUEL_PATH}: {exc}", file=sys.stderr)
        return 1

    for pump_key, fuel_key in PUMP_TARGET_KEYS.items():
        raw = None
        for candidate in PUMP_FALLBACKS[pump_key]:
            if latest.get(candidate) is not None:
                raw = latest[candidate]
                break
        if raw is None:
            print(f"FAIL: no pump-price field for {pump_key} in latest week",
                  file=sys.stderr)
            return 1
        fuel["fuel"][fuel_key] = round(float(raw), 3)

    market = {k: latest.get(k) for k in (
        "ron95", "ron97", "diesel",
        "ron95_skps", "diesel_budi", "diesel_skds",
        "ron95_budi95", "diesel_eastmsia",
    )}
    fuel["market_rm_per_l"] = market

    fuel["_meta"]["updated_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    fuel["_meta"]["price_date"] = price_date
    fuel["_meta"]["source"] = (
        "data.gov.my fuel price weekly API (id=fuelprice) — "
        "updated daily via scripts/update_fuel_prices.py"
    )
    fuel["fuel"]["note"] = (
        "Pump prices = what consumers pay: RON95 RM%.2f (SKPS-subsidized), "
        "diesel RM%.2f (BUDI); RON97 RM%.2f unsubsidized market. "
        "Raw market levels in market_rm_per_l. Price week: %s."
        % (fuel["fuel"]["ron95_rm_per_l"], fuel["fuel"]["diesel_rm_per_l"],
           fuel["fuel"]["ron97_rm_per_l"], price_date)
    )

    with open(FUEL_PATH, "w") as f:
        json.dump(fuel, f, indent=2)
        f.write("\n")

    print(f"pump prices: ron95 RM{fuel['fuel']['ron95_rm_per_l']:.2f}"
          f" | ron97 RM{fuel['fuel']['ron97_rm_per_l']:.2f}"
          f" | diesel RM{fuel['fuel']['diesel_rm_per_l']:.2f}")
    print(f"market:      ron95 RM{market['ron95']:.2f}"
          f" | ron97 RM{market['ron97']:.2f}"
          f" | diesel RM{market['diesel']:.2f}"
          f" (SKPS {market['ron95_skps']:.2f} / BUDI {market['diesel_budi']:.2f}"
          f" / SKDS {market['diesel_skds']:.2f})")
    print(f"updated {FUEL_PATH}")
    print("Done. Cron: 0 6 * * * cd %s && python3 scripts/update_fuel_prices.py" % ROOT)
    return 0


if __name__ == "__main__":
    sys.exit(main())
