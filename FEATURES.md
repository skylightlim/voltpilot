---
contentType: Conceptual
goal: Propose the next features for the platform, each grounded in measured evidence
audience: Maintainers of ai-transport-platform
written: 2026-09-11
---

# Feature proposals

All seven are implemented as of 2026-09-11, on the `features` branch. Each entry keeps its original reasoning and carries a **Shipped** note recording what was built and where it deviated from the plan.

Seven features, derived from the decision-engine work recorded in `issue.md` rather than from a wishlist. Each one names the evidence that motivates it, the data that already exists to build it, and what it depends on. Two ideas that looked good and did not survive testing are recorded at the end, because knowing why they failed is worth as much as the proposals.

The ordering is by value against effort, not by ambition.

## The finding these are built around

Costing five years of ownership properly, in the research written up as issue 16, produced a result that undercuts the story the interface currently tells.

| Five-year cost, Klang Valley buyer, 10,400 km/yr | Wuling Bingo (EV) | Toyota Yaris Cross (hybrid) |
| --- | --- | --- |
| Depreciation | RM39,134 | RM50,040 |
| Energy | RM3,785 | RM3,725 |

The energy difference across five years is **RM60**. The depreciation difference is **RM10,906**, which is 182 times larger. At 37,440 km/yr the energy gap widens to RM220 and depreciation still outweighs it 50 times over.

The reason is that RON95 is subsidised to RM1.99 under BUDI95 while public charging runs RM1.25/kWh, so an efficient hybrid currently costs **RM7.16 per 100 km against an EV’s RM8.44**. The running-cost advantage the product implies does not exist at today’s Malaysian prices.

Two things follow, and most of the features below come from one or the other. The decision is a depreciation decision, and the platform does not show depreciation. And the decision rests on a fuel subsidy that the user cannot see and that the platform does not mention.

## P1. Where your money actually goes

**What.** A five-year cost breakdown for each recommended car: depreciation, loan interest, insurance, energy, maintenance, road tax, as an ordered list with the largest first.

**Why.** Depreciation is 72% of the five-year cost and the interface never names it. A buyer reading the current results page would reasonably conclude that energy is what separates these cars, and the numbers say it is worth RM60.

**Data.** Already computed and thrown away. `financial_tco_excluding` returns a `components` dict, and `grep` across `frontend/app` finds no reference to `tco_components` anywhere. The depreciation line comes from `data/depreciation_curve.json`, which issue 9 already built.

**Depends on** the issue 16 horizon decision, because the breakdown should be five-year rather than ten-year, and because insurance is currently overstated 2.74 times and would be the second-largest line if shown today.

**Size.** Small on the backend, since the numbers exist. Medium on the frontend, being one new component on `/results/[token]`.

**Shipped.** `backend/app/services/costing.py` and `GET /results/{token}/costs`, rendered by `frontend/components/CostBreakdown.tsx`. Display only: the ranking still scores `total_cost_10yr_rm`, because moving it to a five-year basis forces the resale double-counting decision recorded in issue 16 and not yet taken. Insurance inside the breakdown is modelled against the NCD ladder and a declining sum insured, so the figure shown is 1.78 times the base premium over five years rather than five times it. Measured on the reference profile, depreciation is 66% of a Wuling Bingo’s five-year cost and 62% of a Yaris Cross’s; energy is 6.4% and 4.6%.


## P2. The real listings behind every resale number

**What.** Next to each car’s retained-value figure, the evidence for it: how many used listings it was fitted from, at what ages, and what those cars are actually advertised for now.

**Why.** `data/used_market.db` holds 14,164 listings, 5,279 of them matched to catalogue vehicles, and not one is shown to a user. Resale is now a scored criterion, so the number is already influencing recommendations; showing its basis turns an assertion into evidence. The engine already distinguishes `measured` from `type_curve` per row, so the interface can be honest about which cars have real data behind them and which are carrying a drivetrain average.

