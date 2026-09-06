# AI Transportation Decision Intelligence Platform

Mobile-first Malaysian-market platform that helps a buyer choose between a **new EV** or a **hybrid**, computes a per-model ranked recommendation (TOPSIS + 5 domain engines), explains it with Gemini as analyst AI, and ships a PDF email report.

Deployment: see `DEPLOYMENT.md`. Frontend design and motion rules: `frontend/DESIGN.md`.

An earlier specification described 108 vehicles and three TOPSIS criteria; that revision was
superseded. The shipping framework is 184 trims on six criteria.

## Stack (per plan)

- `frontend/` — Next.js 15 (App Router, TypeScript, mobile-first 375px base, Tailwind, shadcn-style primitives, R3F + GSAP lie-room)
- `backend/` — FastAPI (Python 3.12), SQLAlchemy async + Postgres (SQLite fallback for local dev), pandas/numpy, pymcdm TOPSIS, ReportLab PDF, smtplib email
- `agent/` — ephemeral-token issuer for Gemini Live API (thin FastAPI endpoint; NO LiveKit — D-V1/D-V2)
- `scraper/` — Scrapy + Playwright + Flare-Solverr, Celery beat daily (D9, D11)
- `data/` — seeds: catalog (184 trims), tariff, fuel, policy, solar_avg, ad_sponsors, policy/*.md
- `docker-compose.yml` — frontend · backend · postgres · redis · celery-worker+beat · flare-solverr · mailhog

## Run locally (no Docker)

```bash
# Backend
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend && npm install && npm run dev
```

Open http://localhost:3000. Backend docs: http://localhost:8000/docs.

Optional `GEMINI_API_KEY` in `backend/.env` powers the real Gemini analyst; without it the backend runs a deterministic mock analyst so the whole journey still works.

## Key decisions (locked)

- Decision method: TOPSIS (`pymcdm`) over 184 catalog trims on six criteria, weighted by four user
  sliders. See `/methodology` and `frontend/DESIGN.md`.
- Voice: Gemini 3.1 Flash Live (`gemini-3.1-flash-live-preview`) native audio — LiveKit deleted.
- Solar = conditional banner only (static avg-Malaysia). Battery degradation = warning only.
- No auth: anonymous profile token. PDF email: single-send + email bind.
- Mobile is the primary viewport. Touch-first, thumb-zone, 48px tap targets.