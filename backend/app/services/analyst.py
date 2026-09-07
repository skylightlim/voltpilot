"""Gemini analyst (D12) with a deterministic mock fallback.

Model is configured via GEMINI_ANALYST_MODEL (see app/config.py).

Without GEMINI_API_KEY the backend still produces a coherent headline,
roadmap and trade-off summary so the full journey works offline.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from ..config import load_fuel, settings
from ..schemas import INTERVIEW_QUESTIONS

logger = logging.getLogger(__name__)


def _t(bm: str, en: str, lang: str) -> str:
    return bm if lang == "bm" else en


def mock_analyst(bundle: dict, lang: str) -> dict:
    ranking = bundle["ranking"]
    profile = bundle["profile"]
    solar = bundle["solar"]

    top: dict = ranking[0]
    second: dict = ranking[1]
    top_ev = next((r for r in ranking if r["type"] == "ev"), top)
    top_hybrid = next((r for r in ranking if r["type"] == "hybrid"), top)

    headline = _t(
        f"Cadangan kami: {top['brand']} {top['model']} {top['variant']}".strip(),
        f"Our recommendation: {top['brand']} {top['model']} {top['variant']}".strip(),
        lang,
    )

    annual = int(bundle["features"]["annual_km"] or 0)
    top_co2 = top["co2_kg_yr"]
    petrol_baseline = annual * 6.5 / 100 * 2.31  # L/100km * km / 100 * kg/L
    co2_saved_10yr = int((petrol_baseline - top_co2) * 10)

    if top["type"] == "ev":
        summary = _t(
            f"EV ini paling padan dengan gaya pemanduan anda ({annual:,} km setahun). "
            f"Kos elektrik di rumah sekitar RM{top['running_cost_raw']:,}/tahun berbanding "
            f"petrol hibrid RM{top_hybrid['running_cost_raw']:,}/tahun.",
            f"This EV fits your driving pattern best ({annual:,} km/year). Home charging runs "
            f"around RM{top['running_cost_raw']:,}/year versus RM{top_hybrid['running_cost_raw']:,}/year "
            f"for the top hybrid.",
            lang,
        )
    else:
        summary = _t(
            f"Hibrid ini paling stabil untuk perjalanan jauh anda tanpa perlu risau "
            f"tentang pengecasan. Kos bahan api ~RM{top['running_cost_raw']:,}/tahun.",
            f"This hybrid is the most hassle-free pick for your long trips with zero charging "
            f"worry. Fuel runs ~RM{top['running_cost_raw']:,}/year.",
            lang,
        )

    milestones = [
        {
            "year": 1,
            "title": _t("Beli & daftar", "Buy & register", lang),
            "detail": _t(
                f"Pilih {top['brand']} {top['model']}, uruskan pinjaman & insurans.",
                f"Pick the {top['brand']} {top['model']}, arrange financing & insurance.",
                lang,
            ),
        },
        {
            "year": 2,
            "title": _t("Caj di rumah", "Home charging", lang),
            "detail": _t(
                "Pasang charger rumah + ambil tarif EV TNB (RM0.25/kWh).",
                "Install a home charger and switch to TNB's EV tariff (RM0.25/kWh).",
                lang,
            )
            if profile.get("can_charge_home")
            else _t(
                "Cari langganan pengecas awam dengan kadar tetap terbaik.",
                "Pick a flat-rate public charging subscription with the best rate.",
                lang,
            ),
        },
        {
            "year": 3,
            "title": _t("Selenggara", "Service & insure", lang),
            "detail": _t("Servis berkala, semak semula insurans & jaminan bateri.", "Scheduled service; review insurance and the battery warranty.", lang),
        },
        {
            "year": 5,
            "title": _t("Nilai semula", "Re-evaluate", lang),
            "detail": _t(
                f"Nilai semula pasaran terpakai & keputusan naik taraf; anggaran jualan semula "
                f"{int(top['price_rm'] * float(top['ownership'].get('resale_10yr_pct', 50)) / 100):,}",
                f"Assess resale value & upgrade decision; est. resale "
                f"RM{int(top['price_rm'] * float(top['ownership'].get('resale_10yr_pct', 50)) / 100):,}",
                lang,
            ),
        },
    ]

    return {
        "mock": True,
        "headline": headline,
        "summary": summary,
        "pick_slug": top["slug"],
        "runner_up_slug": second["slug"],
        "top_ev_slug": top_ev["slug"],
        "top_hybrid_slug": top_hybrid["slug"],
        "roadmap": milestones,
        "savings": {
            "co2_saved_10yr_kg": co2_saved_10yr,
            "cost_rm_yr_top": int(top["running_cost_raw"]),
            # Read the price rather than restating it: this literal was RM2.05
            # while the engines were costing fuel from data/fuel.json, so the
            # headline baseline and the ranked results disagreed the moment the
            # pump price moved.
            "cost_rm_yr_petrol_baseline": int(
                annual * 6.5 / 100 * float(load_fuel()["fuel"]["ron95_rm_per_l"])
            ),
        },
        "tradeoffs": [
            _t(
                f"{top['brand']} {top['model']} cemerlang dari segi {top['type'] == 'ev' and 'kenderaan elektrik penuh' or 'hibrid'} tetapi "
                f"{'julat EV menuntut perancangan untuk perjalanan jauh' if top['type'] == 'ev' else 'kadar tol & nilai jualan semula perlu dipantau'}.",
                f"The {top['brand']} {top['model']} shines on "
                f"{'pure EV running costs' if top['type'] == 'ev' else 'long-haul flexibility'} but "
                f"{'its EV range needs planning on long trips' if top['type'] == 'ev' else 'watch resale and road tax'};",
                lang,
            ),
            _t(
                f"Alternatif {second['brand']} {second['model']} lebih kuat pada "
                f"{'nilai jualan semula' if second['type'] == 'hybrid' else 'infrastruktur pengecasan'}.",
                f"The alternative {second['brand']} {second['model']} is stronger on "
                f"{'resale value' if second['type'] == 'hybrid' else 'charging infrastructure'}.",
                lang,
            ),
        ],
        "solar_banner": solar or None,
    }


# ---------------------------------------------------------------------------
# Real Gemini analyst
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are the analyst AI for a Malaysian EV-vs-hybrid decision platform.
Given a user profile, preference weights, per-model engine scores, and a TOPSIS ranking
over the catalogue, write the headline recommendation and a staged roadmap.
Rules:
- Use relative years (Year 1, Year 3, Year 5). Never hardcode calendar years.
- Reply in the requested language (en or bm).
- Battery degradation stays a warning, never part of the core reasoning.
- Solar banner only if solar_banner is not null.
- Return STRICT JSON with keys:
  headline, summary, pick_slug, runner_up_slug, top_ev_slug, top_hybrid_slug,
  roadmap (array of {year:int,title,detail}), savings {co2_saved_10yr_kg, cost_rm_yr_top,
  cost_rm_yr_petrol_baseline}, tradeoffs (array of strings), solar_banner (null or dict).
- top_hybrid_slug must be the slug of the best-ranked hybrid in the ranking (never null).
"""


