---
contentType: Reference
goal: Diagnose and fix the defects in the TOPSIS decision engine
audience: Maintainers of ai-transport-platform
reviewed: 2026-09-10
---

# Decision engine issues

Seventeen defects in the recommendation pipeline, ordered by how much each one changes the ranking a user sees. Three produced wrong output. Four meant the six-criteria model measured fewer than six independent things. Two made the ranking depend on cars nobody would buy. Three concerned the largest ownership cost, which the engine did not model at all. One concerned the absence of any stability signal, one explained why the test suite caught none of the others, and the last two were found while fixing the ones above them.

Every finding below was measured against the shipping code, not inferred from reading it. The commands that produce each number are included so you can re-run them after a fix.

All seventeen are now fixed: 1, 2 and 3 on 2026-09-10; 4, 5a, 7, 8, 10 and 13 on 2026-09-11; the rest on 2026-09-14. **Line numbers throughout are as at commit `fdcc8bd`**, before any of this work landed, so they locate the original defect rather than the current code. Each issue carries a **Status** note recording what shipped, where it deviated from the plan written above it, and what was tried and rejected — several deviate, because measurement contradicted the plan.

## Severity summary

Each row links a defect to the file that carries it and the effect it has on output. Locations are line numbers at commit `fdcc8bd`.

| # | Issue | Location | Effect | Status |
| --- | --- | --- | --- | --- |
| 1 | Slider at 0 is read as 50 | `backend/app/engines/topsis.py:42` | Weight vector ignores the input | Fixed 2026-09-10 |
| 2 | Sliders 1 to 18 produce negative weights | `backend/app/engines/topsis.py:49` | Criterion inverts, prefers higher CO2 | Fixed 2026-09-10 |
| 3 | Carlist prices stored as text | `scripts/used_market/import_carlist.py:29` | 3,886 of 14,164 rows read 1000x low | Fixed 2026-09-10 |
| 4 | Two criteria pairs are duplicates | `backend/app/services/scoring.py:86` | Price carries 41% of weight, not 17% | Fixed 2026-09-11 |
| 5 | Two criteria constant within type | `backend/app/engines/engines.py:641` | Convenience cannot separate two hybrids | Fixed 2026-09-14 |
| 6 | Seven catalog fields never read | `backend/app/engines/engines.py` | `seats`, `boot_l`, `charge_power_kw_dc` now scored | Mostly fixed 2026-09-14 |
| 7 | Min-max normalisation is outlier-led | `backend/app/engines/engines.py:771` | 5% of rows own 54% of the price axis | Fixed 2026-09-11; mirrored clipping at the dear end fixed 2026-09-14 |
| 8 | Rank reversal on irrelevant alternatives | `backend/app/engines/topsis.py:57` | Winner changes when 2 cars are removed | Fixed 2026-09-11 |
| 9 | Depreciation excluded from TCO | `backend/app/engines/engines.py:533` | Omits a cost equal to the whole counted TCO | Fixed 2026-09-14 |
| 10 | Resale assumption contradicts own data | `data/catalog_vehicles.json` | Optimistic by 24 points of purchase price | Fixed 2026-09-11 |
| 11 | Maintenance is a per-type constant | `backend/app/engines/engines.py:564` | 162 of 184 trims share three values | Fallback fixed 2026-09-14; measured coverage still 22 |
| 12 | Single winner shown for a tied field | `backend/app/routers/results.py:66` | Top 3 separated by 0.0015 | Fixed; `AnswerConfidence.tsx` ships the figure |
| 13 | No ranking regression test | `backend/tests/test_engines.py:161` | Issues 1, 2, 7 and 8 pass CI | Fixed 2026-09-11 |
| 14 | Two copies of scripts and data | `.gitignore:60`, `backend/vercel-build.sh` | Both copies are untracked build artifacts; root is canonical | Fixed 2026-09-14 |
| 15 | Used-market matcher makes bad joins | `scripts/used_market/matcher.py` | Diesel pickups matched to an electric Hilux | Fixed 2026-09-14 |
| 16 | Cost model: horizon, insurance, loan method | `backend/app/engines/engines.py:571` | Insurance overstated 2.74x, 57.6% of TCO | Fixed 2026-09-14 |
| 17 | Scoring the same token twice returns a 500 | `backend/app/routers/score.py:46` | A retried request fails instead of repeating | Fixed 2026-09-14 |
| 18 | Interview cannot express a Singapore trip | `backend/app/schemas.py:106` | A Johor buyer's commonest long trip is unsayable | Fixed 2026-09-15 |
| 19 | Annual mileage has no sanity check | `backend/app/engines/engines.py:67` | A misread of question 1 is a 5x error, silently | Fixed 2026-09-15 |
| 20 | Interview asked for the grid region it could derive | `backend/app/schemas.py:70` | A question whose answer the postcode already held | Fixed 2026-09-14 |
| 21 | Nothing tests the interface in a browser | `frontend/tests/` | A page that renders but fetches nothing passes every gate | Fixed 2026-09-15 |
| 22 | Interface accessibility defects | `frontend/app/layout.tsx:74` | Malay pages declared English; no way to switch language mid-interview | Fixed 2026-09-15 |
| 23 | Voice advisor holds a third copy of the interview script | `frontend/app/interview/voice/page.tsx:596` | Kept asking a question removed on 2026-09-14 | Fixed 2026-09-15, copy removed |
| 24 | Link previews pointed at a host the project left | `frontend/app/layout.tsx:36` | Every shared link's preview image resolved to a dead Cloudflare domain | Fixed 2026-09-15 |
| 25 | Voice Advisor needs a key the deploy guide never mentions | `frontend/app/api/live-token/route.ts:20` | Follow DEPLOYMENT.md exactly and voice is silently offline | Fixed 2026-09-15 |
| 26 | Calculators broke when used quickly | `frontend/app/calculators/page.tsx:156` | One slider drag exhausted the rate limit and blanked every panel for 47s | Fixed 2026-09-15 |

## State of play

Seventeen of twenty-two are closed. Issues 18 to 22 were found on 2026-09-14
and 2026-09-15 by using and auditing the product rather than by reading the
engine; three are closed and two remain open. Two further decisions are
judgement calls rather than defects, and are listed at the end.

**Closed 2026-09-10/11.** 1 and 2 (slider mapping), 3 (used-price corruption),
4 (duplicated money criteria), 5a (the behaviour criterion no EV could win),
7 and 8 (candidate-set-derived scales), 10 (unsourced resale figures), 13 (no
ranking regression test).

**Closed 2026-09-14.** 5b and 6 (practicality from `boot_l`, DC charge rate into
infrastructure), 9 and 16 (five-year cost model with depreciation as its primary
line), 11 (servicing fitted on price band rather than three constants), 12
(already shipping as `AnswerConfidence.tsx`; the entry was stale), 14 (stale
build copies deleted and guarded), 15 (drivetrain screen in `match_title`), 17
(idempotent `/score`), 20 (grid region derived from the postcode). Issue 7 also
gained a fix for the mirrored defect at the dear end of the axis, where 26 cars
from RM625,888 to RM2,238,888 scored within 0.0731 of each other.

**Closed 2026-09-15.** 22 (four interface accessibility defects).

**Open.** 18 and 19, both gaps in what the interview lets a buyer say, and 21,
which is why an interface that renders but does not work passes every gate here.

**A safety net that was not an issue but should have been.** `backend/.env`
points `DATABASE_URL` at the production Neon database and `app/config.py` calls
`load_dotenv()`, so `cd backend && pytest` ran the suite — fixtures that create,
seed and delete rows included — against production. `backend/tests/conftest.py`
now pins it to a temporary SQLite file before `app.config` is imported, which is
the only moment that works, because `Settings.database_url` is a class attribute
read once at import. Proven: without it the app resolves to `...neon.tech`; with
it, to `/tmp/voltpilot-pytest.db`.

Two further gaps were found on 2026-09-15 while auditing the interface and are
recorded as issues 18 and 19. Both are product decisions about the interview
rather than engine defects, which is why they are not in the seventeen above.

**Two decisions left, neither a defect:**

| Decision | The trade |
| --- | --- |
| Re-baseline `ranking_golden.json` | Seven changes have moved the ranking and the fixture still holds the pre-2026-09-14 snapshot, so four golden tests fail by design. Regenerating accepts the movement; leaving it keeps the diff reviewable, at the cost of the suite never being green |
| `MIN_CELLS_PER_MODEL` in the depreciation curve builder | Relaxing 3 to 2 takes measured depreciation from 34 models to 61, halving the degeneracy that softened winner stability. The cost is fitting a decay curve through two age points, with no redundancy to catch a bad cell |

What the engine measurably does now, against the four golden profiles in
`backend/tests/fixtures/ranking_golden.json`:

| Property | Before | After |
| --- | --- | --- |
| Alternatives reordered by removing 2 irrelevant cars | 156 of 182 | 0 of 182 |
| Worst correlation between two criteria | 0.973 | 0.51 |
| Criteria constant within a drivetrain | 2 of 6 | 0 of 5 for EVs; infrastructure only, for hybrid and PHEV |
| Insurance share of the cost criterion | 57.6 percent | 9.3 percent |
| Depreciation share of the cost criterion | 0, omitted | 67.8 percent |
| Distinct servicing values across the catalogue | 3 | 162 |
| EVs with a measured DC charge rate | 30 of 102 | 101 of 102 |
| Combustion listings joined to an EV row | 154 | 0 |
| Sliders that move their own criterion | 1 of 4 | 4 of 4 |
| Winner stable under 15 percent weight jitter | 100, 100, 99, 64 percent | 79, 72, 98, 67 percent |

The last row is the one to read carefully. It is mostly the model ceasing to be
degenerate rather than becoming worse: jitter moves the WEIGHTS, and a criterion
that is constant cannot be moved by re-weighting it, so a model with two
constants was stable by construction. The top two on `kv_home_charging` are now
separated by 0.0093, which is a genuine tie that the earlier model concealed —
the very thing issue 12 exists to report. It does mean the interface says "not a
firm answer" more often. The dials, if that trade is unwanted, are
`BOOT_FACTOR_RANGE` and the 0.75 floor in `_dc_charge_factor`.

## Reproducing these findings

Two profiles produce every number in this document. Save them as `repro.py` in `backend/` and import them from the snippets that follow:

```python
# backend/repro.py
import sys
sys.path.insert(0, ".")

PROFILE_A = {  # no budget cap: used for collinearity, rank reversal, score gaps
    "language": "en", "daily_km": 40, "trips_per_week": 5,
    "long_trip_frequency": "monthly", "long_trip_km": 300,
    "destination_region": "north", "can_charge_home": True,
    "home_postcode": "50400", "consider_solar": False, "budget_max_rm": 0,
    "grid_region": "peninsular", "monthly_electricity_bill_rm": 0,
}
PROFILE_B = dict(PROFILE_A, budget_max_rm=250_000)  # method and jitter tests
SLIDERS = {"save_money": 50, "environment": 50, "convenience": 50, "future_proofing": 50}
```

Run every snippet with the project virtualenv from the `backend/` directory:

```bash
cd backend && .venv/bin/python your_snippet.py
```

## Tier 1: defects producing wrong output today

These three change the answer for real users on the current deployment. Each is a small fix.

### 1. A preference slider set to zero is read as fifty

**Problem.** `preference_weights` normalises each slider with `float(sliders.get(k, 50) or 50)`. Zero is falsy in Python, so `0 or 50` evaluates to `50`. A slider dragged to the far left produces the same weight vector as a slider left in the middle.

**How I found it.** I swept the environment slider from 0 to 100 and printed the resulting weight vector at each stop. The value at 0 was identical to the value at 50, which is impossible for a monotonic mapping.

**Why it is an issue.** The frontend control is `min={0}` at `frontend/app/sliders/page.tsx:153`, so users reach this position. Both stops return `[0.240, 0.150, 0.130, 0.150, 0.170, 0.160]`, the untouched `BASE_WEIGHTS`. A user stating that carbon impact does not matter to them receives the recommendation of a user who is neutral on it:

```python
from repro import SLIDERS
from app.engines.topsis import preference_weights

for v in (0, 25, 50, 100):
    print(v, preference_weights(dict(SLIDERS, environment=v)))
# 0   [0.24, 0.15, 0.13, 0.15, 0.17, 0.16]   <- identical to 50
# 25  [0.273, 0.171, 0.148, 0.034, 0.193, 0.182]
# 50  [0.24, 0.15, 0.13, 0.15, 0.17, 0.16]
# 100 [0.194, 0.121, 0.105, 0.315, 0.137, 0.129]
```

**Solution.** Test for `None` rather than falsiness, so a genuine zero survives:

```python
def _slider(sliders: dict, key: str) -> float:
    """0-100 slider to a 0.0-2.0 multiplier centred on 1.0 at the midpoint."""
    raw = sliders.get(key)
    if raw is None or raw == "":
        raw = 50
    return max(0.0, min(100.0, float(raw))) / 50.0


def preference_weights(sliders: dict) -> list[float]:
    """Map the 4 sliders (0-100) onto the 6 criteria, then normalize to sum 1."""
    s = {k: _slider(sliders, k) for k in
         ("save_money", "environment", "convenience", "future_proofing")}

    w = dict(BASE_WEIGHTS)
    w["financial_score"] *= _clamp(1.0 + 0.6 * (s["save_money"] - 1)
                                   + 0.5 * (s["future_proofing"] - 1))
    w["running_cost_rm_yr"] *= _clamp(1.0 + 0.7 * (s["save_money"] - 1))
    w["purchase_price_rm"] *= _clamp(1.0 + 0.5 * (s["save_money"] - 1))
    w["energy_score"] *= _clamp(1.0 + 1.6 * (s["environment"] - 1))
    w["behaviour_score"] *= _clamp(1.0 + 0.7 * (s["convenience"] - 1))
    w["infrastructure_score"] *= _clamp(1.0 + 0.8 * (s["convenience"] - 1))

    total = sum(w.values())
    return [round(v / total, 4) for v in w.values()]
```

