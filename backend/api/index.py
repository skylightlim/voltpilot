"""Vercel Python entrypoint.

Vercel's Python runtime looks for a module-level ASGI/WSGI callable named `app`,
so this re-exports the FastAPI instance and does nothing else. Keeping it that
thin means local `uvicorn app.main:app` and the deployed function run the exact
same application object.

Schema migrations and seeding are deliberately NOT run here — see
app/main.py's lifespan. A serverless function cold-starts many times over,
concurrently, so running `alembic upgrade head` on the request path is both slow
and a migration race. The deploy workflow runs it once instead.
"""

from app.main import app  # noqa: F401
