from __future__ import annotations

import json
from functools import lru_cache

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/
REPO_DIR = BASE_DIR.parent                         # repo root

# In the repository, data/ sits beside backend/. A Vercel function bundles only
# what is under its root directory, so the build copies data/ and scripts/ in
# beside the app; there is no level above to look at. Prefer the repo layout and
# fall back to the bundled copy, which keeps one code path working in both
# without a deployment-specific environment variable.
_DEFAULT_DATA = REPO_DIR / "data"
if not _DEFAULT_DATA.is_dir():
    _DEFAULT_DATA = BASE_DIR / "data"
DATA_DIR = Path(os.getenv("DATA_DIR", str(_DEFAULT_DATA)))


class Settings:
    database_url: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./dev.db")
    # One key or several. GEMINI_API_KEYS takes a comma-separated list and the
    # analyst walks it in order, moving to the next when one hits its daily cap —
    # the free tier is a per-key, per-model daily quota, so a spare key is the
    # only thing that keeps the real analyst running once the first is spent.
    # GEMINI_API_KEY stays supported as the single-key form.
    gemini_api_keys: list[str] = [
        k.strip()
        for k in (os.getenv("GEMINI_API_KEYS") or os.getenv("GEMINI_API_KEY", "")).split(",")
        if k.strip()
    ]
    # Shared secret for POST /admin/refresh. Unset disables the endpoint rather
    # than leaving an unauthenticated trigger for outbound fetches and file writes.
    admin_token: str = os.getenv("ADMIN_TOKEN", "")
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

    # Contact block printed in the emailed PDF report — footer on every page and
    # the "talk to us" panel at the end.
    #
    # Deliberately empty by default. An unset line is omitted from the report
    # rather than printed as a placeholder: this document is emailed to a
    # customer and cannot be recalled, so a plausible-looking phone number that
    # nobody answers is worse than no phone number at all.
    report_agent_name: str = os.getenv("REPORT_AGENT_NAME", "")
    report_agent_phone: str = os.getenv("REPORT_AGENT_PHONE", "")
    # Falls back to the site the frontend is served from, which is already
    # configured per environment — so the website line is right without a second
    # variable to keep in step.
    report_website: str = os.getenv("REPORT_WEBSITE", "") or frontend_origin

    @property
    def gemini_api_key(self) -> str:
        """The first key. Gemini Live (POST /tokens/live) hands a single key to the
        browser and cannot rotate mid-session, so it always gets the primary."""
        return self.gemini_api_keys[0] if self.gemini_api_keys else ""

    @property
    def has_gemini(self) -> bool:
        return bool(self.gemini_api_keys)


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


def load_depreciation_curve() -> dict:
    """Retained-value curves fitted from matched used listings (5-year horizon).

    Built by scripts/used_market/build_depreciation_curve.py. Absent in a fresh
    checkout that has never run the scraper, so callers must tolerate {}.
    """
    try:
        return load_data_json("depreciation_curve.json")
    except FileNotFoundError:
        return {}


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


@lru_cache(maxsize=None)
def load_brand_contacts() -> dict[str, dict]:
    """Official Malaysian distributor contact per catalogue brand, keyed by the
    brand string the catalogue uses, case-folded.

    Lower-cased keys because the lookup side is a vehicle row's `brand`, and a
    catalogue that spells one brand "Gac" and another "GWM" would otherwise miss
    on capitalisation alone.
    """
    rows = load_data_json("brand_contacts.json")["contacts"]
    return {r["brand"].casefold(): r for r in rows}


def brand_contact(brand: str | None) -> dict | None:
    """The contact for a brand, or None when we have nothing useful to show.

    An entry whose website and phone are both unset is treated as absent: it
    exists in the file only to record that the gap is known, and rendering it
    would put an empty contact card in front of a reader.
    """
    if not brand:
        return None
    row = load_brand_contacts().get(str(brand).casefold())
    if not row or not (row.get("website") or row.get("phone")):
        return None
    return row


def load_policy_markdown() -> str:
    chunks: list[str] = []
    policy_dir = DATA_DIR / "policy"
    for md in sorted(policy_dir.glob("*.md")):
        chunks.append(f"--- {md.name} ---\n{md.read_text(encoding='utf-8')}")
    return "\n\n".join(chunks)