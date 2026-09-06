"""Operational endpoints for the scheduled daily refresh.

The Cloudflare Worker's scheduled() handler calls POST /admin/refresh once a
day. The work is CPU- and network-bound and runs in a thread so it never blocks
the event loop, and it is guarded by a shared secret because it triggers
outbound fetches and rewrites files under data/.
"""

from __future__ import annotations

import importlib.util
import secrets
import sys
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Header, HTTPException
from starlette.concurrency import run_in_threadpool

from ..config import DATA_DIR, settings

router = APIRouter(prefix="/admin", tags=["admin"])

REPO_DIR = Path(__file__).resolve().parents[3]
DAILY_UPDATE = REPO_DIR / "scripts" / "daily_update.py"


def _load_daily_update():
    """Import scripts/daily_update.py by path.

    It lives outside the app package because it is also a standalone CLI, and
    the image copies scripts/ alongside app/.
    """
    if not DAILY_UPDATE.exists():
        raise HTTPException(
            status_code=503,
            detail=(
                f"daily_update.py not found at {DAILY_UPDATE}. The image must copy "
                "scripts/ and scraper/ — see the Dockerfile."
            ),
        )
    spec = importlib.util.spec_from_file_location("daily_update", DAILY_UPDATE)
    if spec is None or spec.loader is None:
        raise HTTPException(status_code=503, detail="cannot load daily_update.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules.setdefault("daily_update", mod)
    spec.loader.exec_module(mod)
    return mod


def _authorise(authorization: str | None) -> None:
    expected = settings.admin_token
    if not expected:
        raise HTTPException(
            status_code=503,
            detail="ADMIN_TOKEN is not configured; refresh endpoint is disabled",
        )
    supplied = ""
    if authorization and authorization.lower().startswith("bearer "):
        supplied = authorization[7:]
    # constant-time compare so the token cannot be probed byte by byte
    if not supplied or not secrets.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="invalid or missing bearer token")


@router.post("/refresh")
async def refresh(
    only: str | None = None,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    """Run the daily data refresh. Returns the per-source report.

    200 with status "ok" when at least one source refreshed; 200 with status
    "failed" only when every source failed, so a single dead upstream does not
    look like an outage of the whole job.
    """
    _authorise(authorization)
    mod = _load_daily_update()
    return await run_in_threadpool(mod.run, only)


@router.get("/data-status")
async def data_status() -> dict[str, Any]:
    """Freshness of the seed files, for uptime checks. No secret required."""
    import json
    from datetime import datetime, timezone

    out: dict[str, Any] = {"data_dir": str(DATA_DIR), "files": {}}
    for name in ("fuel.json", "catalog_vehicles.json", "ev-stations.csv",
                 "datagovmy_vehicle_stats.json"):
        p = DATA_DIR / name
        if not p.exists():
            out["files"][name] = {"present": False}
            continue
        st = p.stat()
        age_h = (datetime.now(timezone.utc).timestamp() - st.st_mtime) / 3600
        entry = {
            "present": True,
            "bytes": st.st_size,
            "age_hours": round(age_h, 1),
            "stale": age_h > 48,   # daily job missed at least two runs
        }
        if name == "fuel.json":
            try:
                entry["price_week"] = json.loads(p.read_text())["_meta"]["price_date"]
            except Exception:
                pass
        out["files"][name] = entry
    out["any_stale"] = any(f.get("stale") for f in out["files"].values())
    return out
