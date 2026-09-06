#!/usr/bin/env python3
"""Shared HTTP client for the scrapers.

Every scraper here used bare ``urllib.request.urlopen``, which opens a fresh TCP
connection and repeats the full TLS handshake for each request. On a paginated
scrape that is one handshake per page — the dominant cost once a run reaches a
few hundred pages, and pure waste against a single host.

It also meant no retry: a single transient 502 or a dropped connection ended a
long run and threw away everything not yet written.

This module provides one pooled, retrying session shared across a process.
Politeness is unchanged — the per-request ``time.sleep`` calls in each scraper
still govern request rate; this only removes the handshake and adds resilience.
"""

from __future__ import annotations

import json as _json
from typing import Any

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

DEFAULT_UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)

_session: requests.Session | None = None


def session() -> requests.Session:
    """Process-wide pooled session with backoff on transient failures.

    Retries only idempotent-safe conditions: connection errors and the
    server-side 429/5xx family. A 4xx that is not 429 is a real answer and is
    returned to the caller rather than retried.
    """
    global _session
    if _session is None:
        s = requests.Session()
        retry = Retry(
            total=4,
            connect=3,
            read=3,
            backoff_factor=1.5,          # 0s, 1.5s, 3s, 6s
            status_forcelist=(429, 500, 502, 503, 504),
            allowed_methods=frozenset({"GET", "POST"}),
            raise_on_status=False,
        )
        adapter = HTTPAdapter(
            max_retries=retry,
            pool_connections=8,
            pool_maxsize=16,
        )
        s.mount("https://", adapter)
        s.mount("http://", adapter)
        s.headers.update({"User-Agent": DEFAULT_UA})
        _session = s
    return _session


def get_text(url: str, headers: dict | None = None, timeout: int = 30) -> str:
    r = session().get(url, headers=headers, timeout=timeout)
    r.raise_for_status()
    return r.text


def get_json(url: str, headers: dict | None = None, timeout: int = 30) -> Any:
    r = session().get(url, headers=headers, timeout=timeout)
    r.raise_for_status()
    return r.json()


def post_json(
    url: str, body: Any, headers: dict | None = None, timeout: int = 30
) -> Any:
    """POST a JSON body and decode a JSON reply.

    Accepts an already-encoded body (bytes/str) so call sites that built their
    own payload can switch over without re-shaping it.
    """
    h = dict(headers or {})
    if isinstance(body, (bytes, str)):
        data = body
        h.setdefault("Content-Type", "application/json")
        r = session().post(url, data=data, headers=h, timeout=timeout)
    else:
        r = session().post(url, json=body, headers=h, timeout=timeout)
    r.raise_for_status()
    text = r.text
    try:
        return r.json()
    except ValueError:
        return _json.loads(text) if text else None
