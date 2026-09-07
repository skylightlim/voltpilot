"""Guardrails for the data pipeline.

Every failure encoded here is one that actually happened and shipped unnoticed,
so each test names the defect it exists to catch rather than describing an
abstract property.
"""

from __future__ import annotations

import contextlib
import importlib.util
import json
import io
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
SCRIPT_DIRS = (REPO / "scripts", REPO / "scraper")


def _scripts() -> list[Path]:
    out: list[Path] = []
    for d in SCRIPT_DIRS:
        out += [p for p in sorted(d.rglob("*.py")) if p.name != "__init__.py"]
    return out


def _import(path: Path):
    """Import a script by path with its stdout swallowed."""
    spec = importlib.util.spec_from_file_location(f"_t_{path.stem}", path)
    assert spec and spec.loader, f"cannot build a spec for {path}"
    mod = importlib.util.module_from_spec(spec)
    with contextlib.redirect_stdout(io.StringIO()):
        spec.loader.exec_module(mod)
    return mod


def test_there_are_scripts_to_check():
    """Guard the guard: a bad glob would make every test below vacuously pass."""
    assert len(_scripts()) >= 15


@pytest.mark.parametrize("path", _scripts(), ids=lambda p: p.name)
def test_script_imports(path: Path):
    """Every script must import on a machine that is not the author's.

    13 of 21 scripts once failed here: eight did
    sys.path.insert(0, "/home/skylight/...") — a username that exists on no
    current machine — and two read a JSON export from a Downloads folder at
    module level, which also took down the script that imported from them.
    """
    _import(path)


def test_no_absolute_home_paths():
    """Paths must derive from __file__, not from one developer's home directory."""
    offenders = []
    for p in _scripts():
        for n, line in enumerate(p.read_text(encoding="utf-8").splitlines(), 1):
            if "/home/" in line and "Path(__file__)" not in line and not line.lstrip().startswith("#"):
                offenders.append(f"{p.relative_to(REPO)}:{n}")
    assert not offenders, "hard-coded home paths: " + ", ".join(offenders)


def test_scraper_imports_are_declared():
    """A third-party import used by the scripts must be in requirements.txt.

    `requests` was imported by http_client.py and ev_stations.py while absent
    from requirements.txt; it only worked locally because the venv had it
    transitively, and the daily refresh would have failed inside the container.
    """
    reqs = (REPO / "backend" / "requirements.txt").read_text(encoding="utf-8").lower()
    third_party = {"requests", "httpx", "pandas", "numpy"}
    used = set()
    for p in _scripts():
        text = p.read_text(encoding="utf-8")
        for name in third_party:
            if f"import {name}" in text:
                used.add(name)
    missing = sorted(n for n in used if n not in reqs)
    assert not missing, f"imported by scripts but not declared: {missing}"


def test_catalog_passes_validation():
    """The catalog must carry no error-level defect.

    validate_data separates errors (the engine returns a wrong answer) from
    warnings (it falls back to a documented default). Warnings are allowed
    through; errors are not.
    """
    mod = _import(REPO / "scripts" / "validate_data.py")
    errors = [f for f in mod.validate() if f["level"] == "error"]
    assert not errors, "data errors:\n" + "\n".join(
        f"  {e['check']}: {e['detail']} {e['ids']}" for e in errors
    )


def test_insurance_scripts_do_not_clobber_each_other():
    """The two insurance computers must only touch their own powertrains.

    Both used to pop insurance_rm_yr for every out-of-scope vehicle, so running
    one after the other wiped the other's work and the catalog could never hold
    premiums for more than one powertrain at a time.
    """
    for name in ("compute_insurance.py", "compute_insurance_ev.py"):
        src = (REPO / "scripts" / "used_market" / name).read_text(encoding="utf-8")
        apply_block = src[src.index("by_id = {r[0]"):]
        assert "continue" in apply_block.split("ownership.pop")[0], (
            f"{name} reaches ownership.pop without first skipping rows it does not own"
        )


