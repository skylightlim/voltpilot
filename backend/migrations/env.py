"""Alembic environment.

Reads DATABASE_URL rather than alembic.ini, so one set of migrations runs
against local SQLite and deployed Postgres with no config change and no
connection string in the repository.

When the app calls this at startup it passes its own async connection through
`config.attributes["connection"]`, so migrations run on the engine that is
already configured and no second database driver is needed. Invoked from the
command line with no connection, it builds one from DATABASE_URL.

An earlier version always rewrote the async URL to a sync driver (psycopg2).
That made the app depend on a driver nothing else used — and when it was
missing, startup failed while uvicorn kept the port bound, so the service
looked alive and answered nothing.
"""

from __future__ import annotations

import os
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import create_engine, pool

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import Base  # noqa: E402  (needs sys.path above)

config = context.config
if config.config_file_name:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


#: Async drivers this project actually uses. A URL naming one is run through an
#: async engine rather than rewritten to a sync driver.
ASYNC_DRIVERS = ("+asyncpg", "+aiosqlite")


def _raw_url() -> str:
    return os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./dev.db")


def _url() -> str:
    """DATABASE_URL with the async driver stripped, for standalone CLI use."""
    url = _raw_url()
    return url.replace("+aiosqlite", "").replace("+asyncpg", "")


def run_migrations_offline() -> None:
    context.configure(url=_url(), target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def _configure_and_run(connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        # SQLite cannot ALTER most things in place; batch mode rewrites the
        # table instead, so one migration works on both backends.
        render_as_batch=connection.dialect.name == "sqlite",
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    # Handed in by app.db.init_db via run_sync — reuse the app's own engine.
    existing = config.attributes.get("connection")
    if existing is not None:
        _configure_and_run(existing)
        return

    url = _raw_url()

    # Stripping the driver and letting SQLAlchemy pick the default worked for
    # SQLite, whose sync driver ships with Python, and failed for Postgres:
    # "postgresql://" defaults to psycopg2, which is not a dependency, so the
    # deploy job died at `alembic upgrade head` with ModuleNotFoundError while
    # the app itself — which hands in its own connection above — was fine.
    # Reuse the async driver already installed instead of adding a second one.
    if any(d in url for d in ASYNC_DRIVERS):
        import asyncio

        from sqlalchemy.ext.asyncio import create_async_engine

        async def run() -> None:
            engine = create_async_engine(url, poolclass=pool.NullPool)
            try:
                async with engine.connect() as connection:
                    await connection.run_sync(_configure_and_run)
            finally:
                await engine.dispose()

        asyncio.run(run())
        return

    engine = create_engine(_url(), poolclass=pool.NullPool)
    with engine.connect() as connection:
        _configure_and_run(connection)


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
