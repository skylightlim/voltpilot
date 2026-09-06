"""Per-client rate limiting.

`/score` runs the full decision engine over the catalog and `/chat` calls
Gemini. Both are unauthenticated and both cost money per request, so a public
deployment needs a ceiling on them.

Implemented here rather than as a Cloudflare rule so the limit ships with the
code, is testable, and survives a move off Cloudflare. Counters are in-process,
which is accurate for this deployment: the Worker addresses a single Durable
Object (`idFromName("backend")`), so all traffic reaches one container. If that
ever fans out to several instances the effective ceiling multiplies by the
instance count — still bounded, just looser.
"""

from __future__ import annotations

import os
import time
from collections import defaultdict, deque

from fastapi import Request
from fastapi.responses import JSONResponse

WINDOW_SECONDS = 60.0

# Requests per minute per client. Expensive endpoints are held much tighter than
# reads: a person completing the funnel scores a handful of times, so 10/min is
# generous for real use and still bounds a script.
DEFAULT_LIMIT = int(os.getenv("RATE_LIMIT_DEFAULT", "120"))
LIMITS: dict[str, int] = {
    "/score": int(os.getenv("RATE_LIMIT_SCORE", "10")),
    "/chat": int(os.getenv("RATE_LIMIT_CHAT", "20")),
    "/report": int(os.getenv("RATE_LIMIT_REPORT", "5")),
    "/tokens/live": int(os.getenv("RATE_LIMIT_TOKENS", "10")),
}

# Never throttled: monitors poll these, and rate-limiting a health check turns a
# healthy service into a red dashboard.
EXEMPT_PREFIXES = ("/health", "/docs", "/openapi.json", "/redoc")

_hits: dict[tuple[str, str], deque[float]] = defaultdict(deque)


def client_key(request: Request) -> str:
    """Best available client identity.

    Behind Cloudflare the socket peer is Cloudflare, so CF-Connecting-IP is the
    only honest source. X-Forwarded-For is accepted as a fallback for other
    proxies; both are spoofable by a direct caller, which is acceptable for a
    cost ceiling rather than an auth boundary.
    """
    cf = request.headers.get("cf-connecting-ip")
    if cf:
        return cf
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def limit_for(path: str) -> int:
    for prefix, limit in LIMITS.items():
        if path.startswith(prefix):
            return limit
    return DEFAULT_LIMIT


def _bucket(path: str) -> str:
    for prefix in LIMITS:
        if path.startswith(prefix):
            return prefix
    return "*"


async def rate_limit_middleware(request: Request, call_next):
    path = request.url.path
    if path.startswith(EXEMPT_PREFIXES):
        return await call_next(request)

    limit = limit_for(path)
    key = (client_key(request), _bucket(path))
    now = time.monotonic()

    hits = _hits[key]
    cutoff = now - WINDOW_SECONDS
    while hits and hits[0] < cutoff:
        hits.popleft()

    if len(hits) >= limit:
        retry_after = max(1, int(WINDOW_SECONDS - (now - hits[0])))
        return JSONResponse(
            status_code=429,
            headers={"Retry-After": str(retry_after)},
            content={
                "detail": "Too many requests. Please wait a moment and try again.",
                "retry_after_seconds": retry_after,
            },
        )

    hits.append(now)

    # Opportunistic sweep: without it a long-running process keeps one empty
    # deque per client address it has ever seen.
    if len(_hits) > 10_000:
        for k in [k for k, v in _hits.items() if not v or v[-1] < cutoff]:
            _hits.pop(k, None)

    response = await call_next(request)
    response.headers["X-RateLimit-Limit"] = str(limit)
    response.headers["X-RateLimit-Remaining"] = str(max(0, limit - len(hits)))
    return response


def reset() -> None:
    """Clear all counters. For tests."""
    _hits.clear()
