from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from ..services.analyst import extract_interview_profile

router = APIRouter(prefix="/interview", tags=["interview"])


class ExtractRequest(BaseModel):
    transcript: str
    lang: str = "en"


class ExtractResponse(BaseModel):
    profile: dict


@router.post("/extract", response_model=ExtractResponse)
async def extract(req: ExtractRequest) -> ExtractResponse:
    """Extract profile fields from interview transcript using Gemini."""
    profile = await extract_interview_profile(req.transcript, req.lang)
    return ExtractResponse(profile=profile)