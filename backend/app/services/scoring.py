from __future__ import annotations

import math

from ..config import load_catalog
from . import costing
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

# How many cars to show a buyer whose budget buys nothing they can run. The
# cheapest feasible ones, because "closest to what you said" is the only honest
# answer left; see _candidates.
NEAREST_FALLBACK = 10


# Cars that need somewhere to plug in. Removed together when the buyer has
# neither home nor workplace charging; see engines.bev_charging_gate.
PLUG_IN_TYPES = ("ev", "phev")


def _stated_budget(profile: dict) -> float:
    """The stated budget in RM, or 0.0 when absent, negative or not finite."""
    try:
        budget = float(profile.get("budget_max_rm") or 0)
    except (TypeError, ValueError):
        return 0.0
    return budget if math.isfinite(budget) and budget > 0 else 0.0


def _candidates(catalog: list[dict], budget: float, gate_passed: bool) -> dict:
    """Who gets scored, and the budget the cost axis is anchored on.

    Budget screen, then the feasibility gate, then one fallback. Both screens
    used to carry their own `if not affordable: affordable = catalog`, and each
    undid work the other had done:

    * A budget below the cheapest car fell back to all 170 models while the
      cost axis stayed anchored on the stated figure. Every car then clipped to
      the same worst cost, so the largest criterion stopped separating them and
      a RM20,000 buyer was shown a RM648,888 Mercedes EQS at rank 3. Below
      about RM12,000 the ceiling dropped under PRICE_FLOOR_RM, the axis
      inverted, and every car scored the BEST possible cost instead.
    * A buyer who could afford only EVs and failed the charging gate got the
      whole catalogue back: the EVs the gate had just removed, plus everything
      over budget, with `budget.applied` still reporting True.

    The fallback now is the NEAREST_FALLBACK cheapest cars the buyer can
    actually run, with the axis anchored on the dearest of them so cost keeps
    discriminating. That anchor depends on the catalogue and the gate only, not
    on the stated budget, and only on this path: the normal path is still
    anchored on what the buyer said, as criteria_bounds requires.
    """
    runnable = catalog if gate_passed else [v for v in catalog if v.get("type") not in PLUG_IN_TYPES]
    if not runnable:  # a catalogue with nothing but plug-ins: nothing else to offer
        runnable = catalog
    screened = len(runnable) != len(catalog)

    cap = budget * BUDGET_STRETCH
    within = [v for v in catalog if float(v["price_rm"]) <= cap] if budget > 0 else list(catalog)
    chosen = [v for v in within if not screened or v.get("type") not in PLUG_IN_TYPES]
    removed = [v for v in within if screened and v.get("type") in PLUG_IN_TYPES]
    out = {
        "bev_removed": sum(1 for v in removed if v.get("type") == "ev"),
        "phev_removed": sum(1 for v in removed if v.get("type") == "phev"),
        "fallback": None,
        "scale_budget": budget,
    }
    if not chosen:
        chosen = sorted(runnable, key=lambda v: (float(v["price_rm"]), v["id"]))[:NEAREST_FALLBACK]
        out["fallback"] = "nearest_over_budget"
        out["scale_budget"] = max(float(v["price_rm"]) for v in chosen)
    out["vehicles"] = chosen
    return out


