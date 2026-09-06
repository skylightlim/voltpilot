from __future__ import annotations

import json
from functools import lru_cache

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/
REPO_DIR = BASE_DIR.parent                         # repo root
DATA_DIR = Path(os.getenv("DATA_DIR", str(REPO_DIR / "data")))


class Settings:
    database_url: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./dev.db")
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")
    analyst_model: str = os.getenv("GEMINI_ANALYST_MODEL", "gemini-3.7-flash")
    live_model: str = os.getenv("GEMINI_LIVE_MODEL", "gemini-3.1-flash-live-preview")
    smtp_host: str = os.getenv("SMTP_HOST", "localhost")
    smtp_port: int = int(os.getenv("SMTP_PORT", "1025"))
    smtp_user: str = os.getenv("SMTP_USER", "")
    smtp_password: str = os.getenv("SMTP_PASSWORD", "")
    smtp_from: str = os.getenv("SMTP_FROM", "no-reply@ai-transport.local")
    smtp_tls: bool = os.getenv("SMTP_TLS", "false").lower() == "true"
    enable_email: bool = os.getenv("ENABLE_EMAIL", "true").lower() == "true"
    frontend_origin: str = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")

    @property
    def has_gemini(self) -> bool:
        return bool(self.gemini_api_key)


settings = Settings()

# ---- static data caches (seeded flat files; DB stores history/state) -----


@lru_cache(maxsize=None)
def load_data_json(name: str) -> dict:
    """Parse a seed file once per process.

    These files are static and ship with the image; re-reading them was ~50% of
    every scoring request (1.95 ms of 3.94 ms, catalog_vehicles.json alone).
    Cached values are shared, so callers must treat them as read-only —
    scoring.py already copies each row before touching it.
    """
    with open(DATA_DIR / name, encoding="utf-8") as fh:
        return json.load(fh)


def load_catalog() -> list[dict]:
    return load_data_json("catalog_vehicles.json")["vehicles"]


def load_tariff() -> dict:
    return load_data_json("tariff.json")


def load_fuel() -> dict:
    return load_data_json("fuel.json")


def load_policy() -> dict:
    return load_data_json("policy.json")


def load_solar() -> dict:
    return load_data_json("solar_avg.json")["solar"]


def load_sponsor() -> dict:
    return load_data_json("ad_sponsors.json")["sponsor"]


def load_policy_markdown() -> str:
    chunks: list[str] = []
    policy_dir = DATA_DIR / "policy"
    for md in sorted(policy_dir.glob("*.md")):
        chunks.append(f"--- {md.name} ---\n{md.read_text(encoding='utf-8')}")
    return "\n\n".join(chunks)