def _extract_json(text: str) -> dict:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("no JSON object in analyst output")
    return json.loads(text[start : end + 1])


# --- API key rotation -------------------------------------------------------
# The free tier meters requests per key per model per day, so one key is a hard
# daily ceiling on the real analyst. Several keys are walked in order: when one
# reports 429 it is put on cooldown and the next takes over. Only when every key
# is spent do we fall back to the deterministic mock.

_key_clients: dict[str, Any] = {}
_key_cooldown: dict[str, float] = {}   # key -> unix ts before which not to retry it


def _seconds_until_utc_midnight() -> float:
    now = datetime.now(timezone.utc)
    reset = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return (reset - now).total_seconds()


def _client_for(key: str) -> Any:
    from google import genai

    if key not in _key_clients:
        _key_clients[key] = genai.Client(api_key=key)
    return _key_clients[key]


def _key_label(key: str) -> str:
    """Identify a key in logs by position, never by value."""
    try:
        return f"#{settings.gemini_api_keys.index(key) + 1}/{len(settings.gemini_api_keys)}"
    except ValueError:  # pragma: no cover - key removed from config mid-process
        return "#?"


def _live_keys() -> list[str]:
    now = time.time()
    return [k for k in settings.gemini_api_keys if _key_cooldown.get(k, 0.0) <= now]