def score_catalog(profile: dict, sliders: dict, fuel_scenario: str = "subsidised",
                  with_stability: bool = True) -> dict:
    """Feature engineering -> engines -> TOPSIS -> full result bundle.

    Five criteria per candidate (topsis.CRITERIA): five-year holding cost and
    CO2 to minimise; resale retention, convenience and infrastructure to maximise.
    """
    features = engines.build_features(profile)
    energy = energy_context(fuel_scenario)

    # A car the buyer cannot afford is not a recommendation. Screen on budget
    # BEFORE scoring so over-budget models never reach the ranking, the analyst
    # or the page.
    #
    # The cap allows BUDGET_STRETCH above the stated figure. A hard cutoff made
    # a RM255k car invisible to a RM250k buyer while a RM249k car ranked, and
    # real buyers stretch for the right car. The stretch band is not a free
    # pass: criteria_bounds anchors the price axis on the STATED budget, so
    # anything above it scores 0 on price and has to win on other criteria.
    # Ranking it seventh is a better answer than pretending it does not exist.
    #
    # Feasibility gate. A buyer with neither home nor workplace charging has
    # nowhere of their own to plug in, so every plug-in car, battery-electric
    # and plug-in hybrid, is removed before scoring rather than ranked low.
    # Public chargers nearby do not change that. Screening only: the criteria
    # are untouched.
    #
    # If the two screens leave nothing, _candidates returns the nearest cars
    # the buyer can run and says so in `budget.fallback`.
    catalog = load_catalog()
    budget = _stated_budget(profile)
    cap = budget * BUDGET_STRETCH
    gate = engines.bev_charging_gate(profile)
    picked = _candidates(catalog, budget, gate["passed"])
    affordable = picked["vehicles"]
    bev_removed = picked["bev_removed"]
    budget_applied = bool(budget > 0 and picked["fallback"] is None)
    # What the cost axis is anchored on: the stated budget, except on the
    # fallback path where the stated figure buys nothing and would saturate it.
    scale_profile = {**profile, "budget_max_rm": picked["scale_budget"]}

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
        # The CRITERION is the five-year figure below; total_cost_10yr_rm stays
        # published for the results page and the report. Two changes, issue.md
        # issues 9 and 16:
        #
        # Depreciation replaces purchase price. A buyer does not lose the price
        # of the car, they lose the part of it that does not come back, and at
        # 71% of the five-year total that is the largest cost of ownership. The
        # engine omitted it entirely while counting the whole purchase price,
        # which is both too big and the wrong quantity.
        #
        # Five years, not ten. Insurance was charged as ten repeats of a
        # first-year premium at 0% NCD on a new-car sum insured — 2.74x too
        # much, and 57.6% of the old total. costing.py applies the PIAM NCD
        # ladder against a declining sum insured, and charges the 91% of a
        # seven-year hire-purchase interest bill actually paid by year five.
        breakdown = costing.five_year_breakdown(r, r["running_cost_rm_yr"])
        r["total_cost_5yr_rm"] = float(breakdown["total_rm"])
        # The CRITERION is the total less depreciation. Depreciation was being
        # scored twice: as 68% of this total, and again as resale_retained_pct,
        # which is the same loss as a percentage. Cost's 0.34 and resale's 0.16
        # were therefore mostly one quantity, price, voting twice, and rank
        # tracked purchase price at 0.93-0.95 on the Klang Valley profiles
        # (issue.md issue 33; this reverses the overlap issue 16 accepted).
        # Holding cost is what the car costs to keep; resale is what comes back.
        # The total, depreciation included, is still what the buyer is shown.
        depreciation = next(
            (line["amount_rm"] for line in breakdown["lines"] if line["key"] == "depreciation"),
            0.0,
        )
        r["holding_cost_5yr_rm"] = r["total_cost_5yr_rm"] - float(depreciation)
        r["cost_breakdown_5yr"] = breakdown
        matrix_rows.append(r)

    weights = preference_weights(sliders)
    bounds = criteria_bounds(scale_profile, features["annual_km"])
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
            # None on the normal path. "nearest_over_budget" when nothing the
            # buyer can run fits the budget and the ranking is the closest
            # NEAREST_FALLBACK cars instead; `scale_max_rm` is then the figure
            # the cost axis was anchored on in place of the stated budget.
            "fallback": picked["fallback"],
            "scale_max_rm": picked["scale_budget"],
            "considered": len(affordable),
            "catalog_total": len(catalog),
        },
        "feasibility": {**gate, "bev_removed": bev_removed,
                        "phev_removed": picked["phev_removed"]},
        # 400 re-rankings, about 75 ms. Negligible against the analyst call that
        # follows, but worth skipping in tests that only want the ranking.
        "stability": rank_stability(matrix_rows, weights, bounds) if with_stability else None,
        "fuel_scenario": fuel_scenario,
        "ron95_rm_per_l": float(energy["fuel"]["ron95_rm_per_l"]),
    }