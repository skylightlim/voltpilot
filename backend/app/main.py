from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import AsyncSessionLocal, init_db, seed_if_empty
from .routers import chat, config, interview, profiles, report, results, score, tokens


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    async with AsyncSessionLocal() as db:
        await seed_if_empty(db)
    yield


app = FastAPI(
    title="AI Transportation Decision Intelligence Platform",
    version="0.1.0",
    description="EV vs hybrid decision intelligence for Malaysia (mobile-first).",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin, "http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3100", "http://127.0.0.1:3100", "http://192.168.0.75:3100"],
    allow_origin_regex=r"https://.*\.trycloudflare\.com",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (profiles.router, score.router, results.router, chat.router, tokens.router, report.router, config.router, interview.router):
    app.include_router(r)


@app.get("/health")
async def health() -> dict:
    return {"ok": True, "gemini": settings.has_gemini}