async def _with_key_rotation(run: Any) -> Any:
    """Run `run(client)` against each key that still has quota.

    A 429 retires that key until the daily quota resets and hands the call to the
    next one. Any other error belongs to the request, not the key, so it is raised
    immediately rather than burning the remaining keys on the same bad input.
    """
    keys = _live_keys()
    if not keys:
        raise RuntimeError("every Gemini key is out of quota")
    last_exc: Exception | None = None
    for key in keys:
        try:
            return await run(_client_for(key))
        except Exception as exc:
            code = getattr(exc, "code", None) or getattr(exc, "status_code", None)
            if code != 429:
                raise
            _key_cooldown[key] = time.time() + _seconds_until_utc_midnight()
            last_exc = exc
            logger.warning(
                "gemini key %s out of quota - rotating to the next key", _key_label(key)
            )
    logger.error("all %d gemini keys are out of quota - using mock until reset", len(keys))
    raise last_exc  # pragma: no cover - loop raises or returns above


# Gemini returns 503 UNAVAILABLE ("high demand") sporadically. A single blip used
# to drop the whole recommendation to the deterministic mock, so retry transient
# server-side errors before giving up.
_TRANSIENT_STATUS = {429, 500, 502, 503, 504}
_RETRY_DELAYS = (1.0, 3.0, 6.0)


def _is_daily_quota(exc: Exception) -> bool:
    """True when a 429 is a per-day cap rather than a recoverable per-minute one."""
    details = getattr(exc, "details", None)
    for block in (details or {}).get("error", {}).get("details", []) or []:
        for violation in block.get("violations", []) or []:
            if "PerDay" in str(violation.get("quotaId", "")):
                return True
    return False


async def _generate_with_retry(client: Any, *, contents: str, config: dict) -> Any:
    last_exc: Exception | None = None
    for attempt, delay in enumerate((*_RETRY_DELAYS, None)):
        try:
            return await client.aio.models.generate_content(
                model=settings.analyst_model,
                contents=contents,
                config=config,
            )
        except Exception as exc:
            code = getattr(exc, "code", None) or getattr(exc, "status_code", None)
            if code not in _TRANSIENT_STATUS or delay is None:
                raise
            # A per-day quota (free tier is 20 req/day/model) will not recover in
            # seconds - fail straight to the mock instead of stalling the request.
            if code == 429 and _is_daily_quota(exc):
                logger.error(
                    "analyst model %s daily quota exhausted - using mock until reset",
                    settings.analyst_model,
                )
                raise
            last_exc = exc
            logger.warning(
                "analyst model %s returned %s (attempt %d) - retrying in %.0fs",
                settings.analyst_model,
                code,
                attempt + 1,
                delay,
            )
            await asyncio.sleep(delay)
    raise last_exc  # pragma: no cover - loop always returns or raises above


async def gemini_analyst(bundle: dict, lang: str) -> dict | None:
    payload = {
        "profile": bundle["profile"],
        "weights": bundle["weights"],
        "ranking_top5": bundle["ranking"][:5],
        "solar_banner": bundle["solar"],
        "language": lang,
        "policy_context": bundle.get("policy_context", ""),
    }
    resp = await _with_key_rotation(
        lambda client: _generate_with_retry(
            client,
            contents=json.dumps(payload, ensure_ascii=False),
            config={"system_instruction": SYSTEM_PROMPT},
        )
    )
    data = _extract_json(resp.text or "")
    if not data.get("top_hybrid_slug"):
        hybrid = next((r for r in bundle["ranking"] if r["type"] == "hybrid"), None)
        if hybrid:
            data["top_hybrid_slug"] = hybrid["slug"]
    data["mock"] = False
    return data


async def build_recommendation(bundle: dict, lang: str) -> dict:
    """Try Gemini first; deterministic mock on missing key / parse failure / errors."""
    if settings.has_gemini:
        try:
            data = await gemini_analyst(bundle, lang)
            if data:
                return data
            logger.warning(
                "analyst model %s returned no data - falling back to mock",
                settings.analyst_model,
            )
        except Exception:
            logger.exception(
                "analyst model %s failed - falling back to mock",
                settings.analyst_model,
            )
    return mock_analyst(bundle, lang)


# ---------------------------------------------------------------------------
# Chat (text mode; voice handled by the Live session client-side)
# ---------------------------------------------------------------------------

CHAT_SYSTEM = """You are the friendly analyst for the Malaysian EV-vs-hybrid platform.
You see the user's profile, ranking and roadmap. Answer concisely (under 150 words).
If asked about battery degradation, explain it as a warning only (it does not change the
score). Reply in the user's language ({lang})."""


