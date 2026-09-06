"""Alembic environment.

Reads DATABASE_URL rather than alembic.ini, so one set of migrations runs
against local SQLite and deployed Postgres with no config change and no
connection string in the repository.

Runs synchronously: the app's engine is async, but migrations are a one-shot
startup step and a sync driver keeps this simple. The async URL is rewritten to
its sync equivalent below.
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


def _sync_url() -> str:
    url = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./dev.db")
    return url.replace("+aiosqlite", "").replace("+asyncpg", "+psycopg2" if "postgresql" in url else "")


def run_migrations_offline() -> None:
    context.configure(url=_sync_url(), target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(_sync_url(), poolclass=pool.NullPool)
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            # SQLite cannot ALTER most things in place; batch mode rewrites the
            # table instead, so the same migration works on both backends.
            render_as_batch=connection.dialect.name == "sqlite",
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