**Data.** `used_market.db` (price-corrupted until issue 3 was fixed on 2026-09-10, now repaired) and `resale_basis`, already published on every ranking row and read by nothing.

**Caveat worth surfacing rather than hiding.** Only 22 of 184 trims are measured. The interface should say ”estimated from all hybrids” where that is the case, not imply per-model precision it does not have.

**Size.** Medium. Needs a read-only endpoint over the listings table and a panel to render it.

**Shipped.** `backend/app/services/evidence.py` and `GET /results/{token}/evidence/{slug}`, rendered by `frontend/components/ResaleEvidence.tsx`. Shows asking prices by model year and links three real listings. A car whose figure came from its drivetrain average says so in words rather than implying per-model precision.


## P3. What happens when the fuel subsidy ends

**What.** A scenario toggle on the results page: recompute the ranking with RON95 at its unsubsidised market price instead of the BUDI95 pump price.

**Why.** The entire EV-versus-hybrid energy comparison rests on a policy decision, and the platform presents it as though it were a property of the cars. `data/fuel.json` already carries both figures, `ron95_rm_per_l` at 1.99 and `market_rm_per_l.ron95` at 3.77, so the counterfactual is one substitution away.

| Scenario | Hybrid per 100 km | Five-year energy gap at 10,400 km/yr | at 37,440 km/yr |
| --- | --- | --- | --- |
| RON95 subsidised at RM1.99 | RM7.16 | RM662, hybrid ahead | RM2,383, hybrid ahead |
| RON95 at market, RM3.77 | RM13.57 | RM2,670, EV ahead | RM9,613, EV ahead |

For a low-mileage buyer the subsidy is worth less than the depreciation gap either way. For a high-mileage buyer it is worth RM9,613 and flips the answer. Telling someone their recommendation depends on a subsidy is more useful than a ranking that quietly assumes it continues for five years.

**Data.** Present. No new collection needed.

**Size.** Small. `energy_context` already loads the fuel figures; the scenario is a parameter, and the golden fixture will show exactly what moves.

**Shipped.** `energy_context` takes a scenario, `/score` accepts `fuel_scenario`, and `GET /results/{token}/scenario` re-ranks without persisting, because a scenario is a view over the buyer’s result and writing it back would overwrite it. The panel shows both the cost per 100 km and the shortlist itself changing: the high-mileage profile goes from 3 EVs and 2 hybrids in its top five to 5 EVs when RON95 is priced at RM3.77.


## P4. Break-even mileage

**What.** For the top EV and the top hybrid, the annual mileage at which the EV’s total cost overtakes the hybrid’s, and where the user sits on that line.

**Why.** It answers the question buyers actually ask, and at current prices the honest answer is often striking: with RON95 subsidised, an efficient hybrid is cheaper per kilometre than an EV, so there is no break-even at all on energy. Saying so plainly, and showing that the case for an EV rests on purchase price and maintenance instead, is a more defensible position than an unexplained ranking.

**Data.** Present. It is a solve over the existing cost model.

**Depends on** P1, since it is the same arithmetic presented as a threshold.

**Size.** Small.

**Shipped.** `breakeven_km_per_year` in `costing.py` and `GET /results/{token}/breakeven`, in the same panel as P3. It refuses to report a crossover beyond 100,000 km a year: when the two cost-per-km figures are close the lines are nearly parallel and cross somewhere absurd, which is arithmetic rather than advice. For a Sarawak buyer with no home charger it returns a real answer, 62,361 km a year, against the 10,400 they drive.


## P5. Head-to-head comparison

**What.** Pick any two cars from the ranking and see them side by side across all five criteria and the P1 cost breakdown.

**Why.** The product’s central question is binary, EV or hybrid, and the output is a ranked list of 184. Nothing in the interface lets a user hold two candidates against each other, which is how car buyers actually decide. The engine already produces every number this needs.

**Data.** Present in the existing `/results/{token}` payload.

**Size.** Medium, entirely frontend.