async def chat_reply(result: dict, message: str, lang: str) -> str:
    if not settings.has_gemini:
        return _mock_chat(result, message, lang)
    try:
        config = {
            "system_instruction": CHAT_SYSTEM.format(lang=lang)
            + "\n\nContext:\n"
            + json.dumps(
                {
                    "ranking_top5": result["ranking"][:5],
                    "roadmap": result.get("roadmap"),
                    "profile": result.get("profile"),
                },
                ensure_ascii=False,
            )
        }
        resp = await _with_key_rotation(
            lambda client: client.aio.models.generate_content(
                model=settings.analyst_model,
                contents=message,
                config=config,
            )
        )
        return (resp.text or "").strip()
    except Exception:
        return _mock_chat(result, message, lang)


def _mock_chat(result: dict, message: str, lang: str) -> str:
    top = result["ranking"][0]
    msg = message.lower()
    if any(k in msg for k in ("battery", "bateri", "degrad", "degradasi")):
        return _t(
            "Bateri EV merosot ~1-2% setahun secara purata. Jaminan bateri biasanya 8 tahun / "
            "160,000 km — perlindungan itu tidak mengubah skor cadangan (peringatan sahaja).",
            "EV batteries degrade roughly 1-2% a year on average. Battery warranty is typically "
            "8 years / 160,000 km — and that does not change your recommendation score "
            "(warning only).",
            lang,
        )
    if any(k in msg for k in ("solar")):
        return _t(
            "Dengan panel solar di rumah, kos pengecasan boleh turun ke hampir sifar pada siang "
            "hari. Pulangan purata Malaysia: bayar balik ~7-8 tahun.",
            "With rooftop solar at home your daytime charging cost can drop toward zero. "
            "Average Malaysia payback is around 7-8 years.",
            lang,
        )
    if any(k in msg for k in ("hybrid", "hibrid", "why", "kenapa")):
        return _t(
            f"Hibrid terbaik untuk anda ialah {top['brand']} {top['model']} sekiranya perjalanan "
            f"jauh tanpa pengecasan menjadi keutamaan; EV menguasai kos tahunan bila caj di rumah.",
            f"The best hybrid for you is the {top['brand']} {top['model']} if charging-free long "
            f"trips come first; EVs dominate annual cost when you can charge at home.",
            lang,
        )
    return _t(
        f"Berdasarkan ranking TOPSIS anda, {top['brand']} {top['model']} mendahului. "
        "Tanya saya tentang bateri, solar, atau perbandingan hibrid!",
        f"Based on your TOPSIS ranking, the {top['brand']} {top['model']} leads. "
        "Ask me about batteries, solar, or hybrid trade-offs!",
        lang,
    )


# ---------------------------------------------------------------------------
# Interview transcript extraction (D-INT)
# ---------------------------------------------------------------------------


async def extract_interview_profile(transcript: str, lang: str) -> dict:
    """Extract profile fields from interview transcript using Gemini.
    Falls back to deterministic mock if no key or parse failure.
    """
    if not settings.has_gemini:
        return _mock_extract(transcript, lang)

    try:
        # Build the prompt with the canonical interview questions
        questions = "\n".join(
            f'- {q["key"]}: {q["en"]}'
            for q in INTERVIEW_QUESTIONS
        )

        prompt = f"""You are an extraction engine for an EV vs hybrid interview transcript.
The user answered {len(INTERVIEW_QUESTIONS)} questions in {lang} (mixed language is possible).
Extract exactly these fields from the transcript:

{questions}

Rules:
- Return ONLY a JSON object with the extracted fields (omit fields not found).
- daily_km: number (0-2000)
- trips_per_week: number (0-7)
- long_trip_frequency: "rarely" | "monthly" | "weekly"
- destination_region: "kl" | "north" | "south" | "east_coast" | "east_malaysia"
- can_charge_home: boolean
- can_charge_work: boolean
- home_postcode: 5-digit string
- grid_region: "peninsular" | "east_malaysia"
- monthly_electricity_bill_rm: number (RM per month, 0 if the user is unsure)
- budget_max_rm: number (RM, the most they will spend on the car)
- consider_solar: boolean

Infer missing values from context where reasonable (e.g., city name -> region).
Return ONLY the JSON object, no markdown, no explanation."""

        resp = await _with_key_rotation(
            lambda client: client.aio.models.generate_content(
                model=settings.analyst_model,
                contents=prompt + "\n\nTranscript:\n" + transcript,
                config={"system_instruction": "Return ONLY the JSON object."},
            )
        )
        text = resp.text or ""
        # Clean up JSON
        text = text.strip()
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1:
            text = text[start:end + 1]
        return json.loads(text)
    except Exception:
        return _mock_extract(transcript, lang)


