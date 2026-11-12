"""Seconds from opening the interview to the result, one row per result.

The browser times it and posts once. These pin down that the first figure
stands, and that a tab left open overnight is refused rather than averaged in.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))
from test_golden_ranking import DEFAULT_SLIDERS, GOLDEN_PROFILES  # noqa: E402


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    import os

    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{tmp_path_factory.mktemp('timing')}/timing.db"
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as c:
        yield c


# /score is rate limited for the whole test session, so one scored result is shared.
@pytest.fixture(scope="module")
def token(client) -> str:
    profile = GOLDEN_PROFILES["kv_home_charging"]
    token = client.post("/profile", json=profile).json()["token"]
    r = client.post("/score", json={"token": token, "profile": profile, "weights": DEFAULT_SLIDERS})
    assert r.status_code == 200, r.text
    return token


def test_the_first_time_is_stored_and_a_later_one_does_not_replace_it(client, token):
    r = client.post(f"/results/{token}/timing", json={"seconds": 134.26, "via": "form"})
    assert r.status_code == 200, r.text
    assert r.json() == {"token": token, "seconds": 134.3, "via": "form"}
    again = client.post(f"/results/{token}/timing", json={"seconds": 9, "via": "voice"})
    assert again.json() == {"token": token, "seconds": 134.3, "via": "form"}


def test_an_abandoned_tab_and_an_unknown_token_are_refused(client, token):
    post = lambda t, **body: client.post(f"/results/{t}/timing", json=body).status_code
    assert post(token, seconds=7201, via="form") == 422
    assert post(token, seconds=0, via="form") == 422
    assert post(token, seconds=60, via="phone") == 422
    assert post("nope000000", seconds=60, via="form") == 404
