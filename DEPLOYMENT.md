# Deployment

Frontend on Cloudflare Pages, backend as a Cloudflare Container behind a
Durable Object. `.github/workflows/ci.yml` tests every push and deploys `main`.

Nothing in the repository depends on a particular machine — no absolute paths,
no LAN addresses, every environment variable documented in `backend/.env.example`
and `frontend/.env.local.example`.

## One-time setup

### 1. GitHub repository secrets

`Settings → Secrets and variables → Actions → Secrets`

| Secret | Where to get it |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard → My Profile → API Tokens. Needs **Workers Scripts: Edit**, **Cloudflare Pages: Edit**, and **Workers R2/Containers** if prompted. |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → Workers & Pages → Account ID (right sidebar) |

### 2. GitHub repository variables

`Settings → Secrets and variables → Actions → Variables`

| Variable | Example | Why |
|---|---|---|
| `BACKEND_URL` | `https://ai-transport-backend.<subdomain>.workers.dev` | Baked into the `/api/proxy` rewrite **at build time**. The build fails loudly if it is missing rather than shipping a placeholder host. |

A variable, not a secret: it is a public URL and CI needs to interpolate it into
a build argument.

### 3. Cloudflare Worker secrets

These belong to the deployed backend, not to CI. Run once from `backend/`:

```bash
wrangler secret put DATABASE_URL     # managed Postgres — see the warning below
wrangler secret put GEMINI_API_KEY
wrangler secret put ADMIN_TOKEN      # openssl rand -hex 24
wrangler secret put ALERT_WEBHOOK_URL  # optional: Slack/Discord incoming webhook
# email delivery for the PDF report
wrangler secret put SMTP_HOST
wrangler secret put SMTP_USER
wrangler secret put SMTP_PASSWORD
```

> **The container filesystem is ephemeral.** `DATABASE_URL` must point at a
> managed Postgres. SQLite on the container's own disk loses every profile and
> result on each restart or redeploy, which is why the Dockerfile no longer
> defaults to one. `app/db.py` already sets `pool_pre_ping` and `pool_recycle`
> for a managed instance.

### 4. Cloudflare Pages project

Create a Pages project named `voltpilot` once, or change `--project-name` in the
deploy step. CI pushes builds to it; no Pages build configuration is needed
because the workflow builds and uploads the output itself.

## What the pipeline does

| Job | Runs on | What it checks |
|---|---|---|
| `backend` | every push and PR | pytest, then `validate_data.py` — errors mean the engine would return a wrong answer |
| `frontend` | every push and PR | `tsc --noEmit`, the guardrail tests, then a real production build |
| `deploy` | `main` only, after both pass | Pages upload, container deploy, then a `/health` smoke test with retries for the cold start |

Deploying is not the same as working, so the last step polls `/health` and fails
the release if it never returns 200.

## Daily data refresh

`wrangler.toml` carries a cron trigger at `0 22 * * *` UTC (06:00 MYT). It calls
`POST /admin/refresh`, which is bearer-guarded by `ADMIN_TOKEN`. Without that
secret the endpoint disables itself and the data silently stops updating — so
set it.

Point an uptime check at **`/health/data`**. It returns 503 when the refresh has
failed or has not run within 36 hours, which catches a cron that has quietly
stopped firing. `/health` stays a plain liveness check.

## Running locally

```bash
# backend
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # fill in GEMINI_API_KEY if you want the real analyst
uvicorn app.main:app --reload --port 8000

# frontend
cd frontend && npm install
cp .env.local.example .env.local
npm run dev
```

Tests: `pytest tests/ -q` in `backend/`, `npm test` in `frontend/`. The
frontend's route checks skip themselves when no dev server is running, so the
suite is useful either way.
