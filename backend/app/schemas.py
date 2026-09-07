from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

Lang = Literal["en", "bm"]

# ---------------------------------------------------------------------------
# Guided interview script — the single source of truth for BOTH the form
# (zod mirror on the frontend) and the Gemini Live function_tool calls (D-INT).
# Each question writes exactly one field of ProfileIn.
# 11 questions, matching /interview/form field for field. language comes from
# the UI toggle, and long_trip_km / work_postcode are inferred rather than asked.
# ---------------------------------------------------------------------------

INTERVIEW_QUESTIONS = [
    {
        "key": "daily_km",
        "kind": "number",
        "required": True,
        "en": "How far do you drive on a typical day? (km)",
        "bm": "Berapa km anda memandu pada hari biasa?",
    },
    {
        "key": "trips_per_week",
        "kind": "number",
        "required": True,
        "en": "About how many days a week do you drive?",
        "bm": "Berapa hari seminggu anda memandu?",
    },
    {
        "key": "long_trip_frequency",
        "kind": "choice",
        "options": ["rarely", "monthly", "weekly"],
        "required": True,
        "en": "How often do you take long trips (over 100 km)?",
        "bm": "Berapa kerap anda buat perjalanan jauh (lebih 100 km)?",
    },
    {
        "key": "destination_region",
        "kind": "choice",
        "options": ["kl", "north", "south", "east_coast", "east_malaysia"],
        "required": True,
        "en": "Where do your long trips usually go?",
        "bm": "Biasanya perjalanan jauh anda pergi ke mana?",
    },
    {
        "key": "can_charge_home",
        "kind": "boolean",
        "required": True,
        "en": "Can you charge at home (a power socket or planned charger near your parking)?",
        "bm": "Bolehkah anda mengecas di rumah (ada soket kuasa atau pengecas di tempat letak kereta anda)?",
    },
    {
        "key": "can_charge_work",
        "kind": "boolean",
        "required": False,
        "en": "Can you also charge at your workplace?",
        "bm": "Bolehkah anda juga mengecas di tempat kerja?",
    },
    {
        "key": "home_postcode",
        "kind": "postcode",
        "required": True,
        "en": "What is your home postcode? (5 digits)",
        "bm": "Apakah poskod rumah anda? (5 digit)",
    },
    {
        "key": "grid_region",
        "kind": "choice",
        "options": ["peninsular", "east_malaysia"],
        "required": False,
        # Peninsular is gas/coal heavy; hydro-dominant Sarawak pulls East Malaysia
        # to roughly half the CO2 per kWh, so this changes the environment score.
        "en": "Is your home on the Peninsular grid, or in East Malaysia (Sabah/Sarawak)?",
        "bm": "Adakah rumah anda di grid Semenanjung, atau di Malaysia Timur (Sabah/Sarawak)?",
    },
    {
        "key": "monthly_electricity_bill_rm",
        "kind": "number",
        "required": False,
        # A heavy household is already high up the TNB tariff blocks, so EV
        # charging lands at a higher marginal rate than a light one.
        "en": "Roughly what is your monthly electricity bill? (RM, say zero if unsure)",
        "bm": "Lebih kurang berapa bil elektrik bulanan anda? (RM, sebut sifar jika tidak pasti)",
    },
    {
        "key": "budget_max_rm",
        "kind": "number",
        "required": False,
        "en": "What is your maximum budget for the car? (RM)",
        "bm": "Berapakah bajet maksimum anda untuk kereta? (RM)",
    },
    {
        "key": "consider_solar",
        "kind": "boolean",
        "required": False,
        "en": "Are you considering solar panels at home?",
        "bm": "Adakah anda mempertimbangkan panel solar di rumah?",
    },
]

REQUIRED_KEYS = {q["key"] for q in INTERVIEW_QUESTIONS if q["required"]}


class ProfileIn(BaseModel):
    language: Lang = "en"
    daily_km: float = Field(ge=0, le=2000)
    trips_per_week: float = Field(ge=0, le=7)
    long_trip_frequency: Literal["rarely", "monthly", "weekly"] = "rarely"
    long_trip_km: float = Field(default=0, ge=0, le=5000)
    destination_region: Literal["kl", "north", "south", "east_coast", "east_malaysia", "singapore"] = "kl"
    can_charge_home: bool = True
    can_charge_work: bool = False
    home_postcode: str = Field(default="", max_length=5)
    work_postcode: str = Field(default="", max_length=5)
    consider_solar: bool = False
    budget_max_rm: float = Field(default=0, ge=0)
    # Which grid supplies the home charger. Peninsular is gas/coal heavy; East
    # Malaysia is pulled down by hydro-dominant Sarawak, so the same kWh carries
    # roughly half the CO2 (see data/fuel.json co2_factors).
    grid_region: Literal["peninsular", "east_malaysia"] = "peninsular"
    # Existing household draw. TNB Domestic ToU is blocked, so a heavy household
    # pays a higher MARGINAL rate once EV charging is added on top.
    monthly_electricity_bill_rm: float = Field(default=0, ge=0, le=100000)

    def missing_required(self) -> list[str]:
        # "blank" means None/empty for strings, default-unset for numbers.
        missing = []
        for k in REQUIRED_KEYS:
            v = getattr(self, k, None)
            if v is None or v == "" or (k == "home_postcode" and len(str(v)) != 5) or (k == "budget_max_rm" and v == 0):
                if k in ("language", "daily_km", "trips_per_week", "long_trip_frequency", "destination_region", "can_charge_home", "home_postcode"):
                    missing.append(k)
        return missing


class PreferenceWeights(BaseModel):
    save_money: float = Field(default=50, ge=0, le=100)
    environment: float = Field(default=50, ge=0, le=100)
    convenience: float = Field(default=50, ge=0, le=100)
    future_proofing: float = Field(default=50, ge=0, le=100)


class ScoreRequest(BaseModel):
    token: str = Field(min_length=5, max_length=40)
    profile: ProfileIn
    weights: PreferenceWeights


class ChatRequest(BaseModel):
    result_token: str
    message: str
    language: Lang = "en"


class ReportRequest(BaseModel):
    result_token: str
    email: str = Field(min_length=5, max_length=254)


class LiveTokenRequest(BaseModel):
    pass


class LiveTokenResponse(BaseModel):
    token: str
    model: str


class ProfileResponse(BaseModel):
    token: str
    missing_required: list[str]
    next_step: str