def _mock_extract(transcript: str, lang: str) -> dict:
    """Deterministic mock extraction from transcript using simple keyword matching."""
    t = transcript.lower()
    out = {}

    # Simple keyword extraction
    import re

    # daily_km
    km_match = re.search(r"(daily|harian).*?(\d{1,4})\s*km", t)
    if km_match:
        out["daily_km"] = float(km_match.group(2))
    elif "daily" in t or "harian" in t:
        nums = re.findall(r"\b(\d{1,4})\b", t)
        for n in nums:
            if 5 <= int(n) <= 300:
                out["daily_km"] = float(n)
                break

    # trips_per_week
    week_match = re.search(r"(days|hari).*?(\d)\s*(week|minggu)", t)
    if week_match:
        out["trips_per_week"] = float(week_match.group(2))
    elif "minggu" in t or "week" in t:
        nums = re.findall(r"\b([1-7])\b", t)
        for n in nums:
            if 1 <= int(n) <= 7:
                out["trips_per_week"] = float(n)
                break

    # long_trip_frequency
    if "weekly" in t or "minggu" in t or "kerap" in t:
        out["long_trip_frequency"] = "weekly"
    elif "monthly" in t or "bulan" in t:
        out["long_trip_frequency"] = "monthly"
    else:
        out["long_trip_frequency"] = "rarely"

    # destination_region
    regions = {
        "kl": ["kl", "kuala lumpur", "klang valley", "selangor", "putrajaya", "cyberjaya"],
        "north": ["penang", "pulau pinang", "perak", "ipoh", "taiping", "kedah", "alor setar"],
        "south": ["johor", "jb", "johor baru", "melaka", "seremban", "negeri sembilan"],
        "east_coast": ["kuantan", "terengganu", "pahang", "kelantan", "kota bharu"],
        "east_malaysia": ["sabah", "sarawak", "kuching", "kota kinabalu", "borneo"],
        "singapore": ["singapore", "sgp"],
    }
    for region, keywords in regions.items():
        if any(kw in t for kw in keywords):
            out["destination_region"] = region
            break

    # can_charge_home
    if any(kw in t for kw in ["yes", "ya", "boleh", "can charge", "bisa charge", "wallbox", "charger", "socket"]):
        out["can_charge_home"] = True
    elif any(kw in t for kw in ["no", "tidak", "tak boleh", "cannot", "condo", "apartment", "kondo"]):
        out["can_charge_home"] = False

    # home_postcode
    postcode_match = re.search(r"\b(\d{5})\b", t)
    if postcode_match:
        out["home_postcode"] = postcode_match.group(1)

    # consider_solar
    if any(kw in t for kw in ["solar", "yes", "ya", "pertimbang", "consider"]):
        out["consider_solar"] = True

    # can_charge_work — only when the workplace is actually mentioned, so a "yes"
    # about home charging cannot be read as a yes about work.
    work_ctx = re.search(r"(work|office|pejabat|tempat kerja)[^.?!]{0,60}", t)
    if work_ctx:
        seg = work_ctx.group(0)
        if any(kw in seg for kw in ["no", "cannot", "can't", "tidak", "tak "]):
            out["can_charge_work"] = False
        elif any(kw in seg for kw in ["yes", "can", "ya", "boleh"]):
            out["can_charge_work"] = True

    # grid_region — Peninsular unless East Malaysia is named.
    if any(kw in t for kw in ["sabah", "sarawak", "east malaysia", "malaysia timur", "borneo"]):
        out["grid_region"] = "east_malaysia"
    elif any(kw in t for kw in ["peninsular", "semenanjung", "west malaysia"]):
        out["grid_region"] = "peninsular"

    # monthly_electricity_bill_rm — needs a bill word nearby, or any RM figure
    # would be read as the electricity bill.
    bill = re.search(r"(bill|elektrik|electricity|tnb)[^.?!]{0,40}?(?:rm\s*)?(\d{2,5})", t)
    if bill:
        out["monthly_electricity_bill_rm"] = float(bill.group(2))

    # budget_max_rm — budget words, and accept "150k"/"150 ribu" shorthand.
    bud = re.search(r"(budget|bajet|spend|belanja)[^.?!]{0,40}?(?:rm\s*)?(\d{2,7})\s*(k|ribu)?", t)
    if bud:
        amount = float(bud.group(2))
        if bud.group(3):
            amount *= 1000
        out["budget_max_rm"] = amount

    return out