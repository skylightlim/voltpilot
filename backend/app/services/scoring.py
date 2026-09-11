from __future__ import annotations

from ..config import load_catalog
from ..engines import engines
from ..engines.engines import normalize_cost_scores
from ..engines.topsis import (
    CRITERIA,
    criteria_bounds,
    preference_weights,
    rank_stability,
    run_topsis,
)
from . import energy_context

# How far above the stated budget a car may still be considered.
BUDGET_STRETCH = 1.10


def score_catalog(profile: dict, sliders: dict, fuel_scenario: str = "subsidised",
                  with_stability: bool = True) -> dict:
    """Feature engineering -> 4 engines -> TOPSIS -> full result bundle.

    6 criteria per catalogue row (D18): 4 engine scores (0-100, maximize)
    plus purchase price and running cost/yr (minimize). Policy engine removed.
    """
    features = engines.build_features(profile)
    energy = energy_context(fuel_scenario)

    # A car the buyer cannot afford is not a recommendation. Screen on budget
    # BEFORE scoring so over-budget models never reach the ranking, the analyst
    # or the page. If nothing qualifies we keep the full catalogue rather than
    # hand back an empty result, and say so in the overview.
    #
    # The cap allows BUDGET_STRETCH above the stated figure. A hard cutoff made
    # a RM255k car invisible to a RM250k buyer while a RM249k car ranked, and
    # real buyers stretch for the right car. The stretch band is not a free
    # pass: criteria_bounds anchors the price axis on the STATED budget, so
    # anything above it scores 0 on price and has to win on other criteria.
    # Ranking it seventh is a better answer than pretending it does not exist.
    catalog = load_catalog()
    budget = float(profile.get("budget_max_rm") or 0)
    cap = budget * BUDGET_STRETCH
    affordable = [v for v in catalog if float(v["price_rm"]) <= cap] if budget > 0 else catalog
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
        retained_pct, retained_basis = engines.resale_retained_pct(vehicle)

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
                # 5-year horizon, not 10: no Malaysian EV listing is older than
                # age 5, so a 10-year figure would be invented. `basis` says
                # whether this model was measured from its own listings or is
                # carrying its drivetrain average.
                "resale_retained_pct": retained_pct,
                "resale_basis": retained_basis,
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

    # financial_score and energy_score are still published for the results page
    # and the analyst, but they are NO LONGER criteria. normalize_cost_scores
    # min-maxes over the candidate set, so as criteria they made every row's
    # score depend on which other cars were present. The ranking now scores the
    # raw tco_excluding_rm and co2_kg_yr against profile-derived bounds instead.
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
        # One money criterion, not three. Purchase price, 10-year ownership cost
        # and 10 years of running cost are additive parts of a single figure, so
        # scoring them separately counted the same ringgit three times and gave
        # money 57% of the decision by accident. All three are still published
        # for the results page and the analyst; only the criterion is merged.
        r["total_cost_10yr_rm"] = (
            r["purchase_price_rm"] + float(r["tco_excluding_rm"]) + r["running_cost_rm_yr"] * 10
        )
        matrix_rows.append(r)

    weights = preference_weights(sliders)
    bounds = criteria_bounds(profile, features["annual_km"])
    ranking = run_topsis(matrix_rows, weights, bounds)

    return {
        "ranking": ranking,
        "weights": {c: w for c, w in zip(CRITERIA, weights)},
        "bounds": {c: list(b) for c, b in zip(CRITERIA, bounds)},
        "features": features,
        "solar_eligible": bool(profile.get("consider_solar") and profile.get("can_charge_home")),
        "budget": {
            "max_rm": budget,
            "cap_rm": cap if budget > 0 else 0.0,
            "stretch": BUDGET_STRETCH,
            "applied": budget_applied,
            "considered": len(affordable),
            "catalog_total": len(catalog),
        },
        "feasibility": {**gate, "bev_removed": bev_removed},
        # 400 re-rankings, about 75 ms. Negligible against the analyst call that
        # follows, but worth skipping in tests that only want the ranking.
        "stability": rank_stability(matrix_rows, weights, bounds) if with_stability else None,
        "fuel_scenario": fuel_scenario,
        "ron95_rm_per_l": float(energy["fuel"]["ron95_rm_per_l"]),
    }