`_clamp` is defined in issue 2, which fixes the other half of this function.

Add a test asserting that slider 0 and slider 50 produce different vectors. See issue 13.

**Status.** Fixed 2026-09-10 in `backend/app/engines/topsis.py`. `_slider` replaces the falsiness test, and `TestWeightProperties::test_zero_slider_differs_from_midpoint` covers all four sliders.

**Do not apply this fix to the other zero-valued fields.** Three fields in this codebase accept a zero and mean different things by it, so the same `or` pattern is a defect in one and correct in the other two:

| Field | What zero means | Correct handling |
| --- | --- | --- |
| The four preference sliders | This does not matter to me, a real answer | Keep the zero. This was the defect |
| `monthly_electricity_bill_rm` | Unsure, a missing-data sentinel | `bill <= 0` falls back to the anchor rate at `engines.py:494` |
| `budget_max_rm` | Not given, a missing-data sentinel | `if budget > 0` gates the filter at `scoring.py:25` |

The interface already draws this distinction, which is the strongest evidence it is deliberate. The bill control at `frontend/app/interview/form/page.tsx:290` passes `zeroLabel={t("cf.notSure")}`, so its zero position renders to the user as “Not sure yet” rather than as RM0. The four preference sliders at `frontend/app/sliders/page.tsx:153` pass no `zeroLabel`, so their zero is an ordinary low value. The backend was honouring the first and discarding the second, and only the second needed changing. The interview script says the same thing in words, asking for the bill with “say zero if unsure” at `schemas.py:80`, so a zero there is an absent reading rather than a household that consumes nothing. Rewriting `float(profile.get("monthly_electricity_bill_rm") or 0)` to preserve the zero the way `_slider` does would turn every “unsure” answer into a household drawing 0 kWh, drop the tier-2 uplift, and understate the running cost of every battery EV for those users. The measured rates are RM0.4986/kWh on the anchor path against RM0.6500/kWh once a heavy household crosses the 600 kWh threshold.

### 2. Sliders between 1 and 18 produce negative TOPSIS weights

**Problem.** The slider multipliers are unbounded linear maps. `w["energy_score"] *= 1.0 + 1.6 * (s - 1)` at `topsis.py:49` crosses zero at `s = 0.375`, which is slider position 18.75. Every position from 1 to 18 yields a negative weight on the carbon criterion. `w["financial_score"]` at `topsis.py:46` sums two multipliers and goes negative when `save_money` and `future_proofing` both sit below roughly 5.

**How I found it.** The sweep in issue 1 printed the full weight vector, not only the sum. Positions 1, 2 and 10 carried a negative fourth element. `pymcdm` confirmed it with a runtime warning: `Weights should be positive and its sum should be equal one`.

**Why it is an issue.** TOPSIS derives its positive and negative ideal solutions from the weighted normalised matrix. A negative weight swaps which end of that column counts as ideal, so the carbon criterion starts rewarding the highest-emitting car. 18 of the 101 integer positions on the environment track, 18% of its travel, sit in this range:

```python
from repro import SLIDERS
from app.engines.topsis import preference_weights

bad = [v for v in range(101) if preference_weights(dict(SLIDERS, environment=v))[3] < 0]
print(bad[0], bad[-1], len(bad))            # 1 18 18
print(preference_weights(dict(SLIDERS, environment=10)))
# [0.297, 0.1856, 0.1609, -0.052, 0.2104, 0.198]
```

The existing guard at `backend/tests/test_engines.py:161` checks only that the weights sum to 1. That holds with a negative component present, so the test passes. It also picks slider values 80, 80, 20 and 20, all above the threshold.

**Solution.** Clamp each multiplier at zero before it reaches the weight, and assert positivity where the vector is built. Add both helpers to `topsis.py`:

```python
def _clamp(multiplier: float) -> float:
    """Slider multipliers scale a weight; they must never invert it."""
    return max(0.0, multiplier)
```

A weight of exactly zero is meaningful: it removes the criterion from consideration, which is what a slider at the far left should express. Guard the output as well, so a future edit to the coefficients cannot reintroduce the bug silently:

```python
    total = sum(w.values())
    weights = [round(v / total, 4) for v in w.values()]
    assert all(x >= 0 for x in weights), f"negative weight: {weights}"
    return weights
```

Those four lines replace the closing two lines of `preference_weights` shown in issue 1.

Prefer a normalised direct mapping over these hand-tuned coefficients if you revisit the model. Ask the user to distribute 100 points across the four concerns, then map points to criteria weights by a fixed non-negative matrix. That construction cannot produce a negative weight, and it makes the tradeoff visible to the user.

**Status.** Fixed 2026-09-10. `_clamp` floors each multiplier at `MIN_MULTIPLIER`, and the returned weights are floored at 0.0001 because `round(1e-7, 4)` returns exactly 0.0 and pymcdm rejects that too (`np.any(weights <= 0)` in `validators.py:584`). `test_weights_never_negative` sweeps all four sliders across 0 to 100 and requires every weight to be strictly positive; a scoring run across 44 slider settings now emits zero pymcdm warnings.

One consequence to note: because the multiplier clamps, environment positions 0 through 18 all produce the same floored energy weight. The response stays monotonic but is flat across that span. Replacing the linear maps with a power form (`s ** c`, which reaches 0 only at slider 0) would remove the plateau, at the cost of changing the weight curve everywhere. That belongs with issue 4’s re-tuning, not here.

### 3. The carlist importer writes used prices as text, corrupting 27.4% of the corpus

**Problem.** `import_carlist.py:29` passes the scraped price straight through as `"price_rm": r.get("price")`. Carlist supplies it as a formatted string such as `'79,800'`. The `listings.price_rm` column is declared `REAL` at `scripts/used_market/db.py:27`, but the table is not `STRICT`, so SQLite stores the string unchanged under its dynamic typing rules.

**How I found it.** I computed retained value per model year by dividing mean used listing price by catalog new price. A one-year-old BYD Atto 3 returned 0.1% retained value. The join was correct, so I checked `typeof(price_rm)` per source and found one source storing text.

**Why it is an issue.** Any numeric operation coerces `'79,800'` to `79`, because SQLite parses the longest valid numeric prefix and stops at the comma. Every average, sum, comparison and `ORDER BY` over the affected rows is wrong by three orders of magnitude:

```sql
SELECT source, typeof(price_rm) AS t, COUNT(*)
FROM listings GROUP BY source, t;
-- autoselection|real|502     carlist|null|35      carlist|text|3886
-- caricarz|real|1211         carro|real|1171      carsome|real|3455
-- mudah|real|3904
```

3,886 of 14,164 rows, 27.4% of the corpus, are affected. `scripts/used_market/scrape_mudah.py:59` does the coercion correctly with `float(price)`, and `import_carsome.py:28` reads an already-numeric JSON field, which is why only this one source is damaged. The corruption blocks issue 9, because the depreciation curve has to be fitted on these prices.

**Solution.** Parse at the import boundary, enforce the type at the storage boundary, and backfill the existing rows. First, the parser:

```python
def parse_price(raw) -> float | None:
    """Carlist reports 'RM 79,800' and '79,800'; both must land as 79800.0."""
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    cleaned = str(raw).replace("RM", "").replace(",", "").strip()
    try:
        value = float(cleaned)
    except ValueError:
        return None
    return value if value > 0 else None
```

Call it at `import_carlist.py:29` with `"price_rm": parse_price(r.get("price"))`. Then stop the class of bug at the schema by recreating the table as `STRICT`, which rejects a text write into a `REAL` column instead of accepting it:

```sql
CREATE TABLE listings_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    source_id TEXT,
    vehicle_id TEXT,
    title TEXT NOT NULL,
    price_rm REAL,
    year INTEGER,
    mileage_km INTEGER,
    variant TEXT,
    fuel_type TEXT,
    transmission TEXT,
    location TEXT,
    url TEXT,
    fetched_at TEXT NOT NULL,
    run_id INTEGER,
    raw TEXT,
    UNIQUE(source, source_id)
) STRICT;
```

Backfill the 3,886 damaged rows in place before swapping the tables:

```sql
UPDATE listings
SET price_rm = CAST(REPLACE(REPLACE(price_rm, 'RM', ''), ',', '') AS REAL)
WHERE typeof(price_rm) = 'text';

DELETE FROM listings WHERE price_rm IS NOT NULL AND price_rm < 1000;
```

The `DELETE` removes rows whose text was unrecoverable. Verify the repair by re-running the retained-value query from issue 10 and checking that no age-1 cell falls below 45%.

**Status.** Fixed 2026-09-10, with two deviations from the plan above.

`parse_price` went into `scripts/used_market/db.py` and is applied inside `upsert_listing` rather than in the one importer. That is the single choke point every source passes through, so no future importer can reintroduce the bug; the other five sources stayed clean by luck, not by design. All three tables are now declared `STRICT`, which makes SQLite raise `cannot store TEXT value in REAL column listings.price_rm` instead of accepting the write.

The repair ran through `scripts/used_market/migrate_strict.py`, which reuses `parse_price` rather than restating the rule in SQL, verifies row counts before and after, and is idempotent. It repaired 3,886 rows in each of the two database copies described in issue 14. No row was unrecoverable, so the `DELETE` was not needed. Coverage is `test_parse_price_coerces_or_rejects` (12 cases) and `test_strict_schema_rejects_a_formatted_price`, which replays the original carlist write against the new schema.

## Tier 2: the six criteria are not six independent criteria

TOPSIS assumes the criteria are preferentially independent. Three of the four issues in this tier break that assumption, and the fourth leaves usable signal on the floor. Together they explain why the sliders move the ranking less than the interface implies.

### 4. Two criteria pairs are near-perfect duplicates, so price carries 41% of the weight

**Problem.** `financial_score` is a min-max inversion of `tco_excluding_rm`, and three of that figure’s five components scale with purchase price: loan interest runs on `price` minus a 10% deposit, insurance falls back to `price * 0.015` at `engines.py:580`, and opportunity cost is computed on the deposit at `engines.py:587`. Criterion 1 is therefore a restatement of criterion 5. Separately, `energy_score` is annual CO2 and `running_cost_rm_yr` is annual energy spend, and both are the same physical consumption multiplied by a near-identical constant.

**How I found it.** I built the scoring matrix for `PROFILE_A` and computed the Pearson correlation across all 184 ranked rows.

**Why it is an issue.** The correlations are not merely high, they are almost total:

| Criterion pair | Pearson r |
| --- | --- |
| `financial_score` and `purchase_price_rm` | -0.997 |
| `energy_score` and `running_cost_rm_yr` | -1.000 |
| `behaviour_score` and `infrastructure_score` | -0.883 |

```python
import numpy as np
from repro import PROFILE_A, SLIDERS
from app.services import scoring
from app.engines.topsis import CRITERIA

rows = scoring.score_catalog(PROFILE_A, SLIDERS)["ranking"]
m = np.array([[float(r[c]) for c in CRITERIA] for r in rows])
c = np.corrcoef(m.T)
print(round(c[0][4], 3), round(c[3][5], 3))   # -0.997 -1.0
```

Weighting a duplicated pair as two criteria doubles its influence. Purchase price nominally carries `BASE_WEIGHTS["purchase_price_rm"]` of 0.17, but with `financial_score` at 0.24 its real weight is 0.41. Energy consumption carries 0.31 rather than 0.15 or 0.16. This is also why the environment slider barely moves the result: raising `energy_score` from 0.034 to 0.315 shifts weight between two measurements of the same quantity, so the ranking hardly responds. Mean CO2 of the top 5 moves from 944 to 898 kg/yr across the entire slider travel.

**Solution.** Pick one of two approaches. The direct fix is to make `financial_score` a genuine residual by removing the price-proportional components it shares with `purchase_price_rm`, leaving road tax, maintenance and the fixed part of insurance. Where the catalog carries a measured `insurance_rm_yr`, which it does for all 184 rows, use it rather than the `price * 0.015` fallback, since the measured figure carries underwriting signal the price does not.

The alternative is to keep the criteria and let the weighting absorb the correlation. CRITIC weights, available as `pymcdm.weights.critic_weights`, discount a criterion in proportion to how well other criteria already explain it:

```python
import numpy as np
from pymcdm.weights import critic_weights
from repro import PROFILE_A, SLIDERS
from app.services import scoring
from app.engines.topsis import CRITERIA, preference_weights

rows = scoring.score_catalog(PROFILE_A, SLIDERS)["ranking"]
m = np.array([[float(r[c]) for c in CRITERIA] for r in rows])
objective = critic_weights(m)
subjective = np.array(preference_weights(SLIDERS))
blended = 0.5 * objective + 0.5 * subjective
print(dict(zip(CRITERIA, blended.round(3))))
```

**Status.** Fixed 2026-09-11, and only half of what this issue claimed was real.

**`co2_kg_yr` and `running_cost_rm_yr` are NOT duplicates.** They read +0.999 for a Peninsular buyer with home charging by coincidence: Malaysian electricity and petrol cost almost exactly the same per kg of CO2, 0.877 against 0.862 RM/kg. Re-measured across profiles the correlation collapses and inverts, reaching **-0.383** in East Malaysia without home charging, where the hydro-heavy grid makes an EV clean but public DC charging makes it expensive to run. Merging them would have destroyed real information for exactly the buyers the engine served worst. The original write-up was wrong to group these with the money pair.

**The money criteria were a genuine duplication**, stable at +0.90 to +0.98 across every profile, because `purchase_price_rm`, `tco_excluding_rm` and ten years of `running_cost_rm_yr` are additive parts of one figure: RM35,188 + RM67,800 + RM7,570 = RM110,558. Weighted 0.24 + 0.17 + 0.16, money carried **57% of the decision** by accident.

