"""The analyst must run once per token, however hard the client polls.

/analysis polls /results/{token}/recommendation every 1.5s while its stage
animation plays. That endpoint used to generate on read, so every poll launched
its own Gemini call: measured six concurrent runs for one visitor, each taking
7.4-10.1s and all racing to write the same row. Scoring now starts the run and
pollers join it.
"""

from __future__ import annotations

import asyncio

import pytest

from app.routers import results as R


@pytest.fixture(autouse=True)
def _clear_pending():
    R._pending.clear()
    yield
    R._pending.clear()


@pytest.mark.asyncio
async def test_concurrent_pollers_share_one_run(monkeypatch):
    runs = {"n": 0}

    async def fake(token: str) -> None:
        runs["n"] += 1
        await asyncio.sleep(0.3)

    monkeypatch.setattr(R, "_generate", fake)

    async def poller(i: int) -> bool:
        await asyncio.sleep(i * 0.08)
        task = R.start_recommendation("tok")
        await asyncio.wait([task], timeout=5)
        return task.done()

    seen = await asyncio.gather(*(poller(i) for i in range(6)))
    assert runs["n"] == 1, f"expected one analyst run, got {runs['n']}"
    assert all(seen), "every poller should observe a finished run"


@pytest.mark.asyncio
async def test_finished_run_is_held_so_late_polls_do_not_restart_it(monkeypatch):
    # A mock result is retried on the next read by design. Without the hold that
    # turns into a fresh Gemini call on every poll while Gemini is unavailable.
    runs = {"n": 0}

    async def fake(token: str) -> None:
        runs["n"] += 1

    monkeypatch.setattr(R, "_generate", fake)

    for _ in range(5):
        await asyncio.wait([R.start_recommendation("tok")], timeout=5)
        await asyncio.sleep(0.05)

    assert runs["n"] == 1, f"a completed run should be reused, got {runs['n']} runs"


@pytest.mark.asyncio
async def test_hold_expires_so_a_later_visit_regenerates(monkeypatch):
    runs = {"n": 0}

    async def fake(token: str) -> None:
        runs["n"] += 1

    monkeypatch.setattr(R, "_generate", fake)
    monkeypatch.setattr(R, "_HOLD_SECONDS", 0.0)

    await asyncio.wait([R.start_recommendation("tok")], timeout=5)
    await asyncio.sleep(0.05)
    await asyncio.wait([R.start_recommendation("tok")], timeout=5)

    assert runs["n"] == 2, "past the hold window a new run should start"