def test_every_critical_figure_is_attributed():
    """Price, road tax and insurance must each say how they are known.

    Road tax validates against the JPJ schedule exactly; maintenance is 22
    hand-entered numbers. Without provenance those look identical in the JSON,
    which undercuts the one claim the product makes about itself.
    """
    catalog = json.loads((REPO / "data" / "catalog_vehicles.json").read_text())
    allowed = {"measured", "computed", "estimated"}
    missing, bad_method = [], []
    for v in catalog["vehicles"]:
        prov = v.get("provenance") or {}
        for field in ("price_rm", "road_tax_rm", "insurance_rm_yr"):
            present = v.get(field) is not None or v.get("ownership", {}).get(field) is not None
            if present and field not in prov:
                missing.append(f"{v['id']}.{field}")
        for field, entry in prov.items():
            if entry.get("method") not in allowed:
                bad_method.append(f"{v['id']}.{field}={entry.get('method')}")
    assert not missing, f"unattributed: {missing[:8]}"
    assert not bad_method, f"unknown method: {bad_method[:8]}"


# ---------------------------------------------------------------------------
# Daily refresh observability
# ---------------------------------------------------------------------------


def _refresh_health(tmp_state, monkeypatch):
    from app.routers import admin
    monkeypatch.setattr(admin, "REFRESH_STATE", tmp_state)
    return admin.refresh_health()


def test_health_data_is_red_when_the_job_never_ran(tmp_path, monkeypatch):
    ok, detail = _refresh_health(tmp_path / "absent.json", monkeypatch)
    assert ok is False
    assert "ever been recorded" in detail["reason"]


def test_health_data_is_red_when_the_cron_stopped_firing(tmp_path, monkeypatch):
    """The failure mode file mtimes cannot see.

    A cron that silently stops leaves every data file untouched and quietly
    ageing, so nothing based on mtimes trips. Keying on the run record does.
    """
    from datetime import datetime, timedelta, timezone
    p = tmp_path / "state.json"
    p.write_text(json.dumps({
        "finished_at": (datetime.now(timezone.utc) - timedelta(hours=50)).isoformat(),
        "status": "ok", "succeeded": ["fuel"], "failed": [],
    }))
    ok, detail = _refresh_health(p, monkeypatch)
    assert ok is False
    assert "missed a run" in detail["reason"]


def test_health_data_is_red_when_the_last_run_failed(tmp_path, monkeypatch):
    from datetime import datetime, timezone
    p = tmp_path / "state.json"
    p.write_text(json.dumps({
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "status": "failed", "succeeded": [], "failed": ["fuel"],
    }))
    ok, _ = _refresh_health(p, monkeypatch)
    assert ok is False


def test_health_data_is_green_after_a_good_run(tmp_path, monkeypatch):
    from datetime import datetime, timezone
    p = tmp_path / "state.json"
    p.write_text(json.dumps({
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "status": "ok", "succeeded": ["fuel", "registrations"], "failed": ["ev_stations"],
    }))
    ok, detail = _refresh_health(p, monkeypatch)
    # One dead upstream among several is still a green run.
    assert ok is True
    assert detail["failed"] == ["ev_stations"]


# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------


def _client(raise_server_exceptions: bool = True):
    from fastapi.testclient import TestClient
    from app.main import app
    from app import ratelimit
    ratelimit.reset()
    return TestClient(app, raise_server_exceptions=raise_server_exceptions), ratelimit


def test_health_is_never_rate_limited():
    """Monitors poll /health. Throttling it turns a healthy service red."""
    client, _ = _client()
    for _ in range(200):
        assert client.get("/health").status_code == 200


def test_expensive_endpoint_is_capped_per_client():
    """/score runs the whole engine; unauthenticated and uncapped it is a bill."""
    client, rl = _client()
    limit = rl.limit_for("/score")
    hdr = {"CF-Connecting-IP": "203.0.113.1"}
    codes = [client.post("/score", json={}, headers=hdr).status_code for _ in range(limit + 3)]
    assert 429 not in codes[:limit], "throttled before reaching the limit"
    assert codes[-1] == 429, "never throttled past the limit"


