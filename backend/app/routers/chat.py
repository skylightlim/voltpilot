from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import ChatMessage, ChatSession, Profile, Recommendation, TopsisResult, get_db
from ..schemas import ChatRequest
from ..services.analyst import chat_reply

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("")
async def chat(body: ChatRequest, db: AsyncSession = Depends(get_db)):
    """Text chat against the analyst (voice path handled by the client via /tokens)."""
    result = await db.scalar(select(TopsisResult).where(TopsisResult.result_token == body.result_token))
    recommendation = await db.scalar(
        select(Recommendation).where(Recommendation.result_token == body.result_token)
    )
    profile = await db.scalar(select(Profile).where(Profile.token == body.result_token))
    if not result:
        raise HTTPException(status_code=404, detail="score first")

    session = await db.scalar(
        select(ChatSession).where(ChatSession.result_token == body.result_token)
    )
    if not session:
        session = ChatSession(result_token=body.result_token, mode="text")
        db.add(session)
        await db.flush()

    db.add(ChatMessage(session_id=session.id, role="user", content=body.message))
    ctx = {
        "ranking": result.ranking_json,
        "roadmap": (recommendation.analyst_json or {}).get("roadmap") if recommendation else None,
        "profile": profile.profile_json if profile else None,
    }
    reply = await chat_reply(ctx, body.message, body.language)
    db.add(ChatMessage(session_id=session.id, role="assistant", content=reply))
    await db.commit()
    return {"reply": reply, "session_id": session.id}


@router.get("/messages/{result_token}")
async def history(result_token: str, db: AsyncSession = Depends(get_db)):
    session = await db.scalar(
        select(ChatSession).where(ChatSession.result_token == result_token)
    )
    if not session:
        return {"messages": []}
    rows = (
        await db.scalars(
            select(ChatMessage).where(ChatMessage.session_id == session.id).order_by(ChatMessage.id)
        )
    ).all()
    return {"messages": [{"role": m.role, "content": m.content} for m in rows]}