from __future__ import annotations

from fastapi import APIRouter

from ..config import load_sponsor
from ..services.solar import solar_estimate
from ..schemas import INTERVIEW_QUESTIONS

router = APIRouter(prefix="/config", tags=["config"])


@router.get("/interview")
async def interview_script() -> dict:
    """The guided question script — shared by the form AND the Gemini Live function_tool (D-INT)."""
    return {"questions": INTERVIEW_QUESTIONS}


@router.get("/solar")
async def solar() -> dict:
    return {"solar": solar_estimate()}


@router.get("/sponsor")
async def sponsor() -> dict:
    return {"sponsor": load_sponsor()}