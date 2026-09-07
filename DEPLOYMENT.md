# Deployment

Frontend and backend both run on **Vercel**, as two projects in this one
repository. The database is managed Postgres (Neon). `.github/workflows/ci.yml`
tests every push and deploys `main`; `.github/workflows/daily-refresh.yml`
refreshes the data once a day and updates the database.

Nothing here depends on a particular machine — no absolute paths, no LAN
addresses, every environment variable documented in `backend/.env.example` and
`frontend/.env.local.example`.

## Why two Vercel projects

The Next.js app and the FastAPI app build differently, scale differently, and
fail differently. Keeping them separate means a slow Python cold start cannot
delay a static page, and a frontend rebuild cannot restart the API.

| Project | Root directory | What it is |
|---|---|---|
| `voltpilot` | `frontend/` | Next.js 15, auto-detected by Vercel |
| `voltpilot-api` | `backend/` | FastAPI on the Python runtime, via `backend/api/index.py` |

The browser only ever calls same-origin `/api/proxy/*`, which `next.config.ts`
rewrites to the backend. That keeps the backend URL out of the client bundle and
avoids CORS.

## One-time setup

### 1. Create the two Vercel projects

Import this repository twice. Set **Root Directory** to `frontend` on one and
`backend` on the other. Take each project's ID from
`Project Settings → General → Project ID`, and the org ID from
`Account Settings → General → Team/User ID`.

The backend project needs no build configuration: `backend/vercel.json` already
routes every path to the function and copies `data/` and `scripts/` into the
bundle at build time (they live at the repo root, which a project rooted at
`backend/` cannot otherwise see).

### 2. GitHub repository secrets

`Settings → Secrets and variables → Actions → Secrets`

| Secret | Where to get it |
|---|---|
| `VERCEL_TOKEN` | Vercel → Account Settings → Tokens |
| `VERCEL_ORG_ID` | Vercel → Account Settings → General |
| `VERCEL_FRONTEND_PROJECT_ID` | frontend project → Settings → General |
| `VERCEL_BACKEND_PROJECT_ID` | backend project → Settings → General |
| `DATABASE_URL` | Neon connection string, `postgresql+asyncpg://…` |

`DATABASE_URL` is a secret in GitHub because CI runs migrations and the daily
sync against the real database.

### 3. GitHub repository variables

`Settings → Secrets and variables → Actions → Variables`

| Variable | Example | Why |
|---|---|---|
| `BACKEND_URL` | `https://voltpilot-api.vercel.app` | Baked into the `/api/proxy` rewrite **at build time**. The build fails loudly if it is missing rather than shipping a placeholder host. |

A variable, not a secret: it is a public URL and CI needs to interpolate it into
a build argument.

### 4. Vercel environment variables

On the **backend** project (`Settings → Environment Variables`):

| Variable | Value | Why |
|---|---|---|
| `DATABASE_URL` | managed Postgres URL | see the warning below |
| `RUN_MIGRATIONS` | `0` | **required.** See "Migrations" below. |
| `GEMINI_API_KEYS` | comma-separated keys | the analyst rotates through them on quota exhaustion |
| `ADMIN_TOKEN` | leave unset | `/admin/refresh` cannot work here; the refresh runs in Actions |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | your mail provider | PDF report delivery |
| `FRONTEND_ORIGIN` | the frontend's URL | CORS |
| `ENV` | `production` | drops the localhost CORS origins |

On the **frontend** project, set `BACKEND_URL` to the same value as the GitHub
variable so that Vercel-triggered builds match CI-triggered ones.

> **The function filesystem is ephemeral and read-only.** `DATABASE_URL` must
> point at managed Postgres. SQLite on the function's own disk loses every
> profile and result between invocations, which is why the Dockerfile no longer
> defaults to one. `app/db.py` already sets `pool_pre_ping` and `pool_recycle`.

## Migrations

`RUN_MIGRATIONS=0` on Vercel is not optional.

