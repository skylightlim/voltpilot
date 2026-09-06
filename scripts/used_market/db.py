import json
import os
import sqlite3
from datetime import datetime, timezone

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "data", "used_market.db")
DB_PATH = os.path.abspath(DB_PATH)

SCHEMA = """
CREATE TABLE IF NOT EXISTS source_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    status TEXT NOT NULL DEFAULT 'running',
    items_fetched INTEGER DEFAULT 0,
    items_matched INTEGER DEFAULT 0,
    error TEXT
);

CREATE TABLE IF NOT EXISTS listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    source_id TEXT,
    vehicle_id TEXT,
    title TEXT NOT NULL,
    price_rm REAL,
    year INTEGER,
    mileage_km INTEGER,
    variant TEXT,
    fuel_type TEXT,
    transmission TEXT,
    location TEXT,
    url TEXT,
    fetched_at TEXT NOT NULL,
    run_id INTEGER,
    raw TEXT,
    UNIQUE(source, source_id)
);

CREATE TABLE IF NOT EXISTS valuations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL DEFAULT 'carbase',
    source_id TEXT,
    vehicle_id TEXT,
    variant_label TEXT,
    year INTEGER,
    cc TEXT,
    transmission TEXT,
    wm_new_pr REAL,
    wm_rrr REAL,
    em_new_pr REAL,
    em_rrr REAL,
    sum_insured REAL,
    valuation_date TEXT,
    fetched_at TEXT NOT NULL,
    run_id INTEGER,
    raw TEXT,
    UNIQUE(source, source_id)
);

CREATE INDEX IF NOT EXISTS idx_listings_vehicle ON listings(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_listings_source ON listings(source);
CREATE INDEX IF NOT EXISTS idx_valuations_vehicle ON valuations(vehicle_id);
"""


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    conn = connect()
    conn.executescript(SCHEMA)
    conn.commit()
    conn.close()


def start_run(source):
    conn = connect()
    cur = conn.execute(
        "INSERT INTO source_runs (source, started_at) VALUES (?, ?)",
        (source, now_iso()),
    )
    conn.commit()
    run_id = cur.lastrowid
    conn.close()
    return run_id


def finish_run(run_id, items_fetched, items_matched, error=None):
    conn = connect()
    conn.execute(
        "UPDATE source_runs SET finished_at=?, status=?, items_fetched=?, items_matched=?, error=? WHERE id=?",
        (now_iso(), "failed" if error else "ok", items_fetched, items_matched, error, run_id),
    )
    conn.commit()
    conn.close()