They are now one criterion, `total_cost_10yr_rm`. Keeping fixed and running costs apart was tested and rejected: it is a distinction the interface cannot express, since the sliders are money, environment, convenience and future-proofing, with no upfront-versus-ongoing control. The worst correlation between any two criteria fell from **0.973 to 0.24-0.51** on three of the four golden profiles. The 0.93 remaining on `east_no_charging` is `behaviour_score` against `infrastructure_score`, both constant within drivetrain there, which is issue 5b and not this issue.

**Merging exposed that the fourth slider was decorative.** `future_proofing` drove only the TCO criterion, which correlates 0.97 with purchase price, so a control labelled ”Future-Proofing & Resale” made the engine marginally more price-sensitive: its full travel from 0 to 100 moved the top-5 mean price by **RM20** and swapped two adjacent positions. The frontend hint promises ”brand equity, battery thermal management, and 5-year used market resale retention” and the engine had no resale path at all. It now drives `resale_retained_pct`, and the same sweep moves top-5 mean retention from 43.8% to 51.0%, putting a measured Toyota Vios at rank 1.

`BASE_WEIGHTS` was re-tuned for the five remaining criteria. Cost and resale total 0.50, which is now a chosen figure rather than an artifact of splitting a sum three ways.

Blending keeps the user’s stated preference while stopping a duplicated pair from counting twice. Apply it only after issue 5 is fixed. Run against the current matrix it returns `infrastructure_score` 0.326, the largest of the six, because CRITIC rewards a criterion for being uncorrelated with the others and that criterion is a two-valued step function rather than a measurement. Correlation-aware weighting cannot distinguish independent from degenerate.

Re-tune `BASE_WEIGHTS` after whichever route you take, because the current values were chosen against the inflated effective weights.

### 5. The behaviour and infrastructure criteria are constant within every vehicle type

**Problem.** `behaviour_engine` returns the literal `90.0` for every vehicle that is not a battery EV at `engines.py:641`. `infrastructure_engine` is a function of the user’s postcode and vehicle type only, returning `corridor` for EVs and `corridor * 0.55 + 30` for everything else at `engines.py:666`. Neither reads any per-vehicle attribute except `type`.

**How I found it.** I grouped the scoring matrix by vehicle type and took the standard deviation of each criterion within each group.

**Why it is an issue.** A criterion with zero variance inside a group cannot rank the members of that group. Measured on `PROFILE_A`:

| Criterion | EV, n=102 | Hybrid, n=57 | PHEV, n=25 |
| --- | --- | --- | --- |
| `financial_score` | 10.9 | 20.5 | 20.6 |
| `behaviour_score` | 9.6 | 0.0 | 0.0 |
| `infrastructure_score` | 0.0 | 0.0 | 0.0 |
| `energy_score` | 11.1 | 22.7 | 11.4 |

The convenience slider drives both of these criteria and nothing else. It therefore cannot express a preference between two hybrids, or between two EVs. It acts as a single tilt lever between EV and non-EV wearing the appearance of a per-car score. A user shortlisting hybrids is ranked on four criteria, two of which are the duplicated pair from issue 4, leaving three independent signals.

```python
import numpy as np
from repro import PROFILE_A, SLIDERS
from app.services import scoring

rows = scoring.score_catalog(PROFILE_A, SLIDERS)["ranking"]
for t in ("ev", "hybrid", "phev"):
    sub = [r for r in rows if r["type"] == t]
    print(t, len(sub), round(float(np.std([r["infrastructure_score"] for r in sub])), 3))
# ev 102 0.0 / hybrid 57 0.0 / phev 25 0.0
```

**Status.** This issue was two things wearing one number, and only the bug half is done.

**5a, the bug, fixed 2026-09-11.** `behaviour_engine` could not be satisfied by any real car. `range_fit` was `range / needed / 2.5`, demanding 2.5x the longest trip in range: 912 km for the Klang Valley profile, against a catalogue whose longest-range EV reaches 782 km. It then deducted the same long trip twice more through `road_penalty` and `stops_penalty`. Measured before the fix: **0 of 102 EVs** could reach `range_fit` 1.0, and **0 of 102** could out-score the flat 90.0 given to every hybrid, for any buyer. The criterion could only ever say ”buy a hybrid”. It also scored home charging as a deficit, when starting full every morning and never visiting a station is the largest day-to-day advantage an EV has.

The rewrite separates the daily and long-trip terms, charges the long trip once as the stops it forces, and measures each drivetrain against the driver:

| Profile | EVs beating a hybrid, before | after |
| --- | --- | --- |
| 40 km/day, home charging | 0 of 102 | 100 of 102 |
| 120 km/day, home charging, weekly trips | 0 of 102 | 46 of 102 |
| 40 km/day, no home charging | 0 of 102 | 0 of 102 |

The last row matters as much as the first: without a home charger, hybrids still win every time. PHEVs are scored properly for the first time, taking their daily fit from electric range and paying no charging stop on a long trip, floored at the hybrid value because a PHEV nobody charges is exactly a hybrid.

`HYBRID_CONVENIENCE` is 88, and it is a judgement call rather than a measurement. It is not load-bearing: sweeping it from 70 to 95 leaves the top 5 unchanged on all four golden profiles, because the profile-derived bounds from issue 7 let price and running cost discriminate properly. A physically derived alternative was prototyped and rejected, see below.

**5b, the feature, still open.** Scoring practicality from `seats` and `boot_l`, and folding `charge_power_kw_dc` into the infrastructure criterion, are unbuilt. `infrastructure_engine` remains constant within each drivetrain.

**Rejected: a fuelling-hours model.** Replacing the 0-100 score with hours per year spent fuelling away from home would have removed the constant entirely. The catalogue cannot support it: `fuel_tank_l` is absent for all 184 trims and `charge_power_kw_dc` is present for 30. Built on assumed tank sizes and charge rates it produced 12.0 EV hours per year against 1.9 for a hybrid, by counting every 30-minute motorway stop as pure loss while ignoring that the hybrid driver also stops on a 730 km round trip. Four assumptions instead of one, and a harder swing toward hybrids. An honest constant beats dressed-up physics.

**Solution.** Give both engines per-vehicle inputs. For `behaviour_engine`, the hybrid branch should score practicality rather than return a constant, using the `seats` and `boot_l` fields the catalog already carries against the household size the interview could capture. For `infrastructure_engine`, an EV’s ability to use a corridor depends on how fast it charges, so fold in `specs.charge_power_kw_dc`:

```python
def _dc_charge_factor(vehicle: dict) -> float:
    """0.75 at 50 kW to 1.0 at 150 kW and above: how well the car uses a corridor."""
    if vehicle.get("type") != "ev":
        return 1.0
    dc = float((vehicle.get("specs") or {}).get("charge_power_kw_dc") or 50.0)
    return max(0.75, min(1.0, 0.75 + (dc - 50.0) / 400.0))
```

Multiply the EV branch of `infrastructure_engine` by this factor. A 50 kW car and a 250 kW car face the same charger gaps but not the same trip, and the current model scores them identically.

**Status, 5b. Fixed 2026-09-14.** `behaviour_engine` is now a wrapper: the old
body became `_fuelling_convenience`, and the result is multiplied by a
`practicality_factor`. Multiplied rather than averaged because a car that cannot
be kept charged does not become convenient for having a big boot.

Practicality is applied to every drivetrain rather than only the hybrid branch,
so it discriminates inside each group instead of tilting between them. Measured
within-type standard deviation of `behaviour_score` on the Klang Valley profile:
hybrid **0.0 -> 3.8**, PHEV **0.0 -> 3.5**.

**Deviation: `boot_l` is scored, `seats` is not.** The solution above scores both
"against the household size the interview could capture". A `household_size`
question was built and then removed the same day: the interview is eleven
questions and lengthening it for one sub-term is the wrong trade, so it stays at
eleven. Boot volume needs no answer — it is scored against fixed 300 to 600
litre bounds, which span p25 to p75 of the catalogue — and that alone removes
the degeneracy this issue is about.

Seat count deliberately does NOT enter the score. How many seats a buyer needs
cannot be inferred from the rest of the interview, and scoring it blind would
rank a seven-seat MPV above a hatchback for a solo commuter. It is a **filter on
the results page** instead, alongside the existing body and brand filters: a
buyer who needs seven seats picks "7+ seats" and sees only those, which answers
the same need without asking anyone an extra question. The filter offers only
values present in the ranking, so it can never return nothing.

`infrastructure_score` remains constant within hybrid and PHEV. That one is
inherent rather than a defect: it scores charging infrastructure, and
`charge_power_kw_dc` is an EV-only figure. EVs vary (std 8.9).

**Data.** `seats` went 113 -> **184 of 184** and `boot_l` 100 -> **172**, swept
from paultan.org spec tables the same way as the DC charge rates, with the last
five rows confirmed individually against manufacturer specifications. Complete
seat coverage is what makes the filter trustworthy: no row is hidden or shown on
missing data.

### 6. Seven catalog fields the interview implies are scored are never read

**Problem.** The catalog carries per-trim attributes that no engine references. `seats`, `boot_l`, `charge_power_kw_dc`, `charge_power_kw_ac`, `motor_kw`, `warranty_battery_yrs`, `popularity_rating`, `ckd` and `resale_10yr_pct` all appear in `data/catalog_vehicles.json` and appear nowhere in `engines.py` or `scoring.py`.

**How I found it.** I counted references to each spec key across both scoring modules.

**Why it is an issue.** Only `range_km` and `battery_kwh` reach the ranking, so two trims that differ in boot space, seat count, charging speed, motor output and battery warranty score identically on every criterion except price and consumption:

```bash
cd backend
for f in seats boot_l charge_power_kw_dc motor_kw warranty_battery_yrs \
         popularity_rating ckd resale_10yr_pct range_km battery_kwh; do
  printf '%-22s %s\n' "$f" \
    "$(grep -ho "$f" app/engines/engines.py app/services/scoring.py | wc -l)"
done
# range_km 12, battery_kwh 1, every other field 0
```

This compounds issue 5: the criteria that could carry per-vehicle detail have no per-vehicle detail to carry.

**Solution.** Route each field to the criterion it belongs to. `boot_l` and `seats` belong in the behaviour criterion as a practicality term. `charge_power_kw_dc` belongs in infrastructure, as shown in issue 5. `warranty_battery_yrs` belongs in the financial criterion, because a battery still under warranty at year 8 removes a tail risk the TCO currently prices at zero. `resale_10yr_pct` belongs in depreciation, which issue 9 covers. Leave `popularity_rating` out of the score: it measures what other people bought, not what fits this buyer, and adding it would make the ranking self-reinforcing.

**Status.** Open, and re-counted 2026-09-11. `resale_10yr_pct` has left the list because it was deleted from the catalogue rather than wired in, see issue 10; the fitted curve in `data/depreciation_curve.json` replaced it. Eight fields are still read by nothing:

```bash
cd backend
for f in seats boot_l charge_power_kw_dc charge_power_kw_ac motor_kw \
         popularity_rating ckd warranty_battery_yrs; do
  printf '%-24s %s\n' "$f" \
    "$(grep -ho "$f" app/engines/engines.py app/services/scoring.py | wc -l)"
done
# every one returns 0
```

This is what keeps `infrastructure_score` constant within each drivetrain, and that degeneracy is now the largest remaining source of instability: it is why `bev_gate_blocked` is the one profile whose winner still moves under weight jitter, in issue 12.

## Tier 3: normalisation makes the ranking depend on cars nobody would buy

Both issues in this tier share one root cause: every scale in the pipeline is derived from the observed candidate set rather than from the domain. Cars that no buyer would consider still set the scale that every other car is measured against.

### 7. Min-max normalisation hands 54% of the price axis to 5% of the catalog

**Problem.** `normalize_cost_scores` at `engines.py:771` maps each raw cost onto 0 to 100 using the observed minimum and maximum. `pymcdm.methods.TOPSIS` then applies min-max again over the same column. Both scales are set by the two extreme rows in the candidate set.

**How I found it.** I took the price distribution of the full catalog and computed where representative prices land on the normalised axis.

**Why it is an issue.** The catalog spans RM67,800 to RM2,238,888. The 95th percentile is RM1,075,538, so the top 5% of rows occupy 54% of the normalised range and the remaining 95% are compressed into the other 46%:

| Purchase price | Position on the 0 to 1 price axis |
| --- | --- |
| RM67,800 | 1.000 |
| RM150,000 | 0.962 |
| RM300,000 | 0.893 |
| RM648,888 | 0.732 |

A Perodua and a RM300,000 BMW sit 0.107 apart on the criterion meant to represent affordability. With `PROFILE_A` and no budget cap, the engine returns Mercedes-Benz EQE, Volvo ES90, BMW iX3 and BMW iX as ranks 1 to 4, and a RM648,888 EQS at rank 10:

```python
from repro import PROFILE_A, SLIDERS
from app.services import scoring

for r in scoring.score_catalog(PROFILE_A, SLIDERS)["ranking"][:5]:
    print(r["rank"], r["slug"], f'RM{r["price_rm"]:,.0f}', r["topsis_score"])
# 1 mercedes-benz-eqe RM379,888 0.8752
# 2 volvo-es90 RM339,888 0.8737
# 3 bmw-ix3 RM378,800 0.8736
# 4 bmw-ix RM425,800 0.8567
# 5 byd-m6 RM109,800 0.8427
```

The budget filter at `scoring.py:25` masks this whenever a user supplies a budget, which is why it has not surfaced. `budget_max_rm` defaults to 0 at `backend/app/schemas.py:119` and is excluded from the required list at `backend/app/schemas.py:133`, so a user who skips it gets the compressed axis.

