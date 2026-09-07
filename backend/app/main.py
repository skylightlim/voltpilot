from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import AsyncSessionLocal, init_db, seed_if_empty
from .ratelimit import rate_limit_middleware
from .routers import admin, chat, config, interview, profiles, report, results, score, tokens


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Bring the schema up and seed, unless something else already did.

    A container runs one instance, so doing this at startup was safe. A
    serverless function is a different shape: it cold-starts repeatedly and
    concurrently, so `alembic upgrade head` on the request path is both a
    migration race and dead weight on every cold start. Set RUN_MIGRATIONS=0
    where the deploy pipeline runs migrations itself (see the Vercel deploy job
    in .github/workflows/ci.yml). It defaults to on, so local dev and any
    container deployment behave exactly as before.
    """
    if os.getenv("RUN_MIGRATIONS", "1").lower() not in {"0", "false", "no"}:
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
    resolved = list(dict.fromkeys(o for o in origins if o))
    if os.getenv("ENV", "development").lower() == "production":
        # A production deployment still pointing at localhost means
        # FRONTEND_ORIGIN was never set. CORS will then reject every browser
        # request while /health stays green, so say it loudly at startup.
        if not resolved or all("localhost" in o or "127.0.0.1" in o for o in resolved):
            logging.getLogger("uvicorn.error").error(
                "FRONTEND_ORIGIN is unset or still localhost in production — "
                "every browser request will fail CORS. Set it to the deployed "
                "frontend URL (wrangler.toml [vars] or an environment variable)."
            )
    return resolved


app = FastAPI(
    title="AI Transportation Decision Intelligence Platform",
    version="0.1.0",
    description="EV vs hybrid decision intelligence for Malaysia (mobile-first).",
    lifespan=lifespan,
)

# Before CORS so a throttled request is cheap. Health checks are exempt inside
# the middleware — throttling a monitor turns a healthy service red.
app.middleware("http")(rate_limit_middleware)

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