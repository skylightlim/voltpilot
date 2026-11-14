# VoltPilot

EV-vs-hybrid decision platform for the Malaysian market. `frontend/` is Next.js 15,
`backend/` is FastAPI on async SQLAlchemy. Production is two Vercel projects on a Neon
Postgres, deployed by `.github/workflows/ci.yml` from `main` only.

## Run locally

`backend/.env` points `DATABASE_URL` at the **production Neon database**, and
`load_dotenv()` only fills variables the shell has not set. Every local backend process
gets an explicit local database:

```bash
# backend on :8000
cd backend
DATABASE_URL=sqlite+aiosqlite:///./dev_local.db ENABLE_EMAIL=false \
  .venv/bin/python -m uvicorn app.main:app --reload --port 8000

# frontend on :3000
cd frontend && npm run dev
```

Running when `curl localhost:3000/api/proxy/health` returns `{"ok":true,...}`: that one
call proves both servers and the proxy between them.

- Startup runs `alembic upgrade head` and seeds an empty database (`RUN_MIGRATIONS`
  defaults on). With `.env` in effect, that migrates production.
- `dev_local.db` is the local database to use, alembic-tracked. `dev.db` is stale. Scoring reads
  the catalog file, not the database, so a stale local vehicles table does not change rankings.
- `ENABLE_EMAIL=false` because `.env` carries real Gmail SMTP; the report endpoint would
  email a real PDF. Drop the flag only to test email.
- The same `DATABASE_URL` override applies to any script that opens the database
  (`scripts/sync_db.py`, anything importing `app.db`).
- The browser calls same-origin `/api/proxy/*`, which `next.config.ts` rewrites to
  `BACKEND_URL` from `frontend/.env.local`. Local runs need no CORS setup.

## Before pushing to main

A green push to `main` deploys to production. Run the gates the way the runner does:
it has no `.env`, no local databases, no `uv`, and Python 3.12 (`backend/.venv` is 3.14).

```bash
cd backend && .venv/bin/python -m pytest tests/ -q && .venv/bin/python ../scripts/validate_data.py
cd frontend && npx tsc --noEmit -p tsconfig.json && npm test && npm run test:e2e
```

- `backend/tests/conftest.py` pins pytest to a temp SQLite file, which is what makes the
  suite safe with `.env` present. Keep it.
- `tests/test_golden_ranking.py` holds the shared buyer profiles and ranking property tests.
  The recorded top-ten fixture was removed 2026-11-14, so a scoring change no longer needs a
  regeneration; check what it moved yourself.
- `npm run test:e2e` starts its own Next server on :3100 with dist dir `.next-e2e`, so it
  runs beside a dev server. The backend is stubbed.
- `github-actions[bot]` commits refreshed `data/` to `main` daily at 06:00 MYT
  (`daily-refresh.yml`), then dispatches CI, which deploys. Pull before pushing,
  especially when touching `data/`.

## Voice interview

`frontend/app/interview/voice/page.tsx` connects the browser straight to the Gemini Live
WebSocket (`GEMINI_LIVE_MODEL`). Its credential is a single-use ephemeral token from the
edge route `frontend/app/api/live-token/route.ts`, minted when the session starts; the API
key never reaches the browser. Its header comment records the two constraints the token
imposes on anything that touches the connection: one session per token, opened within a
minute; lock only `model`.

Playback schedules one `AudioBufferSourceNode` per ~20 ms chunk. An AudioWorklet
ring-buffer rewrite was weighed and declined on 2026-09-08: a faint residual tick on
Android is accepted as the cost of leaving a working path alone.

## Catalog data

`data/catalog_vehicles.json` holds 170 trims (EV, hybrid, PHEV only; no petrol-only cars).
paultan.org is the source of record (`registered_basis: paultan_exact`), and most catalog
`id`s are paultan slugs (about 25 are not, e.g. `mg4` = `mg-4`, `smart-1` = `smart-smart-1`).
Its compare pages order columns by price, not URL order, and show each model's entry variant,
so match `battery_kwh` to the variant before trusting a figure.

One row is one variant: its price must be the price of the variant its specs describe. On
2026-11-12 a dozen rows carried a plug-in's specs at the mild hybrid's price, or a hybrid's
specs at the petrol base price; check the variant table on the model's paultan page
(`/research/<brand>/<model>/`). After changing a price or power, rerun
`scripts/used_market/compute_insurance.py`, `compute_insurance_ev.py`, `compute_car_loan.py`
(each with `--apply`) and `scripts/build_provenance.py --apply`. Do not `--apply`
`compute_road_tax.py`: it needs a JPJ per-variant EV export that is not in the repo. Its
`ev_road_tax_from_schedule(kw)` reproduces every EV's `road_tax_rm`, but only from the
certified kW (the figure in each `road_tax_note`); a horsepower conversion lands on the wrong
side of a 10 kW band edge. Hybrids and PHEVs use `ice_road_tax(cc, non_saloon)`.

## Docs

- `DEPLOYMENT.md`: Vercel projects, secrets, migrations (`RUN_MIGRATIONS=0` on Vercel),
  Large Functions, the daily refresh.
- `frontend/DESIGN.md`: the design and motion contract. Read before any UI or animation
  change; the visual identity is preserved, not replaced.
- `issue.md`: the measured defect log for the TOPSIS engine (`backend/app/engines/`,
  `backend/app/services/scoring.py`). Read before changing scoring.
- `FEATURES.md`: proposed features, in suggested order.
- The README's stack section predates the Vercel move: there is no `docker-compose.yml`,
  `agent/` is empty, and data refresh is `scripts/daily_update.py` run by GitHub Actions.