**Solution.** Normalise against fixed domain bounds rather than the observed set. The bounds express what the Malaysian market actually spans, so they do not move when the candidate set changes:

```python
# backend/app/engines/topsis.py
CRITERIA_BOUNDS = {
    "financial_score": (0.0, 100.0),
    "behaviour_score": (0.0, 100.0),
    "infrastructure_score": (0.0, 100.0),
    "energy_score": (0.0, 100.0),
    "purchase_price_rm": (50_000.0, 500_000.0),
    "running_cost_rm_yr": (0.0, 12_000.0),
}
```

Clip each value into its band before scoring, so a RM2.2m outlier reads as the top of the band instead of redefining it. If you would rather keep data-derived scales, winsorize each column at its 5th and 95th percentiles inside `normalize_cost_scores`, which costs three lines and removes most of the distortion. Fixed bounds are the stronger fix because they also resolve issue 8.

**Status.** Fixed 2026-09-11, but **not** with the catalogue-wide bounds proposed above. Testing that design against the golden profiles killed it: a buyer capped at RM120k has candidates spanning RM67,800 to RM119,900, which is **5.3%** of a RM85,604 to RM1,075,538 axis. It would have moved the squashing from ”a Rolls-Royce sets the scale” to ”the global bound sets the scale”, and made price stop discriminating for exactly the buyers most sensitive to it.

`criteria_bounds` in `backend/app/engines/topsis.py` derives every bound from a **profile** input instead. Budget and annual mileage are things the buyer told us, so they cannot be moved by adding or removing a car, which is what makes the scale stable; and they are calibrated to this buyer, which is what makes it discriminate:

| Criterion | Bound | Basis |
| --- | --- | --- |
| `purchase_price_rm` | RM30,000 to their budget | Market floor to their stated cap |
| `tco_excluding_rm` | 0 to 0.70 x budget | Highest observed ratio in the catalogue is 0.67 |
| `running_cost_rm_yr` | 0 to RM0.33/km x annual km | Dearest observed is RM0.324/km |
| `co2_kg_yr` | 0 to 0.23 kg/km x annual km | Dirtiest observed is 0.226 kg/km |

The multipliers are calibrated so no real vehicle clips. Measured price-axis usage across the four golden profiles rose from an effective 5 to 18 percent to **70 to 92 percent**, with zero values clipped. Tighter bounds were tried and rejected: they clipped 59 values and reintroduced 2 reversals through tie-breaking.

Two of the six criteria also changed identity. `financial_score` and `energy_score` were produced by `normalize_cost_scores`, which min-maxes over the candidate set, so as criteria they carried the set-dependence the bounds exist to remove. The ranking now scores the raw `tco_excluding_rm` and `co2_kg_yr`. Both derived scores are still published for the results page and the analyst; they are no longer criteria.

### 8. Removing two irrelevant cars changes the winner and moves 156 of 182 ranks

**Problem.** TOPSIS measures each alternative against the best and worst values present in the candidate set. Those reference points move whenever the set changes, so adding or removing an unrelated alternative can reorder two others. This is the documented rank reversal pathology, and the budget filter and battery-EV feasibility gate at `scoring.py:25` and `scoring.py:39` both change the candidate set on every request.

**How I found it.** I ranked the full catalog, removed the two cars priced at or above RM2,000,000, re-ranked, and compared the position of every surviving car.

**Why it is an issue.** Two cars that no user of this product would buy are load-bearing for the recommendation given to everyone else:

```python
import app.services.scoring as sc
from repro import PROFILE_A, SLIDERS
from app.config import load_catalog

before = [r["slug"] for r in sc.score_catalog(PROFILE_A, SLIDERS)["ranking"]]
full = load_catalog()
sc.load_catalog = lambda: [v for v in full if float(v["price_rm"]) < 2_000_000]
after = [r["slug"] for r in sc.score_catalog(PROFILE_A, SLIDERS)["ranking"]]
sc.load_catalog = load_catalog

common = [s for s in before if s in set(after)]
moved = sum(1 for s in common if common.index(s) != after.index(s))
print(before[0], after[0], moved, len(common))
# mercedes-benz-eqe volvo-es90 156 182
```

The winner changes from Mercedes-Benz EQE to Volvo ES90, and 156 of the 182 surviving cars change position. A user who raises their budget from RM400,000 to RM500,000 can see their existing recommendation reorder for reasons unconnected to the cars they were shown.

**Solution.** Fixed bounds from issue 7 remove most of this, because the ideal and anti-ideal stop depending on which rows are present. For a guarantee rather than a mitigation, switch to SPOTIS, which takes explicit bounds and is rank-reversal free by construction:

```python
import numpy as np
from pymcdm.methods import SPOTIS
from app.engines.topsis import CRITERIA, TYPES, CRITERIA_BOUNDS

def run_spotis(matrix_rows: list[dict], weights: list[float]) -> list[dict]:
    """Rank-reversal-free alternative to run_topsis; lower preference is better."""
    matrix = np.array([[float(r[c]) for c in CRITERIA] for r in matrix_rows])
    bounds = np.array([CRITERIA_BOUNDS[c] for c in CRITERIA])
    preference = SPOTIS(bounds)(matrix, np.array(weights), np.array(TYPES))
    order = np.argsort(preference)
    out = []
    for position, index in enumerate(order, start=1):
        row = dict(matrix_rows[int(index)])
        row["rank"] = position
        row["topsis_score"] = round(1.0 - float(preference[index]), 4)
        out.append(row)
    return out
```

Whichever route you take, verify it with the snippet above. A fixed-bounds implementation should move fewer than 5 cars, not 156.

That check is in the suite as `test_ranking_survives_removal_of_irrelevant_alternatives`.

**Status.** Fixed 2026-09-11, together with issue 7, and neither `pymcdm.TOPSIS` nor SPOTIS is used.

The first attempt fixed only the normalisation and still moved **116 of 182**, because the reversal was arriving upstream: `normalize_cost_scores` rebuilt `financial_score` and `energy_score` from the candidate set on every request, so those columns changed for every car before TOPSIS saw them. Scoring the raw quantities was the part that mattered.

`run_topsis` now does the arithmetic directly, because `pymcdm.TOPSIS` reads its ideal point off the matrix and would reintroduce the dependence. It is still TOPSIS, still `Ci = D-/(D+ + D-)`, but both the normalisation and the ideal come from `criteria_bounds`. SPOTIS was evaluated as the formally rank-reversal-free alternative: it scored identically at 0 of 182 and agreed with bounded TOPSIS on 3 to 5 of each top 5, so it offered nothing to justify inverting the score’s meaning for the frontend and the analyst.

Measured after the fix: removing the two cars priced at or above RM2m moves **0 of 182** alternatives, down from 156, and the winner holds. `test_ranking_survives_removal_of_irrelevant_alternatives` went `XPASS(strict)` on the change, which is the marker doing its job, and is now a plain passing test asserting 5 or fewer moves. Scoring also got marginally faster, 2.7 ms to 2.3 ms, from dropping pymcdm’s normalisation pass.

## Tier 4: the largest ownership cost is absent from the cost model

The financial engine prices loan interest, insurance, maintenance, opportunity cost and road tax. It does not price depreciation, which for a Malaysian buyer exceeds all five combined. The three issues here cover the omission, the assumption that would fill it, and the input coverage that undermines what is already counted.

### 9. Depreciation, the largest ownership cost, is excluded from the financial engine

**Problem.** `financial_tco_excluding` at `engines.py:571` computes a 10-year total excluding purchase price and running cost. The comment at `engines.py:533` records that resale value was set aside on 2026-08-14. The catalog carries `ownership.resale_10yr_pct` for 22 trims, and no engine reads it.

**How I found it.** I compared the depreciation implied by `resale_10yr_pct` against the TCO the engine does compute, for the trims that carry the field.

**Why it is an issue.** For the two trims I could price against measured resale data, depreciation alone matches or exceeds the entire counted TCO:

| Trim | Counted 10-year TCO | Depreciation over 10 years |
| --- | --- | --- |
| `proton-emas-5` | RM49,716 | RM53,892 |
| `tesla-model-3` | RM69,772 | RM67,050 |

Excluding it does not merely understate every total by a constant. Depreciation rates differ sharply between EV and hybrid, so the omission removes the single strongest discriminator in the EV versus hybrid decision this product exists to make. The engine currently treats a car that retains 55% of its value and one that retains 25% as financially identical.

```python
from app.config import load_catalog
from app.engines import engines

for slug in ("proton-emas-5", "tesla-model-3"):
    v = next(x for x in load_catalog() if x["id"] == slug)
    tco = engines.financial_tco_excluding(v)["tco_excluding_rm"]
    pct = float(v["ownership"]["resale_10yr_pct"])
    dep = float(v["price_rm"]) * (1 - pct / 100)
    print(slug, tco, round(dep), f"{dep / tco:.2f}x")
# proton-emas-5 49716.0 53892 1.08x
# tesla-model-3 69772.0 67050 0.96x
```

**Solution.** Add depreciation as a sixth TCO component, fitted per vehicle type and age from the used-market data rather than taken from a per-trim constant. Issue 3 has to land first, because the fit runs on `listings.price_rm`. Add to `engines.py`:

```python
def depreciation_10yr_rm(vehicle: dict, retained_by_type: dict[str, float]) -> float:
    """Value lost over 10 years. Per-trim measurement wins; type curve is the fallback."""
    price = float(vehicle["price_rm"])
    measured = (vehicle.get("ownership") or {}).get("resale_10yr_pct")
    if measured:
        return price * (1 - float(measured) / 100)
    retained = retained_by_type.get(vehicle.get("type", ""), 0.30)
    return price * (1 - retained)
```

Add the result to `total` in `financial_tco_excluding` and expose it in the returned `components` dict so the results page and the analyst can cite it. Rename the function, since it no longer excludes only price and running cost.

Note that this makes `financial_score` scale with price even more strongly than issue 4 already describes, because depreciation is close to proportional to purchase price. Fix issue 4 in the same change, or the price criterion will carry more than half the total weight.

**Status.** Partly fixed 2026-09-11. Resale is now a criterion; depreciation is still not a cost line.

**Ten-year resale does not exist and cannot be obtained.** Malaysia’s first mass-market EVs arrived around 2021, so no drivetrain in this catalogue has a matched listing older than age 5, and the insurer valuations are shallower still, with 215 EV rows at age 1 and 3 at age 2. Ten-year depth exists only for petrol cars absent from the catalogue. Any ten-year EV figure would be fabricated, which is what the removed `resale_10yr_pct` values already were.

`scripts/used_market/build_depreciation_curve.py` fits a **five-year** horizon, matching both the data and the frontend’s own wording. The signal is decision-relevant and central to this product:

| Drivetrain | Decay per year | Retained at 5 years | Listings |
| --- | --- | --- | --- |
| Hybrid | 0.1390 | 49.9% | 1,979 |
| EV | 0.1722 | 42.3% | 1,462 |
| PHEV | 0.1930 | 38.1% | 264 |

Per-model curves are fitted where the evidence supports them and shrunk toward the type curve by 40 notional listings, so three model-years cannot assert that a Tesla depreciates at exactly zero. 22 of 184 trims are measured, the rest carry their drivetrain average, and `resale_basis` is published per row so the results page can say which. Measured values range from Toyota Vios at 61.7% to Chery Tiggo 8 at 38.3%, which matches how the Malaysian market actually treats those brands.

**Still open:** depreciation as a cost. `total_cost_10yr_rm` remains purchase plus ownership plus ten years of running, with no resale subtracted, because a five-year resale figure cannot be subtracted coherently from a ten-year cost. Closing that needs a horizon decision: either shorten the cost model to five years, which matches the data and typical Malaysian ownership, or wait for the market to produce ten-year evidence around 2031.

### 10. The catalog resale assumption is 24 points more optimistic than your own valuation data

**Problem.** The 22 trims carrying `resale_10yr_pct` average 50.2% retained at 10 years, ranging from 44% to 57%. The `valuations` table in `data/used_market.db` holds 5,968 rows of insurer valuation data with both a new price and a residual, and its 10-year cohort retains 25.8%.

**How I found it.** I aggregated `wm_rrr / wm_new_pr` by model year across the valuations table and compared the age-10 cohort against the catalog assumption.

**Why it is an issue.** The gap is 24 points of purchase price, applied to the cost component that issue 9 shows is the largest single item. On a RM150,000 car that is RM36,000 of unmodelled cost:

| Vehicle age | Retained value, valuations table | Rows |
| --- | --- | --- |
| 1 year | 84.5% | 1,133 |
| 5 years | 56.8% | 128 |
| 8 years | 38.1% | 109 |
| 10 years | 25.8% | 71 |

```sql
SELECT year, COUNT(*), ROUND(AVG(wm_rrr * 1.0 / wm_new_pr) * 100, 1)
FROM valuations
WHERE wm_new_pr > 1000 AND wm_rrr > 0 AND year BETWEEN 2010 AND 2025
GROUP BY year ORDER BY year DESC;
```

Two caveats belong on this finding. The age-10 cohort is drawn mostly from petrol vehicles, so it is not the EV or hybrid curve directly. And 883 of the 5,968 valuation rows carry a `vehicle_id`, a 14.8% match rate, so a type-specific curve rests on a smaller sample than the headline figure. Neither caveat rescues the 50.2% assumption, which no data in this repository supports.

**Status.** Fixed 2026-09-11. All 22 `resale_10yr_pct` values were deleted from `data/catalog_vehicles.json` rather than kept as per-trim overrides: they carried no provenance, sat in a suspiciously narrow 44 to 57 percent band, and contradicted the fitted curve. `test_the_catalogue_no_longer_carries_unsourced_resale` keeps them out.

