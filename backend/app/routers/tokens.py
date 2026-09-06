from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..config import settings

router = APIRouter(prefix="/tokens", tags=["tokens"])


@router.post("/live")
async def issue_live_token() -> dict:
    """Direct API-key mode for the Gemini Live WebSocket (D-V1, D-V2).

    The frontend connects DIRECTLY to the Gemini Live WebSocket with the AI
    token — ephemeral constrained tokens (`auth_tokens/...`) are currently
    rejected server-side with 1011, so we hand the browser the API key as the
    socket credential (acceptable for a home/LAN install). api_version v1beta.
    Without GEMINI_API_KEY we return 501 so the client can fall back to
    guided text mode (per plan: fallback when mic access is denied).
    """
    if not settings.has_gemini:
        raise HTTPException(
            status_code=501,
            detail="GEMINI_API_KEY not configured — voice disabled, use text mode",
        )
    try:
        return {
            "token": settings.gemini_api_key,
            "model": settings.live_model,
            "api_version": "v1beta",
            "mode": "key",
        }
    except Exception as exc:  # pragma: no cover - depends on Google API
        raise HTTPException(status_code=502, detail=f"live token failed: {exc}") from exc