**Shipped.** `GET /results/{token}/compare` and `frontend/components/CompareCars.tsx`. Two pickers drawn from the ranking itself, so they can only offer cars that survived the budget screen and the feasibility gate.


## P6. How firm the answer is

**What.** A confidence line on the recommendation: how often the top car stays top when the weights are jittered, and which cars are close enough to be a tie.

**Why.** This is issue 12, and it is now cheap. Measured across the four golden profiles the winner holds 100%, 100%, 99% and 64% of the time, so for three profiles the honest message is ”this is firm” and for one it is ”these two are effectively tied”. Scoring costs 2.3 ms, so 400 jittered runs add roughly a second to a request that already waits on the analyst.

**Data.** Present.

**Size.** Small on the backend. The wording matters more than the code.

**Shipped.** `rank_stability` in `topsis.py`, stored at scoring time and rendered by `frontend/components/AnswerConfidence.tsx`. Seeded, so the same profile always reports the same confidence, and skippable via `with_stability=False` so the test suite does not pay 75 ms per call for it.


## P7. What the chargers near you are actually like

**What.** Replace the count of nearby stations with their composition: how many are DC fast against AC, what power they deliver, which networks, and what they charge per kWh.

**Why.** `data/ev-stations-full.json` holds 852 stations with `network`, `chargerType`, `powerNumeric` and `price`, and the engine reads none of it. `infrastructure_engine` counts points from the CSV and nothing more, which is why it returns the same score for every EV, an issue recorded as 5b and 6. A user told ”11 chargers within 20 km” learns much less than one told that three of them are DC fast and the rest are 22 kW AC.

**Depends on** issues 5b and 6, and it supplies the per-vehicle input those need, since a 50 kW car and a 250 kW car do not face the same corridor.

**Size.** Medium. The data is richer than the current pipeline, so the loader changes as well as the interface.

**Shipped.** `charger_mix` in `evidence.py`, folded into the existing `/results/{token}/infrastructure` response and panel. A Klang Valley postcode resolves to 300 points within 20 km of which 47 are DC fast, the quickest at 400 kW; Tawau resolves to none. It does not yet feed the infrastructure criterion, which is issues 5b and 6.


## Ideas that did not survive testing

**Popularity as a resale signal.** The hypothesis was that widely registered models hold value better, and `data/paultan_registrations_by_model.json` carries JPJ registration volume for 302 models. Correlating log registrations against fitted five-year retention across the 19 models measured for both gives **r = +0.080**, which is no relationship at all. BYD Atto 3 is among the most registered EVs in Malaysia at 13,003 units and retains the worst at 34.2%, while Toyota Corolla Cross Hybrid retains 55.7%. Brand predicts retention; volume does not. The registration data is still worth surfacing as market context, but not as a value-retention signal, and not as a scoring criterion, since ranking cars by what other people bought would make the recommendations self-reinforcing.

**A physically derived convenience score.** Replacing the 0 to 100 behaviour criterion with hours per year spent fuelling or charging away from home would have removed a hand-picked constant. The catalogue cannot support it: `fuel_tank_l` is absent for all 184 trims and `charge_power_kw_dc` is present for 30. Built on assumed tank sizes and charge rates it returned 12.0 EV hours a year against 1.9 for a hybrid, by counting every 30-minute motorway stop as pure loss while ignoring that the hybrid driver also stops on a 730 km round trip. It needed four assumptions in place of one and swung harder toward hybrids. Recorded under issue 5 in `issue.md`.

## Suggested order

P3 and P1 first. P3 is small, needs no new data, and addresses the most serious gap between what the platform shows and what the recommendation actually depends on. P1 is the one that makes the product honest about where the money goes, and P4 falls out of it almost free.

P6 next, being small and mostly a wording decision, then P2, which needs an endpoint but turns the resale criterion from an assertion into evidence.

P5 and P7 last. P5 is the largest piece of frontend work here, and P7 is best done alongside issues 5b and 6 rather than before them.