def upsert_listing(row: dict) -> bool:
    """Insert or update a listing. Returns True if new, False if duplicate (already fetched)."""
    conn = connect()
    exists = conn.execute(
        "SELECT 1 FROM listings WHERE source=? AND source_id=?",
        (row["source"], row["source_id"]),
    ).fetchone()
    if exists:
        conn.execute(
            """UPDATE listings SET
               vehicle_id=COALESCE(?, vehicle_id), title=?, price_rm=?, year=?, mileage_km=?,
               variant=COALESCE(?, variant), fuel_type=COALESCE(?, fuel_type),
               transmission=COALESCE(?, transmission), location=COALESCE(?, location),
               url=COALESCE(?, url), fetched_at=?, run_id=?, raw=COALESCE(?, raw)
               WHERE source=? AND source_id=?""",
            (
                row.get("vehicle_id"),
                row["title"],
                row.get("price_rm"),
                row.get("year"),
                row.get("mileage_km"),
                row.get("variant"),
                row.get("fuel_type"),
                row.get("transmission"),
                row.get("location"),
                row.get("url"),
                now_iso(),
                row.get("run_id"),
                json.dumps(row.get("raw"), ensure_ascii=False) if row.get("raw") else None,
                row["source"],
                row["source_id"],
            ),
        )
        conn.commit()
        conn.close()
        return False
    conn.execute(
        """INSERT INTO listings
           (source, source_id, vehicle_id, title, price_rm, year, mileage_km, variant,
            fuel_type, transmission, location, url, fetched_at, run_id, raw)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            row["source"],
            row["source_id"],
            row.get("vehicle_id"),
            row["title"],
            row.get("price_rm"),
            row.get("year"),
            row.get("mileage_km"),
            row.get("variant"),
            row.get("fuel_type"),
            row.get("transmission"),
            row.get("location"),
            row.get("url"),
            now_iso(),
            row.get("run_id"),
            json.dumps(row.get("raw"), ensure_ascii=False) if row.get("raw") else None,
        ),
    )
    conn.commit()
    conn.close()
    return True


def upsert_valuation(row: dict) -> bool:
    conn = connect()
    exists = conn.execute(
        "SELECT 1 FROM valuations WHERE source=? AND source_id=?",
        (row["source"], row["source_id"]),
    ).fetchone()
    if exists:
        conn.execute(
            """UPDATE valuations SET
               vehicle_id=COALESCE(?, vehicle_id), variant_label=COALESCE(?, variant_label),
               year=COALESCE(?, year), cc=COALESCE(?, cc), transmission=COALESCE(?, transmission),
               wm_new_pr=COALESCE(?, wm_new_pr), wm_rrr=COALESCE(?, wm_rrr),
               em_new_pr=COALESCE(?, em_new_pr), em_rrr=COALESCE(?, em_rrr),
               sum_insured=COALESCE(?, sum_insured), valuation_date=COALESCE(?, valuation_date),
               fetched_at=?, run_id=?, raw=COALESCE(?, raw)
               WHERE source=? AND source_id=?""",
            (
                row.get("vehicle_id"),
                row.get("variant_label"),
                row.get("year"),
                row.get("cc"),
                row.get("transmission"),
                row.get("wm_new_pr"),
                row.get("wm_rrr"),
                row.get("em_new_pr"),
                row.get("em_rrr"),
                row.get("sum_insured"),
                row.get("valuation_date"),
                now_iso(),
                row.get("run_id"),
                json.dumps(row.get("raw"), ensure_ascii=False) if row.get("raw") else None,
                row["source"],
                row["source_id"],
            ),
        )
        conn.commit()
        conn.close()
        return False
    conn.execute(
        """INSERT INTO valuations
           (source, source_id, vehicle_id, variant_label, year, cc, transmission,
            wm_new_pr, wm_rrr, em_new_pr, em_rrr, sum_insured, valuation_date, fetched_at, run_id, raw)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            row["source"],
            row["source_id"],
            row.get("vehicle_id"),
            row.get("variant_label"),
            row.get("year"),
            row.get("cc"),
            row.get("transmission"),
            row.get("wm_new_pr"),
            row.get("wm_rrr"),
            row.get("em_new_pr"),
            row.get("em_rrr"),
            row.get("sum_insured"),
            row.get("valuation_date"),
            now_iso(),
            row.get("run_id"),
            json.dumps(row.get("raw"), ensure_ascii=False) if row.get("raw") else None,
        ),
    )
    conn.commit()
    conn.close()
    return True


def mark_listing_vehicle(source_id, vehicle_id):
    conn = connect()
    conn.execute(
        "UPDATE listings SET vehicle_id=? WHERE source_id=? AND vehicle_id IS NULL",
        (vehicle_id, source_id),
    )
    conn.commit()
    conn.close()


def summary():
    conn = connect()
    rows = conn.execute(
        """SELECT source, COUNT(*) n, SUM(CASE WHEN vehicle_id IS NOT NULL THEN 1 ELSE 0 END) matched
           FROM listings GROUP BY source ORDER BY source"""
    ).fetchall()
    vals = conn.execute(
        """SELECT source, COUNT(*) n, SUM(CASE WHEN vehicle_id IS NOT NULL THEN 1 ELSE 0 END) matched
           FROM valuations GROUP BY source ORDER BY source"""
    ).fetchall()
    conn.close()
    return {"listings": [dict(r) for r in rows], "valuations": [dict(r) for r in vals]}