**Solution.** Fit the curve from data and record the sample size next to it. After issue 3 lands, group matched listings by type and age, take the median ratio against catalog new price, and store the result as a versioned artefact under `data/` rather than as a per-trim constant:

```python
import json, sqlite3, statistics, sys
sys.path.insert(0, ".")
from app.config import load_catalog

cat = {v["id"]: v for v in load_catalog()}
con = sqlite3.connect("../data/used_market.db")
rows = con.execute("""SELECT vehicle_id, year, AVG(price_rm) FROM listings
                      WHERE vehicle_id IS NOT NULL AND price_rm > 5000
                        AND year BETWEEN 2016 AND 2025
                      GROUP BY vehicle_id, year HAVING COUNT(*) >= 3""").fetchall()
curve: dict[str, list[float]] = {}
for vid, year, avg in rows:
    v = cat.get(vid)
    if v and float(v["price_rm"]) > 0:
        curve.setdefault(f'{v["type"]}:{2026 - year}', []).append(avg / float(v["price_rm"]))
out = {k: {"retained": round(statistics.median(x), 4), "n": len(x)}
       for k, x in curve.items() if len(x) >= 5}
for key, cell in out.items():
    if key.endswith(":1") and cell["retained"] < 0.45:
        raise SystemExit(f"{key} retained {cell['retained']}: fix issue 3 before fitting")
json.dump(out, open("../data/depreciation_curve.json", "w"), indent=2, sort_keys=True)
```

The guard is load-bearing. Run against the current database this script emits `ev:1` at 0.1173 retained, which reads as a one-year-old EV losing 88% of its value. That figure is the issue 3 corruption, not depreciation, and without the check it would be fitted into the cost model as though it were measured.

Extrapolate to 10 years with an exponential fit, because the listings only reach back 5 years. Refuse to emit a cell whose sample size falls below 5, and have `depreciation_10yr_rm` fall back to the type curve when a cell is missing. Re-run this whenever the scraper refreshes, and treat a large shift in the fitted curve as a data-quality alarm rather than a silent input change.

**Status.** Unblocked, not done. With issue 3 repaired, the same query now returns a usable curve where before it returned nonsense:

| Type | Age 1 | Age 2 | Age 3 | Age 4 | Age 5 |
| --- | --- | --- | --- | --- | --- |
| EV | 94.1% | 73.3% | 54.7% | 59.8% | 49.0% |
| Hybrid | 86.7% | 73.0% | 64.6% | 59.1% | 46.8% |
| PHEV | 83.2% | 67.7% | 55.5% | 50.3% | 41.1% |

Before the repair those same cells read 11.7%, 16.9% and 25.5% for the first three EV ages. The shape is now interpretable and carries the signal issue 9 needs: an EV holds value better than a hybrid through year 1, then falls faster and crosses below it by year 3. The age-4 EV cell sits above age 3 on a sample of 9, so the fit still needs smoothing and the sample-size floor before it reaches the cost model.

### 11. Maintenance cost is a per-type constant for 162 of 184 trims

**Problem.** `financial_tco_excluding` reads `ownership.maintenance_rm_yr` at `engines.py:581` and falls back to `_MAINTENANCE_FALLBACK_RM_YR` at `engines.py:564`, a three-entry table keyed by vehicle type. The catalog carries a measured figure for 22 trims.

**How I found it.** I counted how many catalog rows carry each ownership field.

**Why it is an issue.** Coverage across the three ownership inputs to the financial criterion is uneven:

| Field | Trims with a measured value |
| --- | --- |
| `insurance_rm_yr` | 184 of 184 |
| `road_tax_rm` | 184 of 184 |
| `maintenance_rm_yr` | 22 of 184 |

162 trims, 88% of the catalog, take one of three constants. Multiplied over 10 years, maintenance contributes RM6,000 or RM9,500 to the TCO of those trims regardless of brand. A Perodua and a BMW carry identical servicing costs whenever both fall back, which is a difference the financial criterion cannot see. The comment at `engines.py:553` shows this was already narrowed from a single flat RM600 to a per-type median, so the direction is right and the coverage is the remaining gap.

**Solution.** Raise coverage rather than refine the fallback. Servicing schedules and prices are published by every distributor in this catalog, and 162 rows is a bounded data-entry task. Track it as a field on the row so the results page can distinguish measured from estimated, which `provenance` at `scoring.py:67` already carries for other figures. Until coverage improves, widen the fallback from three constants to a function of price band and type, since servicing scales with the parts and labour rates of the segment.

**Status.** The fallback is fixed 2026-09-14; measured coverage is unchanged at
22 of 184.

Raising coverage the way this section proposes turned out not to be the bounded
task it looks like. paultan.org, which carries the Malaysian-market spec tables
used for the DC charge-rate sweep, publishes warranty terms but no servicing
cost, so 162 rows would mean per-brand dealer price lists at low confidence.
Inventing them into a file whose whole point is tracked provenance is worse than
a well-calibrated estimate, so this took the interim option instead.

`_maintenance_fallback` is now log-linear in price with a per-type intercept,
fitted on the 22 measured rows. The premise holds: within a drivetrain,
servicing tracks price (EV r=+0.76 n=15, hybrid r=+0.78 n=7), while the overall
correlation is only +0.20 because drivetrain dominates price — which is why the
model needs both terms. Both types fit near-identical slopes (172.1 and 172.6),
so the slope is pooled and only the intercept is per-type: R^2 0.937, mean
residual RM31, worst RM130.

Measured effect: 3 distinct servicing values across the catalogue became 162,
and within-type standard deviation went from 0 to RM114 (EV), RM141 (hybrid) and
RM121 (PHEV). `maintenance_rm_yr` returns a `measured`/`estimated` basis the way
`resale_retained_pct` does, carried into the five-year breakdown as
`maintenance_basis`, so the results page can tell the two apart.

**It did not recover the stability lost in issue 16.** Winner stability moved
0.86/0.75/0.99/0.68 to 0.86/0.76/0.99/0.67 — noise. Maintenance is about 5% of
the five-year total; depreciation is 68% and is still type-level for 162 of 184
trims. That, not maintenance, is what makes the cost criterion nearly constant
within a drivetrain, and only more measured depreciation repairs it.

## Tier 5: the product reports certainty it does not have

The ranking is a strict ordering with no accompanying measure of how firm it is. Three independent tests agree that the top of the ranking is a tie, and the interface reports it as a decision.

### 12. A single winner is presented where the data supports a tied top tier

**Problem.** `run_topsis` at `topsis.py:57` returns a strict ordering, `results.py:66` serves `ranking` as that ordering, and the analysis page presents rank 1 as the recommendation. Nothing in the pipeline measures how far rank 1 sits from rank 2, or how much of the ordering survives a small change in the weights.

**How I found it.** Three measurements on the shipping matrix: the closeness gap between adjacent ranks, the winner under 400 jittered weight vectors, and the winner under six different multi-criteria decision making methods applied to the same matrix and weights.

**Why it is an issue.** All three say the top of the ranking is a tie the interface reports as a decision.

The gap between rank 1 and rank 2 is 0.0015 on a scale whose full observed span is 0.3045 to 0.8752. Ranks 1, 2 and 3 fall within 0.0016 of each other.

Under weights jittered by 15%, the winner changes in 31% of draws:

```python
import numpy as np
from pymcdm.methods import TOPSIS
from repro import PROFILE_B, SLIDERS
from app.services import scoring
from app.engines.topsis import CRITERIA, TYPES, preference_weights

rows = scoring.score_catalog(PROFILE_B, SLIDERS)["ranking"]
m = np.array([[float(r[c]) for c in CRITERIA] for r in rows])
w = np.array(preference_weights(SLIDERS))
rng, wins = np.random.default_rng(0), {}
for _ in range(400):
    jw = np.clip(w * rng.normal(1.0, 0.15, len(w)), 1e-6, None)
    slug = rows[int(np.argmax(TOPSIS()(m, jw / jw.sum(), np.array(TYPES))))]["slug"]
    wins[slug] = wins.get(slug, 0) + 1
print(sorted(wins.items(), key=lambda kv: -kv[1]))
# byd-m6 277, dongfeng-box 94, toyota-yaris-cross 16, wuling-bingo 13
```

Six methods broadly agree on the ordering, with pairwise weighted Spearman between 0.882 and 1.000, yet they crown three different winners on identical inputs:

| Method | Winner | Price |
| --- | --- | --- |
| TOPSIS, VIKOR | `byd-m6` | RM109,800 |
| COPRAS, SPOTIS, MABAC | `wuling-bingo` | RM67,800 |
| PROMETHEE II | `dongfeng-box` | RM100,000 |

A product named a decision intelligence platform reporting rank 1 as the answer, when rank 1 holds under 69% of reasonable weightings, overstates what the model knows.

**Re-measured 2026-09-11.** The fixes to issues 4, 5a, 7 and 8 relieved most of this without addressing it directly. Criteria that discriminate properly produce a ranking that does not depend on the third decimal place:

| Profile | Winner holds under 15% jitter | Gap between rank 1 and rank 2 |
| --- | --- | --- |
| `kv_home_charging` | 100% | 0.0226 |
| `high_mileage_budget` | 100% | 0.0320 |
| `east_no_charging` | 99% | 0.0137 |
| `bev_gate_blocked` | **64%** | **0.0016** |

Three of the four are now firm. The exception is instructive: once the feasibility gate removes 42 battery EVs, the 31 surviving hybrids are separated only by cost and CO2, because `behaviour_score` and `infrastructure_score` are constant within a drivetrain. That is issues 5b and 6, so the remaining instability here is a symptom rather than the disease. Publishing a stability figure is still worth doing, and it would have said so.

**Solution.** Compute the stability alongside the ranking and surface it. `score_catalog` runs in 2.7 ms warm, and the jitter loop reuses the built matrix rather than rebuilding features, so 400 draws add roughly 1s to a request that already waits on the analyst:

```python
def rank_stability(matrix_rows: list[dict], weights: list[float], draws: int = 400) -> dict:
    """Share of jittered weight vectors under which each alternative ranks first."""
    import numpy as np
    from pymcdm.methods import TOPSIS
    m = np.array([[float(r[c]) for c in CRITERIA] for r in matrix_rows])
    w, rng, wins = np.array(weights), np.random.default_rng(0), {}
    for _ in range(draws):
        jw = np.clip(w * rng.normal(1.0, 0.15, len(w)), 1e-6, None)
        slug = matrix_rows[int(np.argmax(TOPSIS()(m, jw / jw.sum(), np.array(TYPES))))]["slug"]
        wins[slug] = wins.get(slug, 0) + 1
    return {slug: round(n / draws, 3) for slug, n in
            sorted(wins.items(), key=lambda kv: -kv[1])}
```

Store the result in `TopsisResult.overview_json` next to `budget` and `features`, and have the results page group any alternatives within one standard error of rank 1 into a top tier rather than ordering them. Give the analyst prompt in `backend/app/services/analyst.py` the win share, so its explanation matches the model’s actual confidence. A statement that three cars are statistically tied and the first holds under 69% of reasonable weightings is both more accurate and a stronger product than a bare rank 1.

## Tier 6: why none of the above fails the build

The suite tests components, not rankings. That is why four defects above ship green, and why the larger fixes below have no baseline to be reviewed against.

### 13. No test asserts a ranking property, so issues 1, 2, 7 and 8 pass CI

**Problem.** `backend/tests/test_engines.py` holds 21 tests across feature engineering, the financial engine, the energy engine, the pipeline and the feasibility gate. Every one checks a component in isolation. `TestScorePipeline.test_catalog_fully_ranked` at line 150 asserts that the catalog is fully ranked, that ranks ascend, and that closeness sits within 0 and 1. No test asserts anything about which cars come out on top or how the ranking responds to an input.

**How I found it.** I read the suite after each defect above, checking whether an existing assertion would have caught it.

**Why it is an issue.** Every Tier 1 to Tier 3 defect survives the suite:

- **Issue 1**: no test compares two different slider values, so a mapping that ignores its input passes
- **Issue 2**: `test_weights_sum_to_one` at line 161 checks only `abs(sum(weights) - 1.0) < 1e-3`, which holds with a negative component present, and its inputs of 80, 80, 20 and 20 all sit above the threshold at which weights turn negative
- **Issue 7**: no test asserts anything about the composition of the top of the ranking
- **Issue 8**: no test ranks the same profile against two candidate sets

The suite also has no fixture pinning a ranking, so fixes for issues 4, 7, 9 and 10 cannot be reviewed for their effect. Each of those will move the ranking substantially, and without a baseline the reviewer cannot tell an intended change from a regression.

**Solution.** Add property tests that encode what the ranking must do, then a golden fixture that records what it currently does. The property tests first:

```python
class TestWeightProperties:
    def test_zero_slider_differs_from_midpoint(self):
        low = preference_weights(dict(DEFAULT_SLIDERS, environment=0))
        mid = preference_weights(dict(DEFAULT_SLIDERS, environment=50))
        assert low != mid

    def test_weights_never_negative(self):
        for v in range(0, 101):
            for key in ("save_money", "environment", "convenience", "future_proofing"):
                w = preference_weights(dict(DEFAULT_SLIDERS, **{key: v}))
                assert all(x >= 0 for x in w), f"{key}={v} -> {w}"

    def test_environment_slider_moves_carbon(self):
        green = scoring.score_catalog(BASE_PROFILE, dict(DEFAULT_SLIDERS, environment=100))
        thrifty = scoring.score_catalog(BASE_PROFILE, dict(DEFAULT_SLIDERS, environment=1))
        mean = lambda b: sum(r["co2_kg_yr"] for r in b["ranking"][:5]) / 5
        assert mean(green) < mean(thrifty)
```

Then the stability property that issue 8 needs:

```python
def test_ranking_survives_removal_of_irrelevant_alternatives(monkeypatch):
    """Dropping cars nobody would buy must not reorder the cars they would."""
    full = load_catalog()
    before = [r["slug"] for r in scoring.score_catalog(BASE_PROFILE, DEFAULT_SLIDERS)["ranking"]]
    monkeypatch.setattr(scoring, "load_catalog",
                        lambda: [v for v in full if float(v["price_rm"]) < 2_000_000])
    after = [r["slug"] for r in scoring.score_catalog(BASE_PROFILE, DEFAULT_SLIDERS)["ranking"]]
    common = [s for s in before if s in set(after)]
    moved = sum(1 for s in common if common.index(s) != after.index(s))
    assert moved <= 5, f"{moved} of {len(common)} alternatives reordered"
```

`test_environment_slider_moves_carbon` and `test_ranking_survives_removal_of_irrelevant_alternatives` both fail on the current code, which is the point: they encode the target state for issues 2 and 8. Mark them `xfail` with a reference to this document if you want a green build before the fixes land.

Finally, add a golden fixture over three or four profiles covering the cases that differ most, being a Klang Valley buyer with home charging, an East Malaysian buyer without it, and a high-mileage buyer with a tight budget. Record the top 5 for each, and require any change to that file to be explained in its commit message.

**Status.** Fixed 2026-09-11 in `backend/tests/test_golden_ranking.py`, with the fixture at `backend/tests/fixtures/ranking_golden.json`.

Four profiles are recorded, each reaching the engine by a route the others do not:

| Profile | Considered | Gate | Rank 1 | Covers |
| --- | --- | --- | --- | --- |
| `kv_home_charging` | 89 of 184 | passes | `byd-m6` | The EV-favourable path |
| `east_no_charging` | 73 of 184 | passes on 11 stations | `toyota-yaris-cross` | Charging penalties choosing a hybrid without the gate firing |
| `high_mileage_budget` | 26 of 184 | passes | `wuling-bingo` | The budget filter under pressure |
| `bev_gate_blocked` | 31 of 184 | fails on 0 stations | `toyota-yaris-cross` | The gate removing 42 battery EVs before scoring |

The fixture records each car’s TOPSIS score alongside its position, which risks the file churning on every weight re-tune. Splitting the comparison into three tests removes that cost, because the name of the failing test says which kind of change happened before you read a line of output:

- `test_recommended_cars_have_not_moved` fails only when a different car appears or the order changes, and prints the recorded and current shortlists side by side
- `test_scores_have_not_drifted` fails when the numbers move but no car does, and skips outright when the order changed so a single change is never reported twice
- `test_candidate_pool_is_unchanged` fails when the budget filter or the feasibility gate admits a different number of candidates

`test_ranking_survives_removal_of_irrelevant_alternatives` is present and marked `xfail(strict=True)` against issue 8. The suite reads `109 passed, 1 xfailed` today. When issue 8 lands, `strict=True` turns the unexpected pass into a failure, so the fixed behaviour is reported rather than absorbed silently.

Regenerate after an intended change, and say what moved in the commit message:

```bash
cd backend
REGEN_GOLDEN=1 .venv/bin/python -m pytest tests/test_golden_ranking.py
```

**Validated by deliberate breakage.** A regression fixture that has never caught anything is an assumption. Each of the three tests was confirmed against a perturbation built to trip it: raising `purchase_price_rm` from 0.17 to 0.42 moved 9 of the top 10 and failed the order test alone, with the four score tests skipping; scaling every closeness score by 0.999 failed the score test alone while the order test passed; widening the budget filter by 20% moved `considered` from 31 to 36 and 73 to 86 and failed only the pool test. `backend/app/engines/topsis.py` was restored byte-identical afterwards.

## Tier 7: repository layout

Found while applying the issue 3 fix, not during the original review. It cost one wasted migration and is the reason a correct fix can appear to do nothing.

### 14. Scripts and data exist in two places, and only one of each is canonical

**Problem.** `scripts/` and `data/` at the repository root are the tracked sources. `backend/scripts/` and `backend/data/` are copies produced by `backend/vercel-build.sh` at build time, and both are ignored at `.gitignore:60` and `.gitignore:61`. The two trees are otherwise identical, so an edit to either looks correct in isolation.

**How I found it.** I applied the issue 3 fix to `backend/scripts/used_market/db.py`, ran the migration, and it reported repairing 3,886 rows. Verifying against the database the application reads showed all 3,886 rows still corrupt. The migration had rewritten a different file from the one being checked.

**Why it is an issue.** The two copies are reached by different paths, and nothing reconciles them:

- `scripts/used_market/db.py` computes `DB_PATH` as `os.path.dirname(__file__)/../../data/used_market.db`. From the root copy that resolves to `data/`; from the build copy it resolves to `backend/data/`
- `backend/app/config.py` sets `DATA_DIR` to the root `data/`
- `backend/tests/test_scripts.py:21` sets `SCRIPT_DIRS` to the root `scripts/`, so the suite only ever exercises the canonical tree

Both database copies held identical row sets, the same 14,164 listing keys and the same latest fetch timestamp of `2026-08-12T03:54:18+00:00`, so the duplication is not a staleness bug today. It is a correctness trap: an edit to a gitignored copy passes local verification, is invisible to `git status`, and is discarded by the next build.

```bash
git check-ignore -v backend/scripts/used_market/db.py backend/data/used_market.db
# .gitignore:61	backend/scripts/used_market/db.py
# .gitignore:60	backend/data/used_market.db
git ls-files scripts/used_market/db.py backend/scripts/used_market/db.py
# scripts/used_market/db.py          <- only the root copy is tracked
```

**Solution.** Make the generated copies unmistakable. The cheapest change is to have `backend/vercel-build.sh` drop a `GENERATED.md` into `backend/scripts/` and `backend/data/` naming the source directory and the script that produced them, so anyone editing there is told within one file listing.

The better change is to stop copying. `scripts/used_market/db.py` already derives `DB_PATH` from `__file__`, so a single tree reached by one path would remove the ambiguity entirely, and `.gcloudignore:27` shows the copy exists only to satisfy the build’s working directory. That is a deployment change rather than an engine change, so it belongs to whoever owns `vercel-build.sh`.

Until then, apply every `scripts/` or `data/` change to the root tree and treat anything under `backend/scripts/` or `backend/data/` as read-only build output.

**Status. Fixed 2026-09-14.** Milder than written: `backend/data/` and
`backend/scripts/` are gitignored and untracked, and `vercel-build.sh` rebuilds
them with `rm -rf data scripts; cp -R ../data ./data` on every build. The root
tree is canonical without ambiguity, and `config.py` prefers it whenever it
exists, falling back to the bundled copy only where there is no parent to read —
which is the Vercel case the copy exists for.

So there was no deployment risk, only the wasted fix this section describes, and
it had already started: by 2026-09-14 the backend copy of `matcher.py` was a fix
behind the root, `fuel.json` and `catalog_vehicles.json` had both drifted, and
`depreciation_curve.json` was missing from it entirely. Editing any of them is a
silent no-op, because nothing reads them while the root tree is present.

The 26 MB of leftovers are deleted, and `TestNoStaleBuildCopies` in
`backend/tests/test_scripts.py` keeps them from rotting again: it skips when the
copies are absent, which is the normal state, and fails with the offending file
list and the `rm -rf` to run when a leftover has drifted from root. No change to
`vercel-build.sh`, which was never the problem.

## Tier 8: data pipeline

Found while fitting the depreciation curve. It does not affect the ranking today, but anything built on the used-market tables has to defend against it.

### 15. The used-market matcher joins listings to the wrong drivetrain

**Problem.** `matcher.match_title` keys on the nameplate and ignores drivetrain, so a listing for a petrol or diesel car is joined to a catalogue row for the electric version of the same model.

**How I found it.** Fitting per-model retention curves put `toyota-hilux` at the bottom of the EV table, decaying 22% a year. The catalogue row is the battery-electric Hilux at RM226,300; every listing joined to it is a 2.4-litre diesel pickup between RM74,000 and RM89,000.

**Why it is an issue.** The implied retention is 0.37 to 0.62 where the EV median for those ages is 0.87, so the model drags the whole EV curve down. It is not a lone case: judging each model against its type median flags 8, split across both tails. `lexus-lm` reads 0.71, while `tesla-model-3` reads 1.65 and `mg4` 1.80, the high side arising because new prices were cut and old listings then look like appreciation. `listings.fuel_type` cannot screen this out, being populated by one source for 204 of 5,279 matched rows.

**Solution.** Mitigated, not fixed. The curve builder judges each model as a whole against its type median and drops any outside 0.75 to 1.35, excluding it from both the per-model and the type fits; excluded models fall back to their drivetrain curve, and `models_rejected_as_bad_joins` in `data/depreciation_curve.json` names them with their ratio. That is a statistical guard on a matching defect. The real fix is in `matcher.match_title`: require the drivetrain to agree before accepting a join, using the engine displacement in a title (`2.4`, `1.5`) as evidence against an electric candidate, and reconcile against `listings.fuel_type` where a source provides it.

**Status. Fixed 2026-09-14.** `_has_ice_marker` already existed but was wired
only into `match_brand_model`, the structured brand+model path. Free-text titles
went through `match_title` unscreened, which is where the bad joins were made.

`match_title` now rejects a candidate whose type is `ev` when the title looks
like a combustion car. EV rows only: a hybrid genuinely has an engine, so "1.5"
or "turbo" in its title is a correct match rather than a contradiction.

Engine displacement carries the signal, but it cannot be read naively. Malaysian
listing sites write `0.0` or `1.0` where a battery EV has no engine, so those
two values mean the opposite of what they look like. Measured across the corpus,
titles joined to an EV row carry either `0.0`/`1.0` (71 listings, all genuine)
or `1.5` and above (154 listings, all but one a bad join).

**Bare `turbo` was removed from `_ICE_MARKERS`.** Porsche names its fastest
battery EVs Turbo and Turbo S — Taycan Turbo, Macan Turbo Electric — so the word
marks a trim as often as a turbocharger. Screening on it threw away 25 genuine
EV listings, 24 of them Taycans. The combustion cars this exists to catch carry
a displacement anyway: "Hilux 2.4 VNT TURBO" is rejected on the 2.4. This was a
latent fault in `match_brand_model` too, and removing it fixes both paths.

**Effect.** 154 of the 1,968 listings joined to an EV row are rejected: 83
petrol MINI Countrymans, 58 diesel Hiluxes, 8 Mercedes A35/GLA35 mis-branded to
the MG4, and 5 others. One false rejection remains, a BYD Seal listed as "SEAL
PERFORMANCE 3.8" where 3.8 is the 0-100 time.

**It was reaching the shipped curve.** `mini-countryman` was in `by_model` on 97
listings at 54.0% retention, 83 of them petrol Countrymans, which hold value far
better than the electric one. The downstream screen caught `toyota-hilux` (0.69x
the type median) and `mg4` (1.8x) but not this at 1.28x. After the rebuild it is
22 listings at **45.7%**, and the EV type curve moved **42.3% to 40.3%** — the
whole EV fleet was being credited with retention it does not have, which matters
now that depreciation is 68% of the cost criterion. Bad-join rejections fell
from 8 to 6, the two dropped being ones now stopped at source.

## Tier 9: the cost model itself

Researched 2026-09-11 while looking for a horizon that would let issue 9 close. The horizon turned out to be the smallest of four compounding problems, and the research produced a product finding larger than any of them.

### 16. The cost model is wrong on its horizon, its insurance, and its loan method

**Problem.** `financial_tco_excluding` sums ten years of ownership cost. Three of its assumptions do not survive checking, and the fourth, the horizon, matches neither the market nor the data available.

**How I found it.** Decomposing the 10-year TCO by component, then verifying each against primary Malaysian sources.

**Why it is an issue.** Insurance alone is **57.6% of the whole 10-year TCO**, an average of RM97,582:

| Component | Average | Share |
| --- | --- | --- |
| Insurance | RM97,582 | 57.6% |
| Loan interest | RM43,970 | 26.0% |
| Opportunity cost | RM12,975 | 7.7% |
| Maintenance | RM7,567 | 4.5% |
| Road tax | RM7,255 | 4.3% |

**Insurance is overstated 2.74 times.** The catalogue documents `insurance_rm_yr` as ”comprehensive, Peninsular, 0% NCD” computed against a sum insured equal to the new car price. It is the first-year premium on a brand-new car, and the engine charges it ten times. Both halves of that are wrong. Malaysia’s No-Claim Discount ladder is standardised by PIAM at 0%, 25%, 30%, 38.33%, 45% and 55% from year six, so the premium falls by more than half on its own. Comprehensive premiums are also a function of sum insured, which tracks market value downward, though de-tariffication lets insurers offset some of that with the higher repair risk of older cars. Modelling the ladder against the fitted depreciation curve with a floor at 35% of the new sum insured, ten years of insurance comes to 3.65 times the base premium, not ten.

**Loan interest uses a method Malaysia abolished.** `loan_interest_total` computes `principal * flat_rate * years` and its docstring names it ”Malaysian hire-purchase flat rate”. The Hire Purchase (Amendment) Act 2026 came into force on 1 June 2026 and abolished both the Rule of 78 and the flat interest structure outright, moving all hire purchase to reducing balance on an Effective Interest Rate. The arithmetic barely moves, since at 1.75% flat over seven years the Rule of 78 and reducing balance differ by RM57 on RM100,000 at the five-year mark, but the engine charges the FULL-TERM interest no matter how long the buyer keeps the car. A buyer selling at five years has paid 91% of it.

**The horizon fits nothing.** Malaysia’s average vehicle replacement rate is six years and the used market concentrates at four to six years old, so ten years overstates typical ownership by two thirds. It also cannot accommodate depreciation, because no Malaysian EV listing is older than age 5, which is what leaves issue 9 half-closed.

