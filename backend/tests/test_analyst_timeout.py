"""A Gemini call that never answers must end in the offline analyst.

On 2026-11-11 Google shed free-tier gemini-3.7-flash: calls neither failed nor
returned, they stayed open. Every fallback here waits for an exception, so /chat
ran into Vercel's 60s limit as a 504 and the recommendation stayed "not ready".
The fake client below hangs the same way.
"""

from __future__ import annotations

import asyncio
import time
from types import SimpleNamespace

import pytest

from app.services import analyst as A


class _HungModels:
    def __init__(self) -> None:
        self.calls = 0

    async def generate_content(self, **_: object) -> None:
        self.calls += 1
        await asyncio.sleep(30)


@pytest.fixture
def hung(monkeypatch):
    models = _HungModels()
    monkeypatch.setattr(A.settings, "gemini_api_keys", ["k1", "k2", "k3"])
    monkeypatch.setattr(A, "_client_for", lambda key: SimpleNamespace(aio=SimpleNamespace(models=models)))
    monkeypatch.setattr(A, "_CALL_TIMEOUT_S", 0.1)
    monkeypatch.setattr(A, "_key_cooldown", {})
    return models


RESULT = {"ranking": [{"brand": "Proton", "model": "e.MAS 7"}], "profile": {}}


@pytest.mark.asyncio
async def test_recommendation_falls_back_to_mock(hung, monkeypatch):
    monkeypatch.setattr(A, "mock_analyst", lambda bundle, lang: {"mock": True})
    bundle = {"profile": {}, "weights": {}, "ranking": [], "solar": False}

    start = time.monotonic()
    assert await A.build_recommendation(bundle, "en") == {"mock": True}
    assert time.monotonic() - start < 2
    # Neither retried nor rotated: the other keys would hang on the same model.
    assert hung.calls == 1
    assert A._key_cooldown == {}, "a timeout must not retire the key"


@pytest.mark.asyncio
async def test_chat_falls_back_to_mock(hung):
    start = time.monotonic()
    reply = await A.chat_reply(RESULT, "hello", "en")
    assert reply == A._mock_chat(RESULT, "hello", "en")
    assert time.monotonic() - start < 2
    assert hung.calls == 1


@pytest.mark.asyncio
async def test_interview_extraction_falls_back_to_mock(hung):
    transcript = "I drive 40 km a day and can charge at home in Petaling Jaya."
    assert await A.extract_interview_profile(transcript, "en") == A._mock_extract(transcript, "en")
    assert hung.calls == 1
