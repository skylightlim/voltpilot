"""Fit retained-value curves from matched used listings.

Writes data/depreciation_curve.json, consumed by the resale criterion in
backend/app/engines. See issue.md issues 4, 9 and 10.

Horizon is FIVE years, not ten. Malaysia's first mass-market EVs arrived around
2021, so no drivetrain in this catalogue has a listing older than age 5 and a
ten-year figure would be invented. The frontend already promises the right
thing: "5-year used market resale retention".

The title matcher produces false positives that a naive fit would swallow. The
catalogue's Toyota Hilux is the battery-electric one at RM226,300, but every
listing matched to it is a 2.4-litre diesel pickup at RM74k-89k, which reads as
a 35% one-year retention and drags the whole EV curve down. Any nameplate sold
as both ICE and EV is exposed, so cells are screened against the type median
before anything is fitted.
"""
from pathlib import Path
import json
import math
import sqlite3
import statistics
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import db  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
CATALOG = REPO / "data" / "catalog_vehicles.json"
OUT = REPO / "data" / "depreciation_curve.json"

HORIZON_YEARS = 5
MIN_LISTINGS_PER_CELL = 3
MIN_CELLS_PER_MODEL = 3
MIN_LISTINGS_PER_MODEL = 15
# A MODEL whose retention sits this far from its type median, averaged over
# every age it appears at, is almost certainly a bad join rather than an unusual
# car. Both tails are real: toyota-hilux reads 0.69 because the matcher feeds
# the electric Hilux a diet of 2.4-litre diesel pickups, and tesla-model-3 reads
# 1.65 because Tesla cut new prices, so old listings look like they appreciated.
# The observed distribution is p5 0.79, median 1.00, p95 1.48, with a clean gap
# between 0.71 and 0.79 at the bottom. Excluded models fall back to their type
# curve, which is the honest answer when the evidence is contradictory.
MODEL_RATIO_LOW, MODEL_RATIO_HIGH = 0.75, 1.35
# Shrink a per-model fit toward its type curve by this many notional listings.
SHRINKAGE_LISTINGS = 40.0
# No 5-year-old car retains more than this or less than this.
RETAINED_MIN, RETAINED_MAX = 0.15, 0.85


def _cells(con, catalog):
    """(type, model, age, retained, n) for every model-year with enough listings."""
    rows = con.execute(
        """SELECT vehicle_id, year, COUNT(*), AVG(price_rm) FROM listings
           WHERE vehicle_id IS NOT NULL AND price_rm > 5000 AND year IS NOT NULL
           GROUP BY vehicle_id, year HAVING COUNT(*) >= ?""",
        (MIN_LISTINGS_PER_CELL,),
    ).fetchall()
    now = max(int(v.get("as_of_date", "2026")[:4]) for v in catalog.values() if v.get("as_of_date"))
    out = []
    for vehicle_id, year, n, avg in rows:
        v = catalog.get(vehicle_id)
        if not v or float(v["price_rm"]) <= 0:
            continue
        age = now - int(year)
        if 1 <= age <= HORIZON_YEARS:
            out.append((v["type"], vehicle_id, age, avg / float(v["price_rm"]), n))
    return out


def _reject_outliers(cells):
    """Drop whole models whose retention contradicts their type: bad joins.

    Screening per cell was not enough. A mismatched model produces a full set of
    consistently wrong cells, each close enough to the (polluted) median to
    survive individually, so the model is judged as a whole and removed from the
    type fit as well. Returns (kept cells, rejection reasons per model).
    """
    medians = {}
    for t, _, age, ret, _ in cells:
        medians.setdefault((t, age), []).append(ret)
    medians = {k: statistics.median(v) for k, v in medians.items()}

    weighted = {}
    for t, model, age, ret, n in cells:
        acc = weighted.setdefault(model, [0.0, 0.0])
        acc[0] += n * (ret / medians[(t, age)])
        acc[1] += n

    rejected = {}
    for model, (num, den) in weighted.items():
        if den < MIN_LISTINGS_PER_MODEL:
            continue  # too little evidence to judge; the type curve covers it
        ratio = num / den
        if not MODEL_RATIO_LOW <= ratio <= MODEL_RATIO_HIGH:
            rejected[model] = round(ratio, 2)
    kept = [c for c in cells if c[1] not in rejected]
    return kept, rejected


def _fit_k(cells):
    """Weighted least squares on log(retained) = -k * age. Returns (k, listings)."""
    num = den = weight = 0.0
    for _, _, age, ret, n in cells:
        r = min(max(ret, 0.05), 1.2)
        num += n * age * math.log(r)
        den += n * age * age
        weight += n
    return (-num / den if den else 0.0), weight


def _retained(k: float) -> float:
    return min(max(math.exp(-k * HORIZON_YEARS), RETAINED_MIN), RETAINED_MAX)


def main() -> None:
    catalog = {v["id"]: v for v in json.loads(CATALOG.read_text(encoding="utf-8"))["vehicles"]}
    con = sqlite3.connect(db.DB_PATH)
    cells = _cells(con, catalog)
    kept, rejected = _reject_outliers(cells)

    by_type = {}
    for t in sorted({c[0] for c in kept}):
        sub = [c for c in kept if c[0] == t]
        k, listings = _fit_k(sub)
        by_type[t] = {
            "k_per_year": round(k, 4),
            "retained_5yr": round(_retained(k), 4),
            "listings": int(listings),
            "cells": len(sub),
            "basis": "fitted",
        }

    by_model = {}
    for model in sorted({c[1] for c in kept}):
        sub = [c for c in kept if c[1] == model]
        listings = sum(c[4] for c in sub)
        if len(sub) < MIN_CELLS_PER_MODEL or listings < MIN_LISTINGS_PER_MODEL:
            continue
        k_model, _ = _fit_k(sub)
        k_type = by_type[catalog[model]["type"]]["k_per_year"]
        # Shrink toward the type curve: three model-years is not enough evidence
        # to believe a Tesla depreciates at exactly 0.0 per year.
        k = (listings * k_model + SHRINKAGE_LISTINGS * k_type) / (listings + SHRINKAGE_LISTINGS)
        by_model[model] = {
            "k_per_year": round(k, 4),
            "retained_5yr": round(_retained(k), 4),
            "listings": int(listings),
            "cells": len(sub),
            "basis": "measured",
        }

    payload = {
        "_readme": "Retained value after HORIZON_YEARS, fitted from matched used "
                   "listings by scripts/used_market/build_depreciation_curve.py. "
                   "Five years, not ten: no Malaysian EV listing is older than "
                   "age 5. by_model entries are measured and shrunk toward their "
                   "type curve; every other trim uses by_type.",
        "horizon_years": HORIZON_YEARS,
        "cells_used": len(kept),
        "models_rejected_as_bad_joins": {
            m: {"retention_vs_type_median": r} for m, r in sorted(rejected.items())
        },
        "by_type": by_type,
        "by_model": by_model,
    }
    OUT.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(REPO)}")
    print(f"  cells used {len(kept)} of {len(cells)}")
    print(f"  models rejected as bad joins: {len(rejected)}")
    for m, r in sorted(rejected.items(), key=lambda kv: kv[1]):
        print(f"    {m:26s} retention is {r:.2f}x its type median")
    for t, d in by_type.items():
        print(f"  {t:7s} k={d['k_per_year']:.4f}/yr  retained_5yr={d['retained_5yr']:.1%}  "
              f"({d['listings']} listings)")
    print(f"  per-model curves: {len(by_model)} of {len(catalog)} trims")


if __name__ == "__main__":
    main()