**The finding that matters more than any of the above.** Costing five years properly shows that energy is not what separates an EV from a hybrid in Malaysia:

| | Cost per 100 km |
| --- | --- |
| EV at 13 kWh/100km, 80/20 home and public charging | RM8.44 |
| Hybrid at 3.6 L/100km, RON95 at RM1.99 | RM7.16 |

RON95 is subsidised to RM1.99 under BUDI95 while public charging runs RM1.25/kWh, so an efficient hybrid is currently **cheaper per kilometre than an EV**, even for a driver who charges at home. Over five years the energy gap between a Wuling Bingo and a Toyota Yaris Cross is **RM60** at 10,400 km/yr and RM220 at 37,440 km/yr, against a depreciation gap of **RM10,906**. Depreciation outweighs energy by 50 to 182 times.

The whole premise the interface leans on, that an EV saves you money on running costs, does not hold at current Malaysian prices. What actually decides it is depreciation, purchase price and maintenance.

**Solution.** Move the cost model to a five-year horizon with depreciation as its primary line. One change resolves all four problems, and it closes issue 9.

Five years is the horizon the evidence points to from three directions: it is where the resale data ends, it sits inside Malaysia’s four-to-six year replacement window, and it is roughly the point at which an owner has paid 91% of a seven-year hire-purchase interest bill. Replace `financial_tco_excluding` with:

```python
OWNERSHIP_YEARS = 5

# PIAM-standardised No-Claim Discount for private cars. Index is policy year.
NCD_LADDER = (0.0, 0.25, 0.30, 0.3833, 0.45, 0.55)

# De-tariffication lets insurers price the higher repair risk of an older car,
# so the premium does not follow the sum insured all the way down.
SUM_INSURED_FLOOR = 0.35

# Share of a 7-year hire-purchase interest bill paid by the 5-year mark, on the
# reducing-balance basis the Hire Purchase (Amendment) Act 2026 mandates.
INTEREST_PAID_BY_YEAR_5 = 0.91


def _ncd_factor(policy_year: int) -> float:
    """Premium multiplier after the no-claim discount for that year."""
    idx = min(policy_year, len(NCD_LADDER)) - 1
    return 1.0 - NCD_LADDER[idx]
```

Insurance then sums the premium actually paid rather than repeating year one:

```python
def insurance_paid(base_premium: float, retained_curve_k: float,
                   years: int = OWNERSHIP_YEARS) -> float:
    """Premiums actually paid: NCD ladder against a declining sum insured.

    `base_premium` is the catalogue's insurance_rm_yr, documented as year one at
    0% NCD on a sum insured equal to the new price. Charging it once per year
    overstates ten years by 2.74x and five years by 1.78x.
    """
    total = 0.0
    for year in range(1, years + 1):
        sum_insured = max(math.exp(-retained_curve_k * (year - 1)), SUM_INSURED_FLOOR)
        total += base_premium * _ncd_factor(year) * sum_insured
    return total
```

Depreciation becomes a line rather than an omission, taken from the fitted curve issue 9 already produces:

```python
def depreciation_rm(vehicle: dict) -> float:
    """Value lost over OWNERSHIP_YEARS. The largest cost of owning a car."""
    retained_pct, _basis = resale_retained_pct(vehicle)
    return float(vehicle["price_rm"]) * (1.0 - retained_pct / 100.0)
```

On the Klang Valley profile the model produces a breakdown a buyer can act on, where the current engine produces one dominated by an insurance figure that is 2.74 times too large:

| Five-year cost | Wuling Bingo (EV) | Toyota Yaris Cross (hybrid) |
| --- | --- | --- |
| Depreciation | RM39,134 | RM50,040 |
| Loan interest | RM6,802 | RM11,455 |
| Insurance | RM5,305 | RM8,357 |
| Energy | RM3,785 | RM3,725 |
| Maintenance | RM3,000 | RM4,750 |
| Road tax | RM100 | RM600 |
| **Total** | **RM58,126** | **RM78,926** |

**One decision this forces, and I would not make it unasked.** Putting depreciation into the cost criterion makes `resale_retained_pct` a second measurement of the same quantity, which is precisely the double-counting issue 4 removed: depreciation in ringgit is `price x (1 - retained)`, so the two move together by construction. Three ways out:

- **Depreciation in the cost, drop the resale criterion.** Cleanest arithmetic, but `future_proofing` loses the home it gained in issue 4 and the interface would need its fourth slider rethought or retired
- **Keep resale as a criterion, leave depreciation out of the cost.** The status quo. Honest about what it measures, but the money criterion continues to omit the largest cost
- **Depreciation in the cost, and `future_proofing` re-pointed at battery warranty.** `warranty_battery_yrs` is genuinely distinct from resale value and spans 5 to 10 years, but is present for only 34 of 184 trims, so it would be type-level for most of the catalogue

I lean to the first, because a cost model that omits 72% of the cost is the worse failure, and because the slider question is a product decision that should be made deliberately rather than preserved by accident.

**Expected effect on rankings.** Measured against the four golden profiles: correcting insurance alone changes nothing, 5 of 5 overlap on every profile, because it scales with price and price is already counted. Adding depreciation changes 1 to 2 of the top 5 and moves hybrids up, because Malaysian EVs currently depreciate faster than hybrids, 42.3% retained against 49.9%. That is the model telling the truth about the market rather than a regression, but it should land against the golden fixture so the movement is reviewed rather than absorbed.

**What this does not fix.** Depreciation is measured for 22 of 184 trims and type-level for the rest, so within a drivetrain the criterion is nearly constant, which is the same degeneracy as issues 5b and 6. Maintenance stays a per-type constant for 162 trims, issue 11, and it becomes a larger share of a five-year total than it was of a ten-year one. Neither blocks the change.

**Status.** Fixed 2026-09-14, closing issue 9 with it. The five-year arithmetic
already existed in `app/services/costing.py` as display-only; the change was to
make the ranking score it. `CRITERIA[0]` is now `total_cost_5yr_rm` from
`costing.five_year_breakdown`, and `criteria_bounds` was recalibrated to the
five-year basis (`FIVE_YR_COST_X_BUDGET` 1.05, from a dearest observed
fixed-cost ratio of 0.903 x price on `denza-z9-gt`).

Measured on the Klang Valley profile, the breakdown reproduces the table above
line for line; the totals here are RM1,186 and RM1,748 higher only because that
table omitted `opportunity_cost`. Insurance fell from **57.6% to 9.3%** of the
cost criterion and depreciation entered at **67.8%**.

**Deviation: the reserved decision was not taken, because measurement dissolved
it.** The three options above assume depreciation in the cost double-counts
`resale_retained_pct`. It does not. Depreciation is absolute ringgit and
retention is a scale-free ratio, so across 184 trims the two correlate
**-0.103**, and as criteria on the Klang Valley profile **0.152** — against the
0.973 that issue 4 called a near-perfect duplicate. The worst pair in the model
is now `resale_retained_pct`/`behaviour_score` at 0.507, inside the 0.24-0.51
band the earlier fixes established. So both criteria are kept, `future_proofing`
keeps the home issue 4 gave it, and no slider needed retiring.

**Cost: confidence softened, as this section predicted.** Depreciation is
type-level for 162 of 184 trims, so making it 68% of the cost criterion made
that criterion more nearly constant within a drivetrain. Winner stability moved
0.97 -> 0.86, 0.92 -> 0.75, 1.00 -> 0.99 and 0.64 -> 0.68; `east_no_charging`
crossed from firm to not-firm. That is the degeneracy of issues 11, 5b and 6
surfacing through a criterion that now carries more weight, not a fault in the
cost model, and raising measured depreciation and maintenance coverage is what
repairs it.

### 17. Scoring the same token twice returns a 500

**Problem.** `/score` always inserts a `TopsisResult`, and `result_token` is UNIQUE, so a second call for the same token raises `sqlite3.IntegrityError` and the client sees a 500 rather than either a fresh result or a clean conflict.

**How I found it.** Building the fuel-scenario feature, which makes re-scoring the obvious thing to do. Calling `/score` twice with different `fuel_scenario` values reproduces it immediately.

**Why it is an issue.** A network timeout on a slow scoring call is the common path to it: the client retries, the retry is rejected, and the buyer sees an error for a request that in fact succeeded.

```text
sqlalchemy.exc.IntegrityError: UNIQUE constraint failed: topsis_results.result_token
[SQL: INSERT INTO topsis_results (result_token, weights, ranking_json, ...)]
```

**Solution.** Make the write an upsert, replacing the row for that token, so a retry is idempotent and a re-score with different inputs does what the caller meant. Not done here: the feature work routed around it instead, with `/results/{token}/scenario` computing an alternative ranking without persisting, which is the right shape for a scenario regardless. The retry case remains.

## Tier 10: the interview, found 2026-09-15

Both of these were found by using the product rather than by reading the engine,
and neither is a defect in the ranking. They are gaps between what a buyer can
say and what the model can act on.

### 18. The interview cannot express a Singapore trip

**Problem.** `ProfileIn.destination_region` at `backend/app/schemas.py:106` accepts
`"singapore"`, and `destination_distance_km` will happily score it, but the
interview never offers it: question 4's options are `kl`, `north`, `south`,
`east_coast`, `east_malaysia`. The one value the schema has that the interview
withholds is the one a Johor buyer needs most.

**Why it is an issue.** A Johor Bahru buyer commuting or travelling to Singapore
has to answer `south`, which anchors their long-trip distance on a domestic
destination. Long-trip distance feeds `long_trip_weight`, which drives the
behaviour criterion and therefore the convenience slider, so the answer is not
cosmetic: it changes how far the car has to reach between charges.

Unlike the grid region, which was removed from the interview on 2026-09-14 once
`engines.grid_region` derived it from the postcode, this one cannot be inferred.
A postcode says where someone lives, not where they drive.

**Solution.** Add `singapore` to question 4's options and to `CHOICE_LABELS` in
`frontend/lib/interview-script.ts`. It is a new option on an existing question,
so it does not lengthen the interview — the constraint that governs every change
to this script.

**Status. Fixed 2026-09-15.** One line in `schemas.py`, which was the only place
withholding it: `interview-script.ts` already listed the option and already had
the label "Cross-border to Singapore", unreachable. The voice prompt's own copy
of question 4 gained it in both languages.

The centroid needed no change, contrary to the caution written above. Measured
before shipping: from Kuala Lumpur, `south` returns 368 km and `singapore` 389
km, which is the island being genuinely further than Johor Bahru; from a Johor
postcode both floor at the 30 km minimum, which is right for a crossing.

The `south` label was also reworded. It read "South (JB / Singapore)" and named
a destination the question could not express; it now reads "South (JB /
Melaka)".

### 19. Annual mileage has no sanity check

**Problem.** `annual_mileage_km` at `backend/app/engines/engines.py:67` is
`daily_km * trips_per_week * 52`, and `daily_km` accepts anything up to 2000.
Question 1 asks "How far do you drive on a typical day?" and question 2 asks how
many days a week. A buyer who reads question 1 as a weekly total and answers
"200" gets 200 x 5 x 52 = 52,000 km a year instead of roughly 10,400.

**Why it is an issue.** Annual mileage is the multiplier on every running-cost
figure in the model: energy cost, CO2, the five-year total, and the break-even
mileage feature exists precisely to answer questions about it. A 5x error there
is larger than any defect fixed in this document, and nothing catches it. The
budget is the only other answer with comparable leverage, and that one at least
fails visibly when it is wrong.

**Solution.** Not a validation rule — 52,000 km a year is a real e-hailing
figure and must stay allowed. Show the derived annual figure back to the buyer
at the point of entry, so an implausible number is visible as a number rather
than buried in a multiplication they never see. The intake already echoes a
postcode back as a town name for exactly this reason.

**Status. Fixed 2026-09-15.** `AnnualEcho` in `QInput.tsx` renders under both
mileage questions, and only once both are known — question 1 alone cannot
compute a year. Above 40,000 km it turns amber and names the misreading
outright: "high, but real for e-hailing. Check question 1 asks about a DAY, not
a week."

Measured in a browser: 40 km x 5 days reads "about 10,400 km a year"; the same
question answered 200 as a weekly total reads "about 52,000 km a year" in
amber.

### 20. The interview asked for the grid region it could already derive

**Problem.** Question 8 asked "Is your home on the Peninsular grid, or in East
Malaysia?" while question 7, which is required, already asked for a five-digit
postcode. `_STATE_RANGES` in `engines.py` maps every valid Malaysian postcode to
exactly one state, and Sabah, Sarawak and Labuan are precisely the East
Malaysian grid.

**Why it was an issue.** It spent a step of an eleven-step interview on
something already known, and worse, it let two answers that cannot disagree in
reality contradict each other: a Kuala Lumpur postcode with "East Malaysia"
selected scored the buyer against a grid carrying half the CO2.

**Status. Fixed 2026-09-14.** `engines.grid_region_for_postcode` derives it, and
`engines.grid_region` prefers the postcode over any stated value, falling back to
the stated one only when the postcode is missing or out of range — which is the
voice path, where `analyst.py` can extract "Sabah" from speech before a postcode
is captured. The question is gone from `INTERVIEW_QUESTIONS` and from the manual
form at `/interview/form`, which held its own hardcoded copy of the control.
The interview is **ten questions**, and the field stays on `ProfileIn` for the
voice path alone.

Measured: postcode 50400 gives `peninsular` and a first-EV figure of 864 kg
CO2/yr; 88000 gives `east_malaysia` and 391 kg, with nobody asked anything. All
four golden profiles' stated regions agree with what the postcode derives, which
is independent confirmation of the mapping.

## Tier 11: the interface, and what tests it

### 21. Nothing tests the interface in a browser

**Problem.** `frontend/tests/` is two `node --test` files, 49 assertions, no DOM
and no page load. The backend has 222 tests and the frontend has none that
render anything.

