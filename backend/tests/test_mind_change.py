"""The "did this change your mind?" answer, stored against the earlier leaning.

The leaning is asked on /sliders before any result exists and travels in the
profile; the results page asks again. The count that matters later is rows
whose two answers differ, so these pin down that both land in one row.
"""

from __future__ import annotations

import pytest

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from test_golden_ranking import DEFAULT_SLIDERS, GOLDEN_PROFILES  # noqa: E402


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    import os

    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{tmp_path_factory.mktemp('mind')}/mind.db"
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as c:
        yield c


def _scored(client, **profile_over) -> str:
    profile = {**GOLDEN_PROFILES["kv_home_charging"], **profile_over}
    token = client.post("/profile", json=profile).json()["token"]
    r = client.post("/score", json={"token": token, "profile": profile, "weights": DEFAULT_SLIDERS})
    assert r.status_code == 200, r.text
    return token


def _rows():
    import asyncio

    from sqlalchemy import select

    from app.db import AsyncSessionLocal, MindChange

    async def fetch():
        async with AsyncSessionLocal() as db:
            return (await db.scalars(select(MindChange))).all()

    return asyncio.run(fetch())


# /score is rate limited to 10 a minute for the whole test session, so these
# share two scored results rather than scoring once per test.
@pytest.fixture(scope="module")
def leaned_hybrid(client) -> str:
    return _scored(client, prior_leaning="hybrid")


@pytest.fixture(scope="module")
def skipped(client) -> str:
    return _scored(client)


def test_the_answer_is_stored_beside_the_leaning_given_before(client, leaned_hybrid):
    r = client.post(f"/results/{leaned_hybrid}/mind", json={"leaning": "ev"})
    assert r.status_code == 200, r.text
    assert r.json() == {"token": leaned_hybrid, "before": "hybrid", "after": "ev"}
    row = next(x for x in _rows() if x.result_token == leaned_hybrid)
    assert (row.leaning_before, row.leaning_after) == ("hybrid", "ev")


def test_answering_again_replaces_rather_than_adds(client, leaned_hybrid):
    client.post(f"/results/{leaned_hybrid}/mind", json={"leaning": "unsure"})
    client.post(f"/results/{leaned_hybrid}/mind", json={"leaning": "hybrid"})
    rows = [x for x in _rows() if x.result_token == leaned_hybrid]
    assert len(rows) == 1 and rows[0].leaning_after == "hybrid"


def test_a_skipped_before_question_is_null_not_a_guess(client, skipped):
    assert client.post(f"/results/{skipped}/mind", json={"leaning": "unsure"}).json()["before"] is None


def test_unknown_token_and_unknown_answer_are_refused(client, skipped):
    assert client.post("/results/nope000000/mind", json={"leaning": "ev"}).status_code == 404
    assert client.post(f"/results/{skipped}/mind", json={"leaning": "diesel"}).status_code == 422


def test_the_leaning_does_not_move_the_ranking(client, leaned_hybrid, skipped):
    rank = lambda t: [r["slug"] for r in client.get(f"/results/{t}").json()["ranking"][:10]]
    assert rank(leaned_hybrid) == rank(skipped)
