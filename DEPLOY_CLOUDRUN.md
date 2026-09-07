# Backend on Google Cloud Run

The frontend is on Vercel (`voltpilot`). This puts the FastAPI backend on Cloud
Run and points the frontend at it, replacing the laptop + tunnel setup.

## Why Cloud Run and not Vercel

Vercel caps a serverless function at 500 MB. `pymcdm` — the TOPSIS engine —
hard-requires numpy, scipy, pandas and matplotlib, which come to 259 MB before
any application code; `reportlab` pulls in pillow for another 19 MB. The build
measured **744 MB**. None of it is optional: they are install-time requirements,
not extras.

Cloud Run runs the container we already have, so nothing about the engine
changes. Measured resident memory is **240 MB**, stable through a scoring run.

## What is already prepared

| | |
| --- | --- |
| `Dockerfile` | Builds from the repo root; now binds `$PORT` per Cloud Run's contract |
| `.gcloudignore` | Keeps the source upload at ~26 MB instead of 3 GB |
| `scripts/deploy_cloudrun.sh` | One-command deploy, reads config from `backend/.env` |
| Database | Neon is already at head (`27a6d6aef384`, 12 tables) — no migration step |
| Google Cloud SDK | Installed at `~/google-cloud-sdk` (no sudo used) |

Secrets never leave the machine in the clear: the script writes them to a
mode-600 temp file that is deleted on exit, and never prints a value.

## What you need to do

**1. Create or pick a Google Cloud project, with billing enabled.**
Cloud Run's free tier (2M requests, 180k vCPU-seconds, 360k GiB-seconds per
month) still requires a billing account on file. Within those limits this
service costs nothing — it scales to zero when idle.

**2. Authenticate** (interactive, so it has to be you):

```
~/google-cloud-sdk/bin/gcloud auth login
~/google-cloud-sdk/bin/gcloud config set project YOUR_PROJECT_ID
```

**3. Enable the three APIs the deploy uses:**

```
~/google-cloud-sdk/bin/gcloud services enable \
  run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

**4. Deploy:**

```
./scripts/deploy_cloudrun.sh
```

Then tell me the URL it prints, or let me take it from
`gcloud run services describe`, and I will repoint the frontend.

## Settings the script uses, and why

- `--region asia-southeast1` — Singapore, closest to Malaysian users. **Move the
  Neon database here too.** The app is latency-bound on database round trips:
  from Ohio each one costs ~350 ms and the full result takes ~16 s; from
  Singapore that should fall to a few seconds. This is the single biggest win
  left.
- `--max-instances 1` — the analyst single-flight (`_pending`) and the rate
  limiter (`_hits`) are in-process by design. Two instances would mean duplicate
  Gemini calls and a doubled rate ceiling.
- `--min-instances 0` — scales to zero, so idle time is free. The cost is a cold
  start of a few seconds while scipy and pandas import.
- `--timeout 300` — `/results/{token}/recommendation` long-polls for up to 25 s.
- `RUN_MIGRATIONS=0` — with min-instances 0 the container cold-starts
  constantly; running `alembic upgrade head` on each one is slow and races
  itself. Run migrations deliberately when a revision is added:
  `RUN_MIGRATIONS=1` on one deploy, then set it back.

## After it is up

```
# 1. Check it
curl https://YOUR-SERVICE-URL/health
curl https://YOUR-SERVICE-URL/health/data

# 2. Repoint the frontend (note: use the GLOBAL vercel, not npx — the project's
#    local vercel@47.0.4 devDependency is too old for the deploy API)
cd frontend
vercel env rm BACKEND_URL production --yes
printf '%s' 'https://YOUR-SERVICE-URL' | vercel env add BACKEND_URL production
vercel deploy --prod --yes

# 3. Stop the laptop tunnel — it is no longer in the path
pkill -f "cloudflared tunnel"
```

`BACKEND_URL` is baked into the `/api/proxy` rewrite at build time, so changing
it always needs a redeploy of the frontend.

## Known limitations

- **`POST /admin/refresh` writes `data/refresh-state.json`.** Cloud Run's
  filesystem is in-memory and per-instance, so that file does not survive a
  restart. The daily refresh is better run as a Cloud Scheduler job or kept
  local; monitoring that reads `/health/data` will show a stale timestamp after
  any cold start.
- **Cold starts.** First request after idle pays the scipy/pandas import.
  `--min-instances 1` removes it but leaves the free tier.
- **Secrets are environment variables.** Fine to start. Google Secret Manager
  with `--set-secrets` is the hardening step, and needs no code change.
