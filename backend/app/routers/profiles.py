from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import Profile, get_db
from ..schemas import ProfileIn, ProfileResponse

router = APIRouter(prefix="/profile", tags=["profile"])


@router.post("", response_model=ProfileResponse)
async def create_or_update_profile(body: ProfileIn, db: AsyncSession = Depends(get_db)):
    missing = body.missing_required()
    row = Profile(profile_json=body.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return ProfileResponse(
        token=row.token,
        missing_required=missing,
        # Backend re-asks any blank required field before /score runs (D-INT).
        next_step=("reask" if missing else "sliders"),
    )


@router.get("/{token}", response_model=ProfileResponse)
async def get_profile(token: str, db: AsyncSession = Depends(get_db)):
    row = await db.scalar(select(Profile).where(Profile.token == token))
    if not row:
        raise HTTPException(status_code=404, detail="profile not found")
    profile = ProfileIn(**row.profile_json)
    missing = profile.missing_required()
    return ProfileResponse(
        token=row.token,
        missing_required=missing,
        next_step=("reask" if missing else "sliders"),
    )