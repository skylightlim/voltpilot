from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import AsyncSessionLocal, init_db, seed_if_empty
from .routers import admin, chat, config, interview, profiles, report, results, score, tokens


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    async with AsyncSessionLocal() as db:
        await seed_if_empty(db)
    yield


def _allowed_origins() -> list[str]:
    """Configured production origin, plus local dev hosts when not in production.

    Extra origins can be added with a comma-separated EXTRA_CORS_ORIGINS, so a
    preview deployment does not need a code change.
    """
    origins = [settings.frontend_origin]
    origins += [o.strip() for o in os.getenv("EXTRA_CORS_ORIGINS", "").split(",") if o.strip()]
    if os.getenv("ENV", "development").lower() != "production":
        origins += [
            "http://localhost:3000", "http://127.0.0.1:3000",
            "http://localhost:3100", "http://127.0.0.1:3100",
        ]
    return list(dict.fromkeys(origins))


app = FastAPI(
    title="AI Transportation Decision Intelligence Platform",
    version="0.1.0",
    description="EV vs hybrid decision intelligence for Malaysia (mobile-first).",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    # Production origin comes from FRONTEND_ORIGIN. The localhost entries are
    # for local development only and are harmless in production because no
    # browser can reach them from another host. The LAN address that used to sit
    # here was one developer's LAN address and could not work anywhere else.
    allow_origins=_allowed_origins(),
    allow_origin_regex=r"https://.*\.trycloudflare\.com",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (profiles.router, score.router, results.router, chat.router, tokens.router, report.router, config.router, interview.router, admin.router):
    app.include_router(r)


@app.get("/health")
async def health() -> dict:
    """Liveness. The API is up and serving."""
    return {"ok": True, "gemini": settings.has_gemini}


@app.get("/health/data")
async def health_data(response: Response) -> dict:
    """Freshness of the daily data refresh — the URL to point a monitor at.

    Returns 503 when the refresh has failed or has not run, so an uptime check
    alerts instead of the staleness being noticed by a user. Unauthenticated and
    free of secrets: a monitor cannot carry a bearer token, and this reveals only
    whether a scheduled job ran.
    """
    ok, detail = admin.refresh_health()
    if not ok:
        response.status_code = 503
    return {"ok": ok, **detail}