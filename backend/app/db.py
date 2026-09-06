from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from .config import settings


class Base(DeclarativeBase):
    pass


def new_token() -> str:
    return uuid.uuid4().hex


class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    token: Mapped[str] = mapped_column(String(40), unique=True, index=True, default=new_token)
    profile_json: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class CatalogVehicle(Base):
    __tablename__ = "catalog_vehicles"
    __table_args__ = (UniqueConstraint("slug", "variant", name="uq_vehicle_slug_variant"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(80), index=True)
    brand: Mapped[str] = mapped_column(String(60))
    model: Mapped[str] = mapped_column(String(60))
    variant: Mapped[str] = mapped_column(String(60), default="")
    type: Mapped[str] = mapped_column(String(10))
    price_rm: Mapped[float] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(20), default="official")
    as_of_date: Mapped[str] = mapped_column(String(20), default="")
    ckd: Mapped[bool] = mapped_column(Boolean, default=False)
    specs: Mapped[dict] = mapped_column(JSON, default=dict)
    ownership: Mapped[dict] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class CatalogPriceHistory(Base):
    __tablename__ = "catalog_price_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(80), index=True)
    price_rm: Mapped[float] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(20))
    as_of_date: Mapped[str] = mapped_column(String(20))
    recorded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ExternalFactor(Base):
    __tablename__ = "external_factors"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(60), index=True)
    value_json: Mapped[dict] = mapped_column(JSON)
    as_of_date: Mapped[str] = mapped_column(String(20), default="")


class EngineScore(Base):
    __tablename__ = "engine_scores"

    id: Mapped[int] = mapped_column(primary_key=True)
    result_token: Mapped[str] = mapped_column(String(40), index=True)
    slug: Mapped[str] = mapped_column(String(80))
    scores_json: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class TopsisResult(Base):
    __tablename__ = "topsis_results"

    id: Mapped[int] = mapped_column(primary_key=True)
    result_token: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    weights: Mapped[dict] = mapped_column(JSON)
    ranking_json: Mapped[list] = mapped_column(JSON)
    engine_scores_json: Mapped[dict] = mapped_column(JSON)
    overview_json: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Recommendation(Base):
    __tablename__ = "recommendations"

    id: Mapped[int] = mapped_column(primary_key=True)
    result_token: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    analyst_json: Mapped[dict] = mapped_column(JSON)
    mock: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    result_token: Mapped[str] = mapped_column(String(40), index=True)
    mode: Mapped[str] = mapped_column(String(10), default="text")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("chat_sessions.id"), index=True)
    role: Mapped[str] = mapped_column(String(10))
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ReportRequest(Base):
    __tablename__ = "report_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    result_token: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    sent_to_email: Mapped[str] = mapped_column(String(200))
    sent_at: Mapped[datetime] = mapped_column(DateTime)
    send_count: Mapped[int] = mapped_column(Integer, default=1)


class BlockedSite(Base):
    __tablename__ = "blocked_sites"

    id: Mapped[int] = mapped_column(primary_key=True)
    site: Mapped[str] = mapped_column(String(200))
    error: Mapped[str] = mapped_column(Text, default="")
    fallback: Mapped[str] = mapped_column(Text, default="")
    logged_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# ---------------------------------------------------------------------------

_connect_args: dict = {}
if settings.database_url.startswith("postgresql+asyncpg"):
    import ssl
    _ssl_ctx = ssl.create_default_context()
    _ssl_ctx.check_hostname = False
    _ssl_ctx.verify_mode = ssl.CERT_NONE
    _connect_args["ssl"] = _ssl_ctx

_engine = create_async_engine(settings.database_url, echo=False, connect_args=_connect_args)
AsyncSessionLocal = async_sessionmaker(_engine, expire_on_commit=False)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


async def init_db() -> None:
    from sqlalchemy.ext.asyncio import AsyncEngine

    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def seed_if_empty(db: AsyncSession) -> None:
    from sqlalchemy import select, func

    count = await db.scalar(select(func.count()).select_from(CatalogVehicle))
    if count:
        return
    from . import seed

    await seed.run(db)