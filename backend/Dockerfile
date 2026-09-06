FROM python:3.12-slim

WORKDIR /app

# System deps for reportlab, numpy, etc.
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ libffi-dev && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ app/
COPY data/ data/

ENV DATA_DIR=/app/data
ENV DATABASE_URL=sqlite+aiosqlite:///./dev.db

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD python -c "from urllib.request import urlopen; urlopen('http://localhost:8080/health', timeout=5)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
