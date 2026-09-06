from __future__ import annotations

from ..config import load_catalog
from ..engines import engines
from ..engines.engines import normalize_cost_scores
from ..engines.topsis import CRITERIA, preference_weights, run_topsis
from . import energy_context


def score_catalog(profile: dict, sliders: dict) -> dict:
    """Feature engineering -> 4 engines -> TOPSIS -> full result bundle.

    6 criteria per catalogue row (D18): 4 engine scores (0-100, maximize)
    plus purchase price and running cost/yr (minimize). Policy engine removed.
    """
    features = engines.build_features(profile)
    energy = energy_context()

    # A car the buyer cannot afford is not a recommendation. Screen on budget
    # BEFORE scoring so over-budget models never reach the ranking, the analyst
    # or the page. If nothing qualifies we keep the full catalogue rather than
    # hand back an empty result, and say so in the overview.
    catalog = load_catalog()
    budget = float(profile.get("budget_max_rm") or 0)
    affordable = [v for v in catalog if float(v["price_rm"]) <= budget] if budget > 0 else catalog
    budget_applied = bool(budget > 0 and affordable)
    if not affordable:
        affordable = catalog

    rows = []
    for raw in affordable:
        vehicle = dict(raw)
        tco = engines.financial_tco_excluding(vehicle)
        eng = engines.energy_engine(vehicle, profile, features, energy)

        rows.append(
            {
                "slug": vehicle["id"],
                "brand": vehicle["brand"],
                "model": vehicle["model"],
                "variant": vehicle.get("variant", ""),
                "type": vehicle["type"],
                "body": vehicle.get("body") or "",
                "segment": vehicle.get("segment") or "",
                "price_rm": float(vehicle["price_rm"]),
                "specs": vehicle.get("specs", {}),
                "ownership": vehicle.get("ownership", {}),
                "source": vehicle.get("source", "official"),
                "tco_excluding_rm": tco["tco_excluding_rm"],
                "tco_components": tco["components"],
                "running_cost_raw": eng["cost_rm_yr"],
                "co2_kg_yr": eng["co2_kg_yr"],
                "kwh_yr": eng["kwh_yr"],
                "litres_yr": eng["litres_yr"],
                "ev_share": eng.get("ev_share", 0.0),
                "financial_raw": tco["tco_excluding_rm"],
                "energy_raw": eng["cost_rm_yr"],
            }
        )

    tco_scores = normalize_cost_scores({r["slug"]: r["financial_raw"] for r in rows})
    energy_scores = normalize_cost_scores({r["slug"]: r["energy_raw"] for r in rows})
    behaviour_scores = {r["slug"]: engines.behaviour_engine(r, profile, features) for r in rows}
    infrastructure_scores = {
        r["slug"]: engines.infrastructure_engine(r, profile, features) for r in rows
    }

    matrix_rows = []
    for r in rows:
        r["financial_score"] = tco_scores[r["slug"]]
        r["behaviour_score"] = behaviour_scores[r["slug"]]
        r["infrastructure_score"] = infrastructure_scores[r["slug"]]
        r["energy_score"] = energy_scores[r["slug"]]
        r["running_cost_rm_yr"] = float(r["running_cost_raw"])
        r["purchase_price_rm"] = float(r["price_rm"])
        matrix_rows.append(r)

    weights = preference_weights(sliders)
    ranking = run_topsis(matrix_rows, weights)

    return {
        "ranking": ranking,
        "weights": {c: w for c, w in zip(CRITERIA, weights)},
        "features": features,
        "solar_eligible": bool(profile.get("consider_solar") and profile.get("can_charge_home")),
        "budget": {
            "max_rm": budget,
            "applied": budget_applied,
            "considered": len(affordable),
            "catalog_total": len(catalog),
        },
    }