def test_one_client_cannot_throttle_another():
    client, rl = _client()
    limit = rl.limit_for("/score")
    noisy = {"CF-Connecting-IP": "203.0.113.2"}
    for _ in range(limit + 2):
        client.post("/score", json={}, headers=noisy)
    quiet = client.post("/score", json={}, headers={"CF-Connecting-IP": "203.0.113.3"})
    assert quiet.status_code != 429


def test_a_throttled_response_says_when_to_retry():
    client, rl = _client()
    hdr = {"CF-Connecting-IP": "203.0.113.4"}
    for _ in range(rl.limit_for("/score") + 1):
        r = client.post("/score", json={}, headers=hdr)
    assert r.status_code == 429
    assert int(r.headers["Retry-After"]) >= 1
    assert "retry_after_seconds" in r.json()


def test_buckets_are_independent_per_endpoint():
    """Exhausting /score must not lock a user out of reading their results.

    The results lookup is allowed to fail here — this asserts the rate limiter
    keeps a separate bucket per endpoint, not that the read succeeds. Without
    raise_server_exceptions=False the test passed only on a machine that already
    had ./dev.db: a fresh checkout has no topsis_results table, SQLAlchemy
    raises, TestClient re-raises it, and CI failed while every developer's
    machine stayed green.
    """
    client, rl = _client(raise_server_exceptions=False)
    hdr = {"CF-Connecting-IP": "203.0.113.5"}
    for _ in range(rl.limit_for("/score") + 2):
        client.post("/score", json={}, headers=hdr)
    assert client.get("/results/nonexistent", headers=hdr).status_code != 429


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------


def test_init_db_builds_a_fresh_database(tmp_path, monkeypatch):
    """The app must reach a serving state from an empty database."""
    import asyncio
    import importlib
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path/'fresh.db'}")
    import app.config, app.db
    importlib.reload(app.config); db = importlib.reload(app.db)

    asyncio.run(db.init_db())

    import sqlite3
    names = {r[0] for r in sqlite3.connect(tmp_path / "fresh.db")
             .execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert "profiles" in names
    assert "alembic_version" in names, "migrations did not record a revision"


def test_init_db_adopts_a_database_built_before_alembic(tmp_path, monkeypatch):
    """A pre-alembic database must be stamped, not rebuilt.

    Regression: init_db switched from create_all to `alembic upgrade head`, and
    against a database whose tables already existed the upgrade tried to CREATE
    TABLE over live tables. Startup then hung while uvicorn kept the port bound,
    so the service looked alive and answered nothing — which is how the voice
    interview lost its Gemini token endpoint.
    """
    import asyncio
    import importlib
    url = f"sqlite+aiosqlite:///{tmp_path/'legacy.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    import app.config, app.db
    importlib.reload(app.config); db = importlib.reload(app.db)

    # build the schema the old way, with no alembic_version
    async def build_legacy():
        async with db._engine.begin() as conn:
            await conn.run_sync(db.Base.metadata.create_all)
    asyncio.run(build_legacy())

    import sqlite3
    before = {r[0] for r in sqlite3.connect(tmp_path / "legacy.db")
              .execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert "alembic_version" not in before

    asyncio.run(db.init_db())          # must not raise, must not hang

    after = {r[0] for r in sqlite3.connect(tmp_path / "legacy.db")
             .execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert "alembic_version" in after, "existing database was not adopted"
    assert "profiles" in after


def test_no_sync_only_database_driver_is_required():
    """Migrations must run on the app's own async engine.

    env.py once rewrote the async URL to psycopg2 — a driver nothing else used.
    When it was missing, startup failed while the port stayed bound.
    """
    env = (REPO / "backend" / "migrations" / "env.py").read_text(encoding="utf-8")
    # the driver may be named in a comment explaining why it is gone; what must
    # not exist is a rewrite that selects it
    code = "\n".join(l for l in env.splitlines() if not l.lstrip().startswith("#"))
    assert "+psycopg2" not in code, "env.py still rewrites the URL to a sync driver"
    reqs = (REPO / "backend" / "requirements.txt").read_text(encoding="utf-8")
    assert not any(l.strip().startswith("psycopg2") for l in reqs.splitlines()), \
        "psycopg2 is declared as a dependency again"
