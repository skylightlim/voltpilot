# Backend container image.
#
# Build context is the REPOSITORY ROOT, not backend/. The previous Dockerfile
# lived in backend/ and did `COPY data/ data/`, but backend/data/ does not
# exist — data/, scripts/ and scraper/ are all at the root, so that COPY could
# never resolve and the image was unbuildable as configured. wrangler.toml
# points at this file with image_build_context = "..".
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ libffi-dev && \
    rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app/ app/
COPY data/ data/
# Needed by POST /admin/refresh, which the Cloudflare cron trigger calls:
# scripts/daily_update.py loads scripts/update_*.py and scraper/ev_stations.py.
COPY scripts/ scripts/
COPY scraper/ scraper/

ENV DATA_DIR=/app/data
ENV PYTHONUNBUFFERED=1

# No DATABASE_URL default: the container filesystem is ephemeral, so the old
# sqlite:///./dev.db lost every profile and result on restart. Supply a managed
# Postgres URL as a secret; app/db.py already sets pool_pre_ping/pool_recycle.

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD python -c "from urllib.request import urlopen; urlopen('http://localhost:8080/health', timeout=5)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
