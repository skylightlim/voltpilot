#!/usr/bin/env python3
"""Daily update of vehicle registration stats + catalog popularity ratings.

Sources:
  1. Per-model registrations (primary): paultan.org car-sales-data CSVs
     https://paultan.org/car-sales-data/api.php
     Paultan aggregates the official JPJ per-transaction dataset
     (registration_transactions_car, data.gov.my). Verified identical to
     the raw JPJ transaction files: all-time EV total 122,286 matches the
     official national figure exactly.
     Endpoint: ?action=rankings&group=model&format=csv
               &from=YYYY-MM&to=YYYY-MM&fuel=EV|Hybrid
     CSV columns: rank,make,model,units,share_pct
     - fuel=EV -> pure electric
     - fuel=Hybrid -> hybrid_petrol + hybrid_diesel (incl. PHEV)
     - share_pct = share of that fuel class within the queried period.
  2. Official national totals: data.gov.my API (JPJ/MOT)
     GET https://api.data.gov.my/data-catalogue?id=registrations_type_fuel
     Monthly registrations by vehicle type (car) and fuel type.
     NOTE: PHEV is merged into 'hybrid' (no separate PHEV field).

  All-time + per-month rankings are stored in
  data/paultan_registrations_by_model.json (schema:
  rank,make,model,units,share_pct per fuel per month, plus all_time).
  Monthly history is retained for the latest 36 months only.
  Raw historical monthly CSVs are mirrored as:
  data/paultan_ev_all_time.csv, data/paultan_hybrid_all_time.csv,
  data/paultan_ev_monthly.csv, data/paultan_hybrid_monthly.csv.

Popularity bands (1-10). 1 = fewer than 100 units on road, then
doubling bands:
   1: <100       2: 100-499    3: 500-999     4: 1,000-1,999
   5: 2,000-3,999  6: 4,000-7,999  7: 8,000-15,999  8: 16,000-31,999
   9: 32,000-63,999  10: >=64,000

Run daily, e.g. cron:
    0 7 * * * cd /path/to/ai-transport-platform && python3 scripts/update_vehicle_registrations.py
"""

from pathlib import Path
import csv
import json
import os
import sys
import time
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone

import sys as _sys
_sys.path.insert(0, str(Path(__file__).resolve().parent / "used_market"))
from http_client import get_json, get_text  # noqa: E402

ROOT = str(Path(__file__).resolve().parents[1])
CATALOG_PATH = f"{ROOT}/data/catalog_vehicles.json"
STATS_PATH = f"{ROOT}/data/datagovmy_vehicle_stats.json"
PAULTAN_JSON_PATH = f"{ROOT}/data/paultan_registrations_by_model.json"
REPORT_JSON_PATH = f"{ROOT}/data/report_registrations_by_model.json"
REPORT_CSV_PATH = f"{ROOT}/data/report_registrations_by_model.csv"
EV_ALLTIME_CSV = f"{ROOT}/data/paultan_ev_all_time.csv"
HYBRID_ALLTIME_CSV = f"{ROOT}/data/paultan_hybrid_all_time.csv"
EV_MONTHLY_CSV = f"{ROOT}/data/paultan_ev_monthly.csv"
HYBRID_MONTHLY_CSV = f"{ROOT}/data/paultan_hybrid_monthly.csv"

PAULTAN_API = "https://paultan.org/car-sales-data/api.php"
API_URL = "https://api.data.gov.my/data-catalogue?id=registrations_type_fuel&limit=20000"

ALLOWED_TYPES = {"ev", "hybrid", "phev"}

POPULARITY_BANDS = [
    (0, 99, 1),
    (100, 499, 2),
    (500, 999, 3),
    (1_000, 1_999, 4),
    (2_000, 3_999, 5),
    (4_000, 7_999, 6),
    (8_000, 15_999, 7),
    (16_000, 31_999, 8),
    (32_000, 63_999, 9),
    (64_000, None, 10),
]

FIRST_MONTH = "2000-01"

# catalog vehicle id -> paultan (fuel, make, model) keys to sum.
# fuel is "EV" or "Hybrid" exactly as the paultan API spells them.
# A catalog id absent from this map means the model has no records in the
# paultan/JPJ data (2000..current) -> registered 0.
PAULTAN_ALIASES = {
    # ---- EV ----
    "proton-emas-5": [("EV", "Proton", "e.MAS 5")],
    "byd-atto-3": [("EV", "BYD", "Atto 3")],
    "byd-seal": [("EV", "BYD", "Seal")],
    "tesla-model-3": [("EV", "Tesla", "Model 3")],
    "tesla-model-y": [("EV", "Tesla", "Model Y")],
    "xpeng-g6": [("EV", "Xpeng", "G6")],
    "volvo-ex30": [("EV", "Volvo", "EX30")],
    "mg4": [("EV", "MG", "MG4")],
    "gac-aion-y-plus": [("EV", "GAC Aion", "Y Plus Premium"), ("EV", "GAC Aion", "Y Plus Standard")],
    "ora-good-cat": [("EV", "Great Wall", "Ora")],
    "chery-omoda-e5": [("EV", "Chery", "Omoda 5")],
    "smart-3": [("EV", "Smart", "Brabus")],
    "wuling-bingo": [("EV", "TQ Wuling", "Bingo")],
    "perodua-qv-e": [("EV", "Perodua", "QV-E")],
    "seres-3": [("EV", "Seres", "3")],
    "byd-atto-2": [("EV", "BYD", "Atto 2")],
    "byd-seal-6": [("EV", "BYD", "Seal 6")],
    "dongfeng-box": [("EV", "Dong Feng", "Box E3"), ("EV", "Dong Feng", "Box E2")],
    "proton-emas-7": [("EV", "Proton", "e.MAS 7")],
    "aion-es": [("EV", "GAC", "Aion ES")],
    "leapmotor-b10": [("EV", "Leapmotor", "B10")],
    "dongfeng-vigo": [("EV", "Dong Feng", "Vigo")],
    "byd-m6": [("EV", "BYD", "M6")],
    "mg-s5": [("EV", "MG", "S5")],
    "icaur-03": [("EV", "iCaur", "iCaur 03")],
    "neta-x": [("EV", "Neta", "X")],
    "leapmotor-c10": [("EV", "Leapmotor", "C10")],
    "icaur-v23": [("EV", "iCaur", "iCaur V23")],
    "honda-e:n1": [("EV", "Honda", "e:N1")],
    "zeekr-x": [("EV", "Zeekr", "X")],
    "byd-sealion-7": [("EV", "BYD", "Sealion")],
    "renault-zoe": [("EV", "Renault", "Zoe")],
    "nissan-leaf": [("EV", "Nissan", "Leaf")],
    "smart-1": [("EV", "Smart", "Brabus")],  # paultan records smart #1/#3 as "Smart Brabus"
    "dongfeng-007": [("EV", "Dong Feng", "007")],
    "zeekr-7x": [("EV", "Zeekr", "7X")],
    "mini-electric": [("EV", "Mini", "Cooper")],
    "toyota-urban-cruiser": [("EV", "Toyota", "Urban Cruiser")],
    "jac-t9-ev": [("EV", "JAC", "T9")],
    "mini-aceman": [("EV", "Mini", "Aceman")],
    "toyota-bz4x": [("EV", "Toyota", "bZ4X")],
    "toyota-hilux": [("EV", "Toyota", "Hilux")],
    "maxus-eterron-9": [("EV", "Maxus", "eTerron 9")],
    "volvo-ec40": [("EV", "Volvo", "C40"), ("EV", "Volvo", "EC40")],  # EC40 = renamed C40
    "bmw-ix1": [("EV", "BMW", "iX1")],
    "bmw-ix1-l": [("EV", "BMW", "iX1")],
    "mini-countryman": [("EV", "Mini", "Countryman")],
    "maxus-mifa-9": [("EV", "Weststar Maxus", "MIFA 9")],
    "xpeng-x9": [("EV", "Xpeng", "X9")],
    "bmw-ix2": [("EV", "BMW", "iX2")],
    "bmw-i4": [("EV", "BMW", "i4")],
    "mercedes-benz-eqa": [("EV", "Mercedes Benz", "EQA")],
    "denza-d9": [("EV", "Denza", "D9")],
    "zeekr-009": [("EV", "Zeekr", "009")],
    "mg-cyberster": [("EV", "MG", "Cyberster")],
    "volvo-es90": [("EV", "Volvo", "ES90")],
    "kia-ev9": [("EV", "Kia", "EV9")],
    "denza-z9-gt": [("EV", "Denza", "Z9GT")],
    "bmw-i5": [("EV", "BMW", "i5")],
    "bmw-ix3": [("EV", "BMW", "iX3")],
    "mercedes-benz-eqe": [("EV", "Mercedes Benz", "EQE")],
    "mercedes-benz-eqe-suv": [("EV", "Mercedes Benz", "EQE")],
    "bmw-ix": [("EV", "BMW", "iX")],
    "lexus-rz": [("EV", "Lexus", "RZ")],
    "bmw-i4-m50": [("EV", "BMW", "i4")],
    "volvo-ex90": [("EV", "Volvo", "EX90")],
    "hyundai-ioniq-5-n": [("EV", "Hyundai", "Ioniq 5")],
    "hyundai-ioniq-6-n": [("EV", "Hyundai", "Ioniq 6")],
    "mercedes-benz-eqv": [("EV", "Mercedes Benz", "EQV")],
    "lotus-emeya": [("EV", "Lotus", "Emeya")],
    "audi-q8-e-tron": [("EV", "Audi", "Q8")],
    "audi-q8-e-tron-sportback": [("EV", "Audi", "Q8")],
    "lotus-eletre": [("EV", "Lotus", "Eletre")],
    "porsche-macan-electric": [("EV", "Porsche", "Macan")],
    "mercedes-benz-eqs-suv": [("EV", "Mercedes Benz", "EQS")],
    "mercedes-benz-eqs": [("EV", "Mercedes Benz", "EQS")],
    "mercedes-benz-amg-eqe": [("EV", "Mercedes Benz", "EQE")],
    "bmw-i7": [("EV", "BMW", "i7")],
    "mercedes-benz-amg-eqs": [("EV", "Mercedes Benz", "EQS")],
    "mercedes-benz-g-class": [("EV", "Mercedes Benz", "G-Class")],
    "mercedes-benz-maybach-eqs-suv": [("EV", "Mercedes-Maybach", "EQS 680")],
    "byd-dolphin": [("EV", "BYD", "Dolphin")],
    "hyundai-ioniq-5": [("EV", "Hyundai", "Ioniq 5")],
    "kia-ev6": [("EV", "Kia", "EV6")],
    "jaguar-i-pace": [("EV", "Jaguar", "I-Pace")],
    "rolls-royce-spectre": [("EV", "Rolls Royce", "Spectre")],
    "higer-h5c-ace-e1": [("EV", "Higer", "H5C")],
    "higer-h7v": [("EV", "Higer", "H7V")],
    "ford-mustang-mach-e": [("EV", "Ford", "Mustang"), ("EV", "Ford", "Mach-E")],
    "porsche-taycan": [("EV", "Porsche", "Taycan")],
    "mercedes-benz-eqb": [("EV", "Mercedes Benz", "EQB")],
    "mercedes-benz-eqc": [("EV", "Mercedes Benz", "EQC")],
    "hyundai-kona-electric": [("EV", "Hyundai", "Kona")],
    "hyundai-kona-electric-emax": [("EV", "Hyundai", "Kona")],
    "mg-zs-ev": [("EV", "MG", "ZS"), ("EV", "MG", "ZS EV")],
    "audi-rs-e-tron-gt": [("EV", "Audi", "RS e-tron GT")],
    "audi-sq8-e-tron": [("EV", "Audi", "SQ8")],
    "mazda-mx-30": [("EV", "Mazda", "MX-30")],
    "bmw-i3s": [("EV", "BMW", "i3")],
    "kia-niro-ev": [("EV", "Kia", "Niro")],
    # ---- hybrid / phev ----
    "toyota-corolla-cross-hybrid": [("Hybrid", "Toyota", "Corolla Cross")],
    "toyota-camry-hybrid": [("Hybrid", "Toyota", "Camry")],
    "honda-hrv-ehev": [("Hybrid", "Honda", "HR-V")],
    "honda-civic-ehev": [("Hybrid", "Honda", "Civic")],
    "chery-tiggo-cross": [("Hybrid", "Chery", "Tiggo")],
    "toyota-vios": [("Hybrid", "Toyota", "Vios")],
    "proton-emas-7-phev": [("Hybrid", "Proton", "e.MAS 7 PHEV")],
    "toyota-yaris-cross": [("Hybrid", "Toyota", "Yaris Cross")],
    "honda-city": [("Hybrid", "Honda", "City")],
    "honda-city-hatchback": [("Hybrid", "Honda", "City")],
    "nissan-kicks-e-power": [("Hybrid", "Nissan", "Kicks")],
    "chery-tiggo-7": [("Hybrid", "Chery", "Tiggo")],
    "great-wall-haval-h6": [("Hybrid", "Great Wall", "Haval H6")],
    "nissan-serena-e-power": [("Hybrid", "Nissan", "Serena")],
    "chery-tiggo-8": [("Hybrid", "Chery", "Tiggo")],
    "honda-cr-v": [("Hybrid", "Honda", "CR-V")],
    "volkswagen-golf": [("Hybrid", "Volkswagen", "Golf")],
    "volkswagen-tayron": [("Hybrid", "Volkswagen", "Tayron")],
    "hyundai-tucson": [("Hybrid", "Hyundai", "Tucson")],
    "toyota-innova-zenix": [("Hybrid", "Toyota", "Innova Zenix")],
    "hyundai-santa-fe": [("Hybrid", "Hyundai", "Santa Fe")],
    "lexus-lbx": [("Hybrid", "Lexus", "LBX")],
    "mazda-cx-60": [("Hybrid", "Mazda", "CX-60")],
    "great-wall-tank-300": [("Hybrid", "Great Wall", "Tank 300")],
    "mercedes-benz-a-class-sedan": [("Hybrid", "Mercedes Benz", "A-Class")],
    "volvo-xc40": [("Hybrid", "Volvo", "XC40")],
    "great-wall-wey-g9": [("Hybrid", "Great Wall", "Wey G9")],
    "honda-prelude": [("Hybrid", "Honda", "Prelude")],
    "toyota-harrier": [("Hybrid", "Toyota", "Harrier")],
    "mercedes-benz-c-class": [("Hybrid", "Mercedes Benz", "C-Class")],
    "bmw-x3": [("Hybrid", "BMW", "X3")],
    "gac-m8": [("Hybrid", "GAC", "M8")],
    "great-wall-tank-500": [("Hybrid", "Great Wall", "Tank 500")],
    "volvo-xc60": [("Hybrid", "Volvo", "XC60")],
    "mercedes-benz-glc": [("Hybrid", "Mercedes Benz", "GLC")],
    "bmw-5-series": [("Hybrid", "BMW", "5 Series")],
    "bmw-7-series": [("Hybrid", "BMW", "7 Series")],
    "mercedes-benz-amg-a-class-sedan": [("Hybrid", "Mercedes Benz", "A-Class")],
    "mercedes-benz-amg-gla": [("Hybrid", "Mercedes Benz", "GLA")],
    "mercedes-benz-e-class": [("Hybrid", "Mercedes Benz", "E-Class")],
    "lexus-nx": [("Hybrid", "Lexus", "NX")],
    "mercedes-benz-amg-glb": [("Hybrid", "Mercedes Benz", "GLB")],
    "volvo-xc90": [("Hybrid", "Volvo", "XC90")],
    "mercedes-benz-glc-coupe": [("Hybrid", "Mercedes Benz", "GLC")],
    "mercedes-benz-amg-c-class": [("Hybrid", "Mercedes Benz", "C-Class")],
    "denza-b8": [("Hybrid", "Denza", "B8")],
    "audi-q7": [("Hybrid", "Audi", "Q7")],
    "bmw-x5": [("Hybrid", "BMW", "X5")],
    "lexus-rx": [("Hybrid", "Lexus", "RX")],
    "mercedes-benz-gle": [("Hybrid", "Mercedes Benz", "GLE")],
    "mercedes-benz-amg-glc-coupe": [("Hybrid", "Mercedes Benz", "GLC")],
    "mercedes-benz-cle": [("Hybrid", "Mercedes Benz", "CLE")],
    "toyota-vellfire": [("Hybrid", "Toyota", "Vellfire")],
    "bmw-x7": [("Hybrid", "BMW", "X7")],
    "mercedes-benz-amg-cle": [("Hybrid", "Mercedes Benz", "CLE")],
    "mercedes-benz-s-class": [("Hybrid", "Mercedes Benz", "S-Class")],
    "porsche-cayenne-coupe": [("Hybrid", "Porsche", "Cayenne")],
    "mercedes-benz-amg-gle-coupe": [("Hybrid", "Mercedes Benz", "GLE")],
    "mercedes-benz-amg-gle": [("Hybrid", "Mercedes Benz", "GLE")],
    "lexus-lm": [("Hybrid", "Lexus", "LM")],
    "lexus-lx": [("Hybrid", "Lexus", "LX")],
    "mercedes-benz-maybach-s-class": [("Hybrid", "Mercedes-Maybach", "S-Class")],
    "mercedes-benz-maybach-gls": [("Hybrid", "Mercedes-Maybach", "GLS")],
    "mercedes-benz-amg-g-class": [("Hybrid", "Mercedes Benz", "G-Class")],
    "mercedes-benz-amg-s-class": [("Hybrid", "Mercedes Benz", "S-Class")],
    "jaecoo-j5": [("Hybrid", "Omoda Jaecoo", "Jaecoo J5")],
    "jaecoo-j7": [("Hybrid", "Omoda Jaecoo", "Jaecoo J7")],
    "jaecoo-j8": [("Hybrid", "Omoda Jaecoo", "Jaecoo J8")],
    "omoda-c9": [("Hybrid", "Omoda Jaecoo", "Omoda 9")],
    "jaecoo-j7-phev": [("Hybrid", "Omoda Jaecoo", "Jaecoo J7")],
    "omoda-c9-phev": [("Hybrid", "Omoda Jaecoo", "Omoda 9")],
    "toyota-corolla-hybrid": [("Hybrid", "Toyota", "Corolla"), ("Hybrid", "Toyota", "Corolla Altis")],
    "cherry-tiggo8-pro-phev": [("Hybrid", "Chery", "Tiggo")],
    "mitsubishi-outlander-phev": [("Hybrid", "Mitsubishi", "Outlander")],
    # ids absent from this map (no paultan/JPJ records at all, verified 2000..2026):
    # smart-5, suzuki-evitara, foton-tunland, suzuki-fronx, mazda-cx-80,
    # audi-a5-sportback, bmw-x6, mercedes-benz-amg-sl, bmw-m5,
    # honda-accord-ehev -> registered_my = 0, basis paultan_no_records
}

# catalog ids whose paultan keys are shared with another catalog entry
# (paultan/JPJ records the family once; each catalog entry reports the
# family total, see registered_note)
PAULTAN_SHARED_FAMILIES = {
    "smart-1": "Smart Brabus (also covers smart #3)",
    "smart-3": "Smart Brabus (also covers smart #1)",
    "bmw-ix1-l": "BMW iX1 (same family as BMW iX1)",
    "bmw-i4-m50": "BMW i4 (same family as BMW i4)",
    "hyundai-ioniq-5-n": "Hyundai Ioniq 5 (same family as Ioniq 5)",
    "hyundai-ioniq-6-n": "Hyundai Ioniq 6 (same family as Ioniq 6)",
    "mercedes-benz-eqe-suv": "Mercedes Benz EQE (same family as EQE/AMG EQE)",
    "mercedes-benz-amg-eqe": "Mercedes Benz EQE (same family as EQE/EQE SUV)",
    "mercedes-benz-eqs-suv": "Mercedes Benz EQS (same family as EQS/AMG EQS)",
    "mercedes-benz-amg-eqs": "Mercedes Benz EQS (same family as EQS/EQS SUV)",
    "audi-q8-e-tron-sportback": "Audi Q8 (same family as Q8 e-tron)",
    "hyundai-kona-electric-emax": "Hyundai Kona (same family as Kona Electric)",
    "honda-city-hatchback": "Honda City (same family as City)",
    "chery-tiggo-7": "Chery Tiggo (family shared with Tiggo Cross / Tiggo 8 / Tiggo 8 Pro PHEV)",
    "chery-tiggo-8": "Chery Tiggo (family shared with Tiggo Cross / Tiggo 7 / Tiggo 8 Pro PHEV)",
    "cherry-tiggo8-pro-phev": "Chery Tiggo (family shared with Tiggo Cross / Tiggo 7 / Tiggo 8)",
    "mercedes-benz-glc-coupe": "Mercedes Benz GLC (same family as GLC/AMG GLC Coupe)",
    "mercedes-benz-amg-glc-coupe": "Mercedes Benz GLC (same family as GLC/GLC Coupe)",
    "mercedes-benz-amg-c-class": "Mercedes Benz C-Class (same family as C-Class)",
    "mercedes-benz-amg-gle": "Mercedes Benz GLE (same family as GLE/AMG GLE Coupe)",
    "mercedes-benz-amg-gle-coupe": "Mercedes Benz GLE (same family as GLE/AMG GLE)",
    "mercedes-benz-amg-s-class": "Mercedes Benz S-Class (same family as S-Class)",
    "mercedes-benz-amg-a-class-sedan": "Mercedes Benz A-Class (same family as A-Class Sedan)",
    "mercedes-benz-amg-cle": "Mercedes Benz CLE (same family as CLE)",
    "mercedes-benz-amg-g-class": "Mercedes Benz G-Class hybrid (same family as G-Class)",
    "jaecoo-j7-phev": "Omoda Jaecoo Jaecoo J7 (same family as Jaecoo J7)",
    "omoda-c9-phev": "Omoda Jaecoo Omoda 9 (same family as Omoda C9)",
}


def months_between(start: str, end: str) -> list:
    y1, m1 = map(int, start.split("-"))
    y2, m2 = map(int, end.split("-"))
    out = []
    y, m = y1, m1
    while (y, m) <= (y2, m2):
        out.append(f"{y:04d}-{m:02d}")
        m += 1
        if m == 13:
            m, y = 1, y + 1
    return out


def current_month() -> str:
    now = datetime.now(timezone.utc)
    return f"{now.year:04d}-{now.month:02d}"


def fetch_paultan_csv(fuel: str, mnth_from: str, mnth_to: str) -> list:
    url = (f"{PAULTAN_API}?action=rankings&group=model&format=csv"
           f"&from={mnth_from}&to={mnth_to}&fuel={fuel}")
    text = get_text(url, headers={"User-Agent": "Mozilla/5.0 (data research)"}, timeout=60)
    rows = list(csv.DictReader(text.splitlines()))
    for row in rows:
        row["units"] = int(row["units"])
        row["rank"] = int(row["rank"])
        row["share_pct"] = float(row["share_pct"])
    return rows


def load_paultan_dataset() -> dict:
    if os.path.exists(PAULTAN_JSON_PATH):
        with open(PAULTAN_JSON_PATH) as f:
            return json.load(f)
    return {"meta": {}, "all_time": {}, "all_time_totals": {}, "monthly": {}}


def save_paultan_dataset(ds: dict) -> None:
    ds["meta"]["retrieved_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with open(PAULTAN_JSON_PATH, "w") as f:
        json.dump(ds, f, indent=1)
        f.write("\n")


def refresh_paultan_dataset() -> dict:
    """Refresh all-time rankings and the current month; backfill missing months
    within the rolling 36-month window (monthly history is kept for 3 years)."""
    ds = load_paultan_dataset()
    now = current_month()
    print(f"  fetching all-time EV + Hybrid from paultan ...")
    ds["all_time"] = {"EV": fetch_paultan_csv("EV", FIRST_MONTH, now),
                      "Hybrid": fetch_paultan_csv("Hybrid", FIRST_MONTH, now)}
    ds["all_time_totals"] = {f: sum(r["units"] for r in rows)
                             for f, rows in ds["all_time"].items()}

    # prune monthly history to the last 36 months, then backfill any gaps
    have_months = sorted(ds.get("monthly", {}))
    keep_from = have_months[-36] if len(have_months) > 36 else (have_months[0] if have_months else FIRST_MONTH)
    ds["monthly"] = {m: ds["monthly"][m] for m in have_months if m >= keep_from}
    expected = months_between(keep_from, now)
    have = set(ds.get("monthly", {}))
    missing = [m for m in expected if m not in have]
    if missing:
        print(f"  backfilling {len(missing)} missing month(s) ...")
        for i, mnth in enumerate(missing):
            for fuel in ("EV", "Hybrid"):
                try:
                    ds.setdefault("monthly", {}).setdefault(mnth, {})[fuel] = \
                        fetch_paultan_csv(fuel, mnth, mnth)
                except Exception as e:
                    print(f"    FAIL {mnth} {fuel}: {e}")
            time.sleep(0.15)
    # always refresh the current month
    for fuel in ("EV", "Hybrid"):
        ds.setdefault("monthly", {}).setdefault(now, {})[fuel] = fetch_paultan_csv(fuel, now, now)
    # drop months with no data yet (e.g. the still-open current month)
    ds["monthly"] = {m: fuels for m, fuels in ds["monthly"].items()
                     if fuels.get("EV") or fuels.get("Hybrid")}

    months = sorted(ds["monthly"])
    ds["meta"] = {
        "title": "Malaysia car registrations by model — paultan.org car-sales-data "
                 "(source: JPJ via data.gov.my registration_transactions_car)",
        "source": "https://paultan.org/car-sales-data/",
        "api": f"{PAULTAN_API}?action=rankings&group=model&format=csv&fuel=EV|Hybrid",
        "period": f"{months[0]}..{months[-1]}" if months else "",
        "months_total": len(months),
        "monthly_window_months": 36,
        "monthly_window_note": "Monthly history is retained for the latest 36 months only; all-time rankings cover 2000-01..current.",
        "fields": ["rank", "make", "model", "units", "share_pct"],
        "note": ("Paultan aggregates the official JPJ per-transaction dataset "
                 "(registration_transactions_car). EV = fuel electric; Hybrid = "
                 "hybrid_petrol + hybrid_diesel (incl PHEV). share_pct is the share "
                 "of that fuel class within the queried period."),
    }
    save_paultan_dataset(ds)
    return ds


def write_paultan_csvs(ds: dict) -> None:
    def dump(path, rows):
        with open(path, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=["rank", "make", "model", "units", "share_pct"])
            w.writeheader()
            w.writerows(rows)

    dump(EV_ALLTIME_CSV, ds["all_time"]["EV"])
    dump(HYBRID_ALLTIME_CSV, ds["all_time"]["Hybrid"])

    months = sorted(ds["monthly"])  # already pruned to the last 36 months

    def dump_monthly(path, fuel):
        with open(path, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=["month", "rank", "make", "model", "units", "share_pct"])
            w.writeheader()
            for mnth in months:
                for r in ds["monthly"][mnth].get(fuel, []):
                    w.writerow({"month": mnth, **r})

    dump_monthly(EV_MONTHLY_CSV, "EV")
    dump_monthly(HYBRID_MONTHLY_CSV, "Hybrid")
    print(f"  wrote {EV_ALLTIME_CSV}, {HYBRID_ALLTIME_CSV}, {EV_MONTHLY_CSV}, {HYBRID_MONTHLY_CSV}")


def fetch_official_stats() -> dict:
    rows = get_json(API_URL, headers={"User-Agent": "ai-transport-platform/1.0"}, timeout=60)
    ev = hybrid = all_cars = 0
    latest = "0000-00-00"
    for r in rows:
        if r.get("type") != "car":
            continue
        fuel = r.get("fuel")
        if fuel == "electric":
            ev += r["registrations"]
        elif fuel == "hybrid":
            hybrid += r["registrations"]
        elif fuel == "all_fuels":
            all_cars += r["registrations"]
        latest = max(latest, r.get("date", "0000-00-00"))
    latest_month_rows = {r["fuel"]: r["registrations"] for r in rows
                         if r.get("type") == "car" and r.get("date") == latest}
    return {
        "source": API_URL,
        "dataset": "registrations_type_fuel",
        "frequency": "MONTHLY",
        "data_as_of": latest,
        "retrieved_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "note": "PHEV is merged into the hybrid total (JPJ does not publish a separate PHEV field).",
        "national_registered": {
            "ev_cars": ev,
            "hybrid_cars": hybrid,
            "all_cars": all_cars,
        },
        "latest_month": latest,
        "latest_month_registrations": {
            "ev_cars": latest_month_rows.get("electric", 0),
            "hybrid_cars": latest_month_rows.get("hybrid", 0),
            "all_cars": latest_month_rows.get("all_fuels", 0),
        },
    }


def score_popularity(num_units: int) -> int:
    for lo, hi, rating in POPULARITY_BANDS:
        if num_units >= lo and (hi is None or num_units <= hi):
            return rating
    return 1


def paultan_units_for(vehicle: dict, rows_by_fuel: dict) -> int:
    keys = PAULTAN_ALIASES.get(vehicle["id"])
    if not keys:
        return 0
    total = 0
    for fuel, make, model in keys:
        for r in rows_by_fuel.get(fuel, []):
            if r["make"] == make and r["model"] == model:
                total += r["units"]
    return total


def paultan_keys_used(vehicle: dict) -> list:
    keys = PAULTAN_ALIASES.get(vehicle["id"])
    if not keys:
        return []
    return [f"{fuel}|{make}|{model}" for fuel, make, model in keys]


def build_model_report(vehicles: list, stats: dict, ds: dict) -> dict:
    rows_by_fuel = ds["all_time"]
    totals = stats["national_registered"]
    class_totals = {"ev": totals["ev_cars"], "hybrid": totals["hybrid_cars"]}
    paultan_totals = ds["all_time_totals"]

    covered = {"ev": set(), "hybrid": set()}
    catalog_class_units = {"ev": 0, "hybrid": 0}
    models = []
    for v in vehicles:
        cls = "ev" if v["type"] == "ev" else "hybrid"
        u = v["registered_my"]
        for key in paultan_keys_used(v):
            if key not in covered[cls]:
                covered[cls].add(key)
                fuel, make, model = key.split("|")
                for r in rows_by_fuel[fuel]:
                    if r["make"] == make and r["model"] == model:
                        catalog_class_units[cls] += r["units"]
        share = round(u / class_totals[cls] * 100, 2) if class_totals[cls] else 0.0
        rank = 0
        for r in rows_by_fuel["EV" if cls == "ev" else "Hybrid"]:
            if r["units"] <= u:
                rank = r["rank"]
                break
        models.append({
            "id": v["id"],
            "brand": v["brand"],
            "model": v["model"],
            "variant": v.get("variant"),
            "type": v["type"],
            "fuel_class": cls,
            "paultan_keys": paultan_keys_used(v),
            "units": u,
            "rank": rank,
            "share_pct": share,
            "registered_basis": v.get("registered_basis"),
            "registered_note": PAULTAN_SHARED_FAMILIES.get(v["id"]),
            "popularity_rating": v["popularity_rating"],
        })

    report = {
        "meta": {
            "title": "Registered vehicles in Malaysia: per-model counts (paultan.org / official JPJ)",
            "sources": [
                "https://paultan.org/car-sales-data/ (per-model, all-time + monthly)",
                "https://api.data.gov.my/data-catalogue?id=registrations_type_fuel (national totals, official)",
                "https://data.gov.my/data-catalogue/registration_transactions_car (underlying JPJ data)",
            ],
            "data_as_of": ds["meta"].get("period"),
            "caveat": ("Per-model figures come from paultan.org car-sales-data, which "
                       "aggregates the official JPJ per-transaction dataset. 'rank' and "
                       "'share_pct' are within the vehicle's fuel class (EV or Hybrid incl "
                       "PHEV) for the all-time period. 'registered_basis' is "
                       "paultan_exact when a single catalog model maps to paultan rows, "
                       "paultan_family_shared when several catalog entries share one "
                       "paultan family row (each reports the family total; see "
                       "registered_note), and paultan_no_records when the model has no "
                       "records at all."),
        },
        "national_official": stats["national_registered"],
        "latest_month": stats["latest_month"],
        "latest_month_registrations": stats["latest_month_registrations"],
        "paultan_raw_totals": paultan_totals,
        "catalog_covered": catalog_class_units,
        "coverage_of_national": {
            k: f"{round(catalog_class_units[k] / class_totals[k] * 100, 1)}%"
            for k in class_totals
        },
        "models": models,
    }
    with open(REPORT_JSON_PATH, "w") as f:
        json.dump(report, f, indent=2)
        f.write("\n")
    with open(REPORT_CSV_PATH, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["id", "brand", "model", "variant", "type", "fuel_class",
                                          "units", "rank", "share_pct", "registered_basis",
                                          "popularity_rating", "paultan_keys", "registered_note"])
        w.writeheader()
        w.writerows(models)
    return report


def main() -> int:
    print("== 1. paultan.org per-model rankings (EV + Hybrid, all-time + monthly) ==")
    ds = refresh_paultan_dataset()
    print(f"  all-time totals: EV {ds['all_time_totals']['EV']:,}"
          f" | Hybrid (incl PHEV) {ds['all_time_totals']['Hybrid']:,}"
          f" | months {ds['meta']['months_total']}")
    write_paultan_csvs(ds)

    print("\n== 2. data.gov.my official national totals ==")
    stats = fetch_official_stats()
    with open(STATS_PATH, "w") as f:
        json.dump(stats, f, indent=2)
        f.write("\n")
    print(f"  as_of {stats['data_as_of']}: EV {stats['national_registered']['ev_cars']:,}"
          f" | hybrid (incl PHEV) {stats['national_registered']['hybrid_cars']:,}"
          f" | all cars {stats['national_registered']['all_cars']:,}")

    with open(CATALOG_PATH) as f:
        catalog = json.load(f)
    vehicles = catalog["vehicles"]

    print("\n== 3. crosscheck: catalog types ==")
    bad_types = [v["id"] for v in vehicles if v.get("type") not in ALLOWED_TYPES]
    if bad_types:
        print(f"  FAIL: non EV/hybrid/phev entries: {bad_types}")
        return 1
    print(f"  ok: {len(vehicles)} vehicles, all type in {sorted(ALLOWED_TYPES)}")

    print("\n== 4. per-model paultan counts -> catalog ==")
    rows_by_fuel = ds["all_time"]
    coverage = {"paultan_exact": 0, "paultan_family_shared": 0, "paultan_no_records": 0}
    for v in vehicles:
        u = paultan_units_for(v, rows_by_fuel)
        v["registered_my"] = u
        v["popularity_rating"] = score_popularity(u)
        if u > 0:
            basis = "paultan_family_shared" if v["id"] in PAULTAN_SHARED_FAMILIES else "paultan_exact"
        else:
            basis = "paultan_no_records"
        v["registered_basis"] = basis
        v["registered_as_of"] = ds["meta"].get("period", "").split("..")[-1] or current_month()
        coverage[basis] += 1
    print(f"  paultan_exact: {coverage['paultan_exact']}"
          f" | paultan_family_shared: {coverage['paultan_family_shared']}"
          f" | paultan_no_records: {coverage['paultan_no_records']}")

    ids = [v["id"] for v in vehicles]
    if len(ids) != len(set(ids)):
        print("  FAIL: duplicate vehicle ids")
        return 1
    for v in vehicles:
        if not isinstance(v.get("price_rm"), (int, float)):
            print(f"  FAIL: non-numeric price_rm on {v['id']}")
            return 1
        if not isinstance(v["popularity_rating"], int) or not 1 <= v["popularity_rating"] <= 10:
            print(f"  FAIL: bad popularity_rating on {v['id']}")
            return 1

    with open(CATALOG_PATH, "w") as f:
        json.dump(catalog, f, indent=2)
        f.write("\n")
    print(f"  updated {CATALOG_PATH}")

    report = build_model_report(vehicles, stats, ds)
    print(f"  wrote {REPORT_JSON_PATH} + {REPORT_CSV_PATH}")
    print(f"  coverage of national: {report['coverage_of_national']}")

    print("\n== 5. top registered (paultan/JPJ official) ==")
    top = sorted(vehicles, key=lambda v: -v["registered_my"])[:10]
    for v in top:
        print(f"  {v['registered_my']:>7,}  {v['id']} [{v['registered_basis']}]")

    print("\n== 6. popularity distribution ==")
    dist = defaultdict(int)
    for v in vehicles:
        dist[v["popularity_rating"]] += 1
    for r in sorted(dist):
        print(f"  rating {r}: {dist[r]} vehicles")

    print("\nDone. Cron: 0 7 * * * cd %s && python3 scripts/update_vehicle_registrations.py" % ROOT)
    return 0


if __name__ == "__main__":
    sys.exit(main())
