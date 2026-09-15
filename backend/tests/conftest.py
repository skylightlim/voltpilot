"""Test-wide safety net: the database under test is always a local SQLite file.

`app/config.py` calls `load_dotenv()`, and `backend/.env` on a development
machine points `DATABASE_URL` at the production Neon Postgres. Without this
file, `cd backend && pytest` runs the suite — including the fixtures that
create, seed and delete rows — against production. That is also why CI and a
dev machine disagreed: a test that depended on already-existing tables passed
here and failed on every runner.

`load_dotenv()` does not override a variable that is already set, so putting
the override here is enough. It has to happen before `app.config` is imported,
because `Settings.database_url` is a class attribute read at import time, not a
property re-read per call. conftest.py is imported before any test module, so
this runs first.

Set DATABASE_URL explicitly in the environment to point the suite somewhere
else; this only replaces the value that would otherwise come from .env.
"""
from __future__ import annotations

import os
import tempfile
from pathlib import Path

_TEST_DB = Path(tempfile.gettempdir()) / "voltpilot-pytest.db"
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_TEST_DB}"

# The refresh endpoint writes files and makes outbound calls; never leave a
# machine's real token in scope for a test run.
os.environ.pop("ADMIN_TOKEN", None)


def pytest_sessionstart(session):  # noqa: ARG001
    """Start from an empty database so row counts are deterministic."""
    _TEST_DB.unlink(missing_ok=True)
