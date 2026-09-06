#!/usr/bin/env python3
"""Compute annual road tax (LKM, Peninsular Malaysia, private individual) for every catalog vehicle.

Sources:
- EV: JPJ "Garis Panduan Kadar LKM Bagi Kenderaan Motor Elektrik (ZEVs)" (Lampiran B, eff 01.04.2026),
  per-variant published prices from paultan.org (Jan 2026), supplied as gemini-code-1786485078103.json
- Hybrid/PHEV/ICE: JPJ "Garis Panduan Pengiraan Kadar LKM Bajet 2009" — engine cc schedule,
  saloon (kod AB) vs non-saloon (kod AD), Peninsular Malaysia.

Usage: python3 compute_road_tax.py [--apply]
"""
import json
import os
import re
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent.parent / "data"
CATALOG_PATH = BASE / "catalog_vehicles.json"

# JPJ EV reference tables. These arrived as one-off exports in a Downloads
# folder that no longer exists, which used to crash this module on import — and
# because compute_insurance.py imports MISSING_CC from here, it took that script
# down too. Look for them under data/ now, and allow an override:
#   EV_TAX_PATH=/path/to/file.json python3 compute_road_tax.py --apply
EV_TAX_PATH = Path(os.environ.get("EV_TAX_PATH", BASE / "jpj_ev_road_tax.json"))
EV_BRACKETS_PATH = Path(os.environ.get("EV_BRACKETS_PATH", BASE / "jpj_ev_brackets.json"))


# ---------- EV road tax (paultan-published, JPJ 2026 kW structure) ----------
def _norm(s):
    s = (s or "").lower().strip()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


# brand+model aliases mapping catalog -> user file
EV_ALIASES = {
    ("mg", "4"): ("mg", "mg4 ev"),
    ("aion", "y plus"): ("gac", "aion y plus"),
    ("seres", "3"): ("seres", "seres 3 ev"),
    ("gwm", "ora good cat"): ("great wall motor", "ora good cat"),
    ("wuling", "bingo"): ("wuling", "bingo ev"),
    ("mg", "s5"): ("mg", "s5 ev"),
    ("mini", "electric"): ("mini", "cooper"),
    ("hyundai", "ioniq 5 n"): ("hyundai", "ioniq 5"),
    ("bmw", "ix1 l"): ("bmw", "ix1"),
    ("audi", "q8 e-tron sportback"): ("audi", "q8 e-tron"),
    ("audi", "sq8 e-tron"): ("audi", "q8 e-tron"),
    ("mercedes-benz", "amg eqe"): ("mercedes-benz", "eqe"),
    ("mercedes-benz", "amg eqs"): ("mercedes-benz", "eqs"),
    ("mercedes-benz", "maybach eqs suv"): ("mercedes-benz", "eqs suv"),
    ("bmw", "ix2"): ("bmw", "ix2"),
}

_EV_BY_MODEL: dict | None = None


def ev_by_model() -> dict:
    """Published per-variant EV road tax, keyed by (brand, model). Loaded on use.

    Importing this module must stay side-effect free: the catalog's road_tax_rm
    is already populated for all 184 rows, so callers that only want the ICE
    schedule or MISSING_CC should never be blocked by a missing EV export.
    """
    global _EV_BY_MODEL
    if _EV_BY_MODEL is None:
        if not EV_TAX_PATH.exists():
            raise SystemExit(
                f"EV road-tax reference not found at {EV_TAX_PATH}.\n"
                "Place the JPJ EV export there, or set EV_TAX_PATH=/path/to/file.json.\n"
                "The catalog already carries road_tax_rm for every vehicle; this file is\n"
                "only needed to recompute the EV side from source."
            )
        acc: dict = {}
        for r in json.loads(EV_TAX_PATH.read_text()):
            acc.setdefault((_norm(r["brand"]), _norm(r["model"])), []).append(r)
        _EV_BY_MODEL = acc
    return _EV_BY_MODEL


def parse_w(s):
    return int(str(s).replace(",", ""))


def parse_rm(s):
    return int(re.sub(r"[^0-9]", "", str(s)))


def ev_road_tax_from_brackets(watts):
    """JPJ 2026 EV schedule: base rate of the band whose max >= watts (inclusive upper bound)."""
    for b in json.loads(EV_BRACKETS_PATH.read_text()):
        if watts <= parse_w(b["electric_motor_maximum_power_w"]):
            return parse_rm(b["road_tax_fee"])
    return parse_rm(json.loads(EV_BRACKETS_PATH.read_text())[-1]["road_tax_fee"])


def find_ev_variant(brand, model, power_kw):
    """Return best-matching user-file entry for a catalog EV, or None."""
    key = (_norm(brand), _norm(model))
    table = ev_by_model()
    cands = table.get(key) or table.get(EV_ALIASES.get(key, ()))
    if not cands:
        return None
    if len(cands) == 1 or power_kw is None:
        return cands[0]
    return min(cands, key=lambda r: abs(r["power_kw"] - power_kw))