A container runs one instance, so migrating at startup was safe. A serverless
function cold-starts repeatedly and concurrently, so `alembic upgrade head` on
the request path is both a migration race and dead weight on every cold start.
The deploy job runs it once, before the new code serves. Locally and in any
container deployment the variable is unset and startup behaves as it always did.

## What the pipeline does

| Job | Runs on | What it does |
|---|---|---|
| `backend` | every push and PR | applies migrations to a fresh SQLite database, pytest, then `validate_data.py` — errors there mean the engine would return a wrong answer |
| `frontend` | every push and PR | `tsc --noEmit`, the guardrail tests, then a real production build |
| `deploy` | `main` only, after both pass | migrations → database sync → backend deploy → frontend deploy → `/health` smoke test |

The backend deploys before the frontend: the frontend bakes `BACKEND_URL` into
its rewrite at build time and must not ship pointing at a backend that has not.

Deploying is not the same as working, so the last step polls `/health` and fails
the release if it never returns 200.

## Daily data refresh

`.github/workflows/daily-refresh.yml`, at `0 22 * * *` UTC (06:00 MYT), or on
demand from the Actions tab (`Run workflow`, optionally naming a single source).

It runs `scripts/daily_update.py`, validates the result, commits any changed
files under `data/`, and then runs `scripts/sync_db.py` to push those changes
into the live database. The commit to `main` triggers CI, which redeploys.

**Why it moved out of the backend.** It used to be a Cloudflare cron calling
`POST /admin/refresh`, and the container rewrote `data/` in place. A Vercel
function has nowhere to write and nothing to persist, so the job needs a
writable checkout — which is what a runner is.

**Why the database step exists.** `seed_if_empty` only populates an *empty*
catalog table, which is right on first boot and does nothing afterwards. Without
a sync, refreshed prices would sit in the repository and never reach the running
site. `sync_db.py` upserts on `(slug, variant)` and writes a price-history row
only when a price actually moved, so it is safe to run on every deploy and twice
in a row.

    # see what a sync would change, without writing
    DATABASE_URL=… python3 scripts/sync_db.py --dry-run

Point an uptime check at **`/health/data`**. It returns 503 when the refresh has
failed or has not run within 36 hours, which catches a schedule that has quietly
stopped firing. `/health` stays a plain liveness check.

## Function size — Large Functions are required

The backend bundle is **~744 MB**, against a 500 MB standard limit for the
Python runtime. It therefore runs as a **Large Function** (up to 5 GB on Fluid
compute), enabled by `VERCEL_SUPPORT_LARGE_FUNCTIONS=1`, which is set both on the
Vercel project and explicitly in the CI build step. Removing it breaks the
deploy with `Total bundle size (744.09 MB) exceeds the maximum function size`.

The weight is `scipy` (via `pymcdm`), `pandas`, `numpy`, and `pillow` (via
`reportlab`) — all load-bearing for the decision engine and the PDF report, so
none is trivially droppable. `requirements.txt` is already the runtime set only
(the test stack is in `requirements-dev.txt`), and `.vercelignore` plus the
function's `excludeFiles` keep `.venv/`, `tests/`, local databases and **`.env`**
out of the bundle. That last one matters: without it a developer's local `.env`
is bundled into the deployed function, shipping real credentials.

## Why backend/vercel-build.sh exists

`data/` and `scripts/` live at the repository root, but a project rooted at
`backend/` bundles only what is under `backend/`. The build script copies them in
when the parent is reachable and fails loudly when it is not, rather than
deploying an API that 500s on its first catalog read.

This means the backend **cannot** be deployed with a bare `vercel deploy`, which
uploads only `backend/` and builds remotely — the parent is not there. Deploy the
way CI does, from a full checkout:

    cd backend
    vercel build --prod && vercel deploy --prebuilt --prod

## Running locally

```bash
# backend
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env          # fill in GEMINI_API_KEYS if you want the real analyst
uvicorn app.main:app --reload --port 8000

# frontend
cd frontend && npm install
cp .env.local.example .env.local
npm run dev
```

Tests: `pytest tests/ -q` in `backend/`, `npm test` in `frontend/`. The
frontend's route checks skip themselves when no dev server is running, so the
suite is useful either way.
