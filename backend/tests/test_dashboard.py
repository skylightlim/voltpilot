"""/dashboard/stats: closed without the passphrase, aggregates only with it."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))
from test_golden_ranking import DEFAULT_SLIDERS, GOLDEN_PROFILES  # noqa: E402

PASS = "correct horse battery"


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    import os

    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{tmp_path_factory.mktemp('dash')}/dash.db"
    from fastapi.testclient import TestClient

    from app.config import settings
    from app.main import app

    settings.dashboard_passphrase = PASS
    settings.posthog_share_url = "https://us.posthog.com/shared/abc"
    with TestClient(app) as c:
        yield c
    settings.dashboard_passphrase = ""


def test_no_key_or_wrong_key_is_refused(client):
    assert client.get("/dashboard/stats").status_code == 401
    assert client.get("/dashboard/stats", headers={"X-Dashboard-Key": "nope"}).status_code == 401


def test_unset_passphrase_disables_the_endpoint(client):
    from app.config import settings

    settings.dashboard_passphrase = ""
    try:
        assert client.get("/dashboard/stats", headers={"X-Dashboard-Key": PASS}).status_code == 404
    finally:
        settings.dashboard_passphrase = PASS


def test_empty_database_gives_zeros_not_errors(client):
    r = client.get("/dashboard/stats", headers={"X-Dashboard-Key": PASS})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["results_total"] == 0
    assert body["timing"]["n"] == 0 and body["timing"]["median"] is None
    assert len(body["daily"]) == 14
    assert body["posthog_share_url"] == "https://us.posthog.com/shared/abc"


def test_timings_are_summarised(client):
    profile = GOLDEN_PROFILES["kv_home_charging"]
    token = client.post("/profile", json=profile).json()["token"]
    assert client.post("/score", json={"token": token, "profile": profile, "weights": DEFAULT_SLIDERS}).status_code == 200
    assert client.post(f"/results/{token}/timing", json={"seconds": 95.0, "via": "form"}).status_code == 200
    body = client.get("/dashboard/stats", headers={"X-Dashboard-Key": PASS}).json()
    assert body["results_total"] == 1
    assert body["timing"]["n"] == 1 and body["timing"]["median"] == 95.0
    assert body["timing"]["by_via"]["form"]["n"] == 1
    assert {"label": "1-2 min", "count": 1} in body["timing"]["histogram"]
    assert sum(d["results"] for d in body["daily"]) == 1
    assert token not in str(body)