**How I found it.** By shipping a broken page. On 2026-09-14 the calculators page
reached the user with every panel blank: a Next.js dev bundle had a stale
`lib/api.ts` chunk paired with a fresh page chunk, so the page rendered its
inputs and never fetched. Backend tests were green, TypeScript was clean, the
production build compiled, every endpoint answered 200 by curl, through the
proxy, with browser headers, under rapid repeats. Nothing in the repository was
capable of noticing, and it took a real browser session to see it.

**Why it is an issue.** The class is not "a stale bundle" — that was one cause.
It is that an interface which renders but does not work passes every gate this
repository has. Six of the seven features in `FEATURES.md` are panels on one
page; none of them has a test that asserts a number ever appears in one.

**Solution.** A smoke test that loads the pages that matter and asserts each
panel renders a figure. Keep it separate from the `node --test` guardrails so
the fast suite stays fast.

**Status. Fixed 2026-09-15.** Playwright, six specs in `frontend/tests/e2e/`,
11 seconds, wired into CI ahead of the build. Backend responses are intercepted
rather than served, so it needs no FastAPI process and no database — and that
is also what makes it precise, because the failure being guarded against is the
page not calling the API, or calling it and rendering nothing, and both are
visible without a real backend.

**Proven against the defect, not just written.** Setting the affordability
panel's `enabled` to false reproduces the blank card, and the suite fails on it.

Three things the writing of it surfaced, each worth more than the test:

- **A weak assertion passes on a broken page.** The first version asserted
  `/RM[\d,]+/` somewhere in the body, which the slider captions "RM500" and
  "RM6,000+" satisfy as static text. It therefore never waited for the network
  and went green against the blank page. It now asserts `RM127,249` and
  `28 / 184`, figures only the stubbed API can produce.
- **Playwright globs treat `?` as a single-character wildcard,** so
  `**/api/proxy/calculators/**` matched `/vehicles` and silently missed every
  URL with a query string, letting those requests reach the real backend. The
  matcher is a URL predicate now.
- **Two Next processes must not share `.next`.** The runner's dev server
  corrupted the one already on port 3000, which then served 500s from a
  half-written manifest. `next.config.ts` has `NEXT_DIST_DIR` for exactly this;
  the Playwright `webServer` now sets it.

### 22. Interface accessibility defects

**Problem.** Four, found by auditing the rendered pages rather than the source.

- `app/layout.tsx:74` hard-codes `<html lang="en">`. It is a server component and
  the language lives in `sessionStorage`, switched client-side, so a page could
  render entirely in Malay while declaring itself English. Screen readers then
  pronounce Malay with English phonetics and crawlers index the wrong language.
- The language toggle lives in `Navbar`, which the intake flow deliberately
  hides. A buyer who started in English was held in English for all ten
  questions — the core flow of a bilingual product.
- `/calculators` had no `<h1>`; the page used only the eyebrow label, leaving the
  document with no top-level heading.
- The free-entry number field in `QInput.tsx` carried a placeholder and no
  label. A placeholder is dropped by some screen readers and disappears for
  everyone the moment typing starts.

**Status. Fixed 2026-09-15.** `components/HtmlLang.tsx` syncs the attribute,
emitting the IETF subtag `ms` rather than the `bm` this codebase uses
internally, because the attribute only means anything if it is the standard one.
`LangToggle` now sits in the intake header, in the `w-11` spacer that was
already holding the space for it. Verified across six pages: each has exactly
one `h1`, no unnamed buttons, no unlabelled inputs, no missing alt text, and the
`lang` attribute follows the toggle.

**What the audit did not find,** which is worth recording so it is not re-run:
no console errors on any page, and no horizontal overflow at 375 px, which is
the viewport `frontend/DESIGN.md` treats as primary.

### 23. The voice advisor holds a third copy of the interview script

**Problem.** `INTERVIEW_QUESTIONS` in `schemas.py` is the script, and the intake
flow renders it from `/config/interview`. The manual form held a second copy of
one control, fixed with issue 20. The Gemini Live system prompt in
`voice/page.tsx` holds a **third**, written out in full in English and Malay,
reading nothing from the backend.

**Why it is an issue.** It went stale the same day it could: issue 20 derived
the grid region from the postcode and removed the question, and the voice
advisor carried on asking "Is your home on the Peninsular grid, or in East
Malaysia?" and announcing eleven questions in four places across two languages.
A buyer using voice was asked for something the product already knew, and told a
number that had been wrong since the script changed.

Not fatal, because `analyst.py` still extracts `grid_region` and
`engines.grid_region` prefers the postcode over it — so the answer was
collected and then ignored. Wasting a question is still the defect.

**Status. Fixed 2026-09-15.** The question is gone from both prompts, the
remaining ten renumbered, and every count corrected. A comment now marks the
list as a copy so the next person knows what it shadows.

**The copy is gone, 2026-09-15.** The reservation written above was wrong. The
prompt is not a list of questions plus a schema the config cannot model: `kind`
already gives the answer format, `options` with `CHOICE_LABELS` already give the
readable choices, and `en`/`bm` already give the wording. Only the
conversational rules are genuinely prompt-only, and not one of them names a
question.

`lib/voice-prompt.ts` builds the prompt and the greeting from the script, and
the voice page fetches `/config/interview` the way the intake flow does. The
hardcoded list, in both languages, is deleted. Adding a question to the backend
now reaches the advisor with no frontend change at all — which is the property
being bought, not the deleted lines.

**A fourth copy surfaced while doing it.** `FALLBACK_SCRIPT`, the offline
fallback shared by the intake flow and now the advisor, had drifted too: it
carried `long_trip_km` and `work_postcode`, which the backend never asks, and
omitted `can_charge_work` and `monthly_electricity_bill_rm`, which it does — so
a failed fetch collected fields the engine ignores and skipped ones
`charging_convenience_score` reads. It is aligned, and
`TestInterviewScriptCopies` in `backend/tests/test_postcode.py` fails if the two
diverge again.

**Both guards were proven, not just written.** Adding a question to the script
alone leaves the builder tests passing — the prompt follows automatically, which
is the point — and fails the backend drift test, because the two copies then
disagree. The two frontend guardrail tests that used to scan the prompt text
for a self-consistent numbered list were replaced: a derived prompt cannot be
inconsistent with itself, so what is worth asserting is that it is still
derived, and that the conversational rules survived the deletion.

### 24. Link previews pointed at a host the project had left

**Problem.** `metadataBase` in `layout.tsx` fell back to
`https://voltpilot.pages.dev`, a Cloudflare Pages host, when
`NEXT_PUBLIC_SITE_URL` was unset. That variable is set nowhere: not in
`.github/workflows/`, not in `.env.local.example`, not in `DEPLOYMENT.md`. So
the fallback is what shipped, and `DEPLOYMENT.md` has described Vercel as the
only deploy target since 2026-09-07.

**Why it is an issue.** `metadataBase` resolves the relative Open Graph image to
an absolute URL, so every shared link asked scrapers for an image on a domain
the project no longer serves. For a Malaysian consumer product whose
distribution is WhatsApp and Facebook, the preview card is the first
impression, and it was broken everywhere.

**Status. Fixed 2026-09-15.** Falls back to `VERCEL_PROJECT_PRODUCTION_URL`,
which Vercel supplies at build time and which needs no configuration, then to
localhost for development. `NEXT_PUBLIC_SITE_URL` still overrides for a custom
domain and is now documented in `.env.local.example`.

Found alongside it: the meta description had claimed "Answer 8 quick questions"
since before the script was eleven. It is ten, and says so.

### 25. The Voice Advisor needs a key the deploy guide never mentions

**Problem.** `frontend/app/api/live-token/route.ts` reads `GEMINI_API_KEYS` from
the **frontend's** environment: Gemini Live connects from the browser, so that
route mints the ephemeral per-session token itself. `DEPLOYMENT.md` listed
`GEMINI_API_KEYS` only under the backend project, and gave the frontend a single
line naming `BACKEND_URL`.

**Why it is an issue.** Following the guide exactly leaves the frontend without
the key, and the advisor renders "Voice Mode Offline — Gemini Live key is not
configured on this server" and falls back to text. It is linked from the navbar
on every page, so a headline feature is off with no error anywhere: the backend
is healthy, `/health` reports `gemini: true`, and nothing fails.

**How I found it.** Opening `/interview/voice` while checking something else and
reading the offline banner rather than assuming it was local-only. It is local
here because `frontend/.env.local` has no key, which is the same shape as the
production gap.

**Status. Fixed 2026-09-15.** `DEPLOYMENT.md` now carries a frontend environment
table covering `BACKEND_URL`, `GEMINI_API_KEYS`, `GEMINI_LIVE_MODEL` and
`NEXT_PUBLIC_SITE_URL`, and says why the frontend needs a Gemini key of its own.

### 26. The calculators broke when used quickly

**Problem.** Reported as "the calculator breaks when I press the button too
often". Every input on the page is a slider, and each change fired its
calculators immediately: moving the price drove loan, insurance and
depreciation at once. One drag from RM30,000 to RM500,000 in RM1,000 steps is
470 changes, so over a thousand requests for a single gesture.

`RATE_LIMIT_DEFAULT` is 120 a minute. Measured: 150 rapid calls returned 60 OK
and **90 rejected**, with `Retry-After: 47`.

**Why it was an issue.** Two faults compounded, and the second is the one the
user saw. `useCalc` caught the failure and set its state to `null`, so a 429
did not merely fail to update a panel — it **erased the figure already on
screen**, for every calculator at once, for the 47 seconds the backend asked
for. The number being discarded was still correct for the inputs that produced
it. The page looked broken when it was only busy.

**Status. Fixed 2026-09-15.** Both in `useCalc`, which is where all six
calculators route through:

- Inputs must sit still for 250ms before a request goes out. Measured in a
  browser: a 120-step drag fires **3 requests** where it fired hundreds. 250ms
  is under the pause a deliberate adjustment takes, so a settled slider still
  answers immediately.
- A failed request keeps the last good figure instead of nulling. A transient
  rejection now leaves the answer standing until a later one replaces it.

**The first version of the guard tested nothing.** It drove 120 slider events
in a synchronous loop, which React batches into one update — so it fired few
requests even with the debounce removed and passed against the defect. Spaced
across task ticks, the way a drag actually arrives, it reports **123 requests**
undebounced and fails. Both tests were then checked against the old behaviour
before being kept.

## Suggested order of work

Dependencies rather than severity set this order. Issues 1 and 2 are two lines each and change answers today, so they come first regardless.

1. ~~**Issues 1 and 2**, being the slider defects in `topsis.py`~~ Done 2026-09-10
2. ~~**Issue 13**, adding the property tests and golden fixture~~ Done 2026-09-11. Every step below is now reviewable against `backend/tests/fixtures/ranking_golden.json`
3. ~~**Issue 3**, being the carlist price parse and the `STRICT` table~~ Done 2026-09-10, which unblocked issues 9 and 10
4. ~~**Issues 7 and 8** together, since fixed bounds address both~~ Done 2026-09-11, with issue 5a, which had to land in the same change: fixing the scale alone handed every recommendation to hybrids through the hardcoded 90.0 that issue 5a describes
5. **Issue 4**, resolving the duplicated criteria and re-tuning `BASE_WEIGHTS` against the corrected effective weights. Partly relieved already: bounding `co2_kg_yr` and `running_cost_rm_yr` independently means the environment slider now swings top-5 mean CO2 from 860 to 429 kg/yr, where before the fix it moved 944 to 898. The physical correlation between the two remains
6. **Issues 9, 10 and 11**, adding depreciation from a fitted curve and raising maintenance coverage
7. **Issues 5 and 6**, giving the behaviour and infrastructure criteria per-vehicle inputs
8. **Issue 12**, computing and surfacing rank stability

Steps 4 through 7 each move the ranking, so run them one at a time against the golden fixture from step 2 and record what moved in each commit.

Budget became a required answer on 2026-09-11 as part of step 4. `missing_required` at `backend/app/schemas.py:128` tested `budget_max_rm == 0` and then gated every append behind a whitelist that did not contain it, so the branch could never fire; the interview question was also marked `required: False`. Both are corrected, and the filter now admits cars up to `BUDGET_STRETCH` of 1.10 times the stated figure. The stretch band is not a free pass, because `criteria_bounds` anchors the price axis on the stated budget, so anything above it scores 0 on price: measured on the Klang Valley profile, the 8 cars between RM250,000 and RM275,000 enter the ranking at positions 79 to 83 and change no recommendation. A hard cutoff made a RM255,000 car invisible while a RM249,000 car ranked, and ranking it 79th is a better answer than pretending it does not exist.

**Remaining order, as at 2026-09-11.** Steps 1 through 4 are done. What is left, and why in this order:

1. **Issues 5b and 6**, giving `behaviour_engine` and `infrastructure_engine` per-vehicle inputs from `seats`, `boot_l` and `charge_power_kw_dc`. First because it is the last criterion-level degeneracy, and it is what still destabilises `bev_gate_blocked` in issue 12
2. **Issue 9’s remainder**, folding depreciation into the cost line. Needs the horizon decision first: shorten the cost model to five years, matching both the resale data and typical Malaysian ownership, or keep ten years and wait for the market to produce ten-year evidence
3. **Issue 11**, raising measured maintenance coverage above 22 of 184, since it feeds a criterion now carrying 0.34 of the weight
4. **Issue 12**, publishing the stability figure, once 5b and 6 have removed the degeneracy that makes it worst
5. **Issue 15**, teaching `matcher.match_title` about drivetrain, before anything else is built on the used-market tables
6. **Issue 14**, whenever the deployment layout is next touched

Issue 14 has no step of its own because it blocks nothing, but every step above that touches `scripts/` or `data/` must be applied to the root tree, not the copies under `backend/`.
