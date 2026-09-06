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

    # Spec Step 02 — hard feasibility gate. A buyer with no home charging, no
    # workplace charging and fewer than 5 public points within 20 km cannot run
    # a battery-electric car, so those candidates are removed before scoring
    # rather than merely ranked low. PHEVs survive: they still drive on petrol.
    # Screening only — the six criteria are untouched.
    gate = engines.bev_charging_gate(profile)
    bev_removed = 0
    if not gate["passed"]:
        before = len(affordable)
        affordable = [v for v in affordable if v.get("type") != "ev"]
        bev_removed = before - len(affordable)
        if not affordable:  # never hand back nothing
            affordable = catalog
            bev_removed = 0

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
                # How each figure is known — measured / computed / estimated.
                # Carried through so the results page can show a reader that the
                # road tax is derived from a published JPJ schedule while the
                # maintenance figure may be a fallback.
                "provenance": vehicle.get("provenance", {}),
                "source": vehicle.get("source", "official"),
                "tco_excluding_rm": tco["tco_excluding_rm"],
                "tco_components": tco["components"],
                "running_cost_raw": eng["cost_rm_yr"],
                "co2_kg_yr": eng["co2_kg_yr"],
                "kwh_yr": eng["kwh_yr"],
                "litres_yr": eng["litres_yr"],
                "ev_share": eng.get("ev_share", 0.0),
                "financial_raw": tco["tco_excluding_rm"],
                # The environment criterion must measure emissions, not money.
                # This was eng["cost_rm_yr"], the same figure already carried by
                # running_cost_rm_yr — so the "Carbon & Eco Impact" slider was
                # re-weighting running cost and the ranking did not respond to
                # grid region at all. co2_kg_yr is what the UI claims is scored.
                "energy_raw": eng["co2_kg_yr"],
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
        "feasibility": {**gate, "bev_removed": bev_removed},
    }