# ---------- ICE / hybrid / PHEV road tax (JPJ 2009 schedule) ----------
SALOON_SCHEDULE = [
    (0, 1000, 20, 0),
    (1001, 1200, 55, 0),
    (1201, 1400, 70, 0),
    (1401, 1600, 90, 0),
    (1601, 1800, 200, (0.40, 1600)),
    (1801, 2000, 280, (0.50, 1800)),
    (2001, 2500, 380, (1.00, 2000)),
    (2501, 3000, 880, (2.50, 2500)),
    (3001, None, 2130, (4.50, 3000)),
]

NON_SALOON_SCHEDULE = [
    (0, 1000, 20, 0),
    (1001, 1200, 85, 0),
    (1201, 1400, 100, 0),
    (1401, 1600, 120, 0),
    (1601, 1800, 300, (0.30, 1600)),
    (1801, 2000, 360, (0.40, 1800)),
    (2001, 2500, 440, (0.80, 2000)),
    (2501, 3000, 840, (1.60, 2500)),
    (3001, None, 1640, (1.60, 3000)),
]


def ice_road_tax(cc, non_saloon=False):
    sched = NON_SALOON_SCHEDULE if non_saloon else SALOON_SCHEDULE
    for lo, hi, base, prog in sched:
        if hi is not None and cc > hi:
            continue
        if cc < lo:
            continue
        if not prog:
            return base
        rate, floor = prog
        return base + int(rate * (cc - floor))
    # above top band
    rate, floor = sched[-1][3]
    return sched[-1][2] + int(rate * (cc - floor))


NON_SALOON_BODY = {"SUV", "MPV", "Pickup"}
BODY_FALLBACK = {
    "toyota-corolla-cross-hybrid": "SUV",
    "toyota-camry-hybrid": "Sedan",
    "honda-hrv-ehev": "SUV",
    "honda-civic-ehev": "Sedan",
    "toyota-corolla-hybrid": "Sedan",
    "honda-accord-ehev": "Sedan",
    "cherry-tiggo8-pro-phev": "SUV",
}

# official engine cc for catalog entries missing it (from GAC Motor MY, Proton, Foton, Mitsubishi)
MISSING_CC = {
    "proton-emas-7-phev": 1498,
    "foton-tunland": 1968,
    "gac-m8": 1991,
    "mitsubishi-outlander-phev": 2360,
}

# certified motor power (kW) overrides where catalog power_hp rounds across a JPJ band edge
POWER_KW_OVERRIDES = {
    "bmw-i4-m50": 400,  # 537 hp / 400.0 kW certified -> stays in 390001-400000 band (RM1,015)
}


def main():
    apply = "--apply" in sys.argv
    data = json.loads(CATALOG_PATH.read_text())
    vehicles = data["vehicles"]
    results = []
    for v in vehicles:
        specs = v.get("specs", {})
        vtype = v.get("type")
        if vtype == "ev":
            kw = POWER_KW_OVERRIDES.get(v["id"])
            if kw is None:
                kw = specs.get("motor_kw")
            if kw is None:
                hp = specs.get("power_hp") or specs.get("motor_hp")
                kw = hp * 0.746 if hp else None
            entry = find_ev_variant(v["brand"], v["model"], kw)
            if entry:
                tax = parse_rm(entry["road_tax"])
                note = "EV road tax (JPJ kW schedule, 2026)"
                src_kw = entry["power_kw"]
            else:
                tax = ev_road_tax_from_brackets(int(kw * 1000))
                note = "EV road tax (JPJ kW schedule, 2026)"
                src_kw = round(kw, 1)
            results.append((v["id"], "ev", tax, f"power {src_kw} kW", note))
        elif vtype in ("hybrid", "phev"):
            cc = specs.get("engine_cc") or MISSING_CC.get(v["id"])
            body = v.get("body") or BODY_FALLBACK.get(v["id"], "Sedan")
            non_saloon = body in NON_SALOON_BODY
            tax = ice_road_tax(cc, non_saloon)
            results.append(
                (v["id"], vtype, tax, f"{cc}cc {'non-saloon' if non_saloon else 'saloon'}", f"{vtype} road tax by engine cc (JPJ)")
            )
        else:
            results.append((v["id"], vtype, None, "", ""))

    if not apply:
        print(f"{'id':38s} {'type':6s} {'tax':>6s}  basis")
        for rid, t, tax, basis, _ in results:
            print(f"{rid:38s} {t:6s} {('RM'+str(tax)) if tax is not None else '-':>6s}  {basis}")
        print()
        print(f"total: {len(results)}  (run with --apply to write into catalog)")
        return

    by_id = {r[0]: r for r in results}
    for v in vehicles:
        rid = v["id"]
        _, _, tax, basis, note = by_id[rid]
        ownership = v.setdefault("ownership", {})
        if tax is not None:
            ownership["road_tax_rm"] = tax
            ownership["road_tax_note"] = note + f" ({basis})"
        else:
            ownership.pop("road_tax_rm", None)
    CATALOG_PATH.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n")
    print(f"updated {len(vehicles)} vehicles -> {CATALOG_PATH}")


if __name__ == "__main__":
    main()
