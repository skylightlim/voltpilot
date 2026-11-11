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
- `dev_local.db` is the local database to use: 184 trims, alembic-tracked. `dev.db` is stale.
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
- `tests/test_golden_ranking.py` records which cars rank where. A scoring change that moves
  it is accepted with `REGEN_GOLDEN=1`, and the commit message says what moved and why.
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

`data/catalog_vehicles.json` holds 184 trims. paultan.org is the source of record
(`registered_basis: paultan_exact`), and catalog `id`s are paultan slugs. Its compare pages
order columns by price, not URL order, and show each model's entry variant, so match
`battery_kwh` to the variant before trusting a figure.

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
