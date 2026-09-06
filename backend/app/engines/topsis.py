"""TOPSIS decision engine (D1, D18).

6 criteria matrix per catalogue model:
  1. financial score      (0-100, max)
  2. behaviour score      (0-100, max)
  3. infrastructure score (0-100, max)
  4. energy score         (0-100, max)
  5. purchase price       (RM, min)
  6. running cost/yr      (RM/yr, min)

Policy criterion removed 2026-08-14 (policy incentives no longer scored).

User's 4 preference sliders -> criteria weights (normalized 0-1).
"""

from __future__ import annotations

from pymcdm.methods import TOPSIS

CRITERIA = [
    "financial_score",
    "behaviour_score",
    "infrastructure_score",
    "energy_score",
    "purchase_price_rm",
    "running_cost_rm_yr",
]
TYPES = [1, 1, 1, 1, -1, -1]  # max for scores, min for costs

BASE_WEIGHTS = {
    "financial_score": 0.24,
    "behaviour_score": 0.15,
    "infrastructure_score": 0.13,
    "energy_score": 0.15,
    "purchase_price_rm": 0.17,
    "running_cost_rm_yr": 0.16,
}


def preference_weights(sliders: dict) -> list[float]:
    """Map the 4 sliders (0-100) onto the 6 criteria, then normalize to sum 1."""
    s = {k: max(0.0, min(100.0, float(sliders.get(k, 50) or 50))) / 50.0 for k in
         ("save_money", "environment", "convenience", "future_proofing")}

    w = dict(BASE_WEIGHTS)
    w["financial_score"] *= 1.0 + 0.6 * (s["save_money"] - 1) + 0.5 * (s["future_proofing"] - 1)
    w["running_cost_rm_yr"] *= 1.0 + 0.7 * (s["save_money"] - 1)
    w["purchase_price_rm"] *= 1.0 + 0.5 * (s["save_money"] - 1)
    w["energy_score"] *= 1.0 + 1.6 * (s["environment"] - 1)
    w["behaviour_score"] *= 1.0 + 0.7 * (s["convenience"] - 1)
    w["infrastructure_score"] *= 1.0 + 0.8 * (s["convenience"] - 1)

    total = sum(w.values())
    return [round(v / total, 4) for v in w.values()]


def run_topsis(matrix_rows: list[dict], weights: list[float]) -> list[dict]:
    """Returns rows enriched with rank + closeness score (0-1)."""
    alts = [r["slug"] for r in matrix_rows]
    matrix = [[r[c] for c in CRITERIA] for r in matrix_rows]

    topsis = TOPSIS()
    closeness = topsis(matrix, weights, TYPES)
    ranked = closeness.argsort()[::-1]  # best first

    out = []
    for pos, idx in enumerate(ranked, start=1):
        d = dict(matrix_rows[idx])
        d["rank"] = int(pos)
        d["topsis_score"] = round(float(closeness[idx]), 4)
        out.append(d)
    return out