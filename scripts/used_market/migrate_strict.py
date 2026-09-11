"""One-off migration: repair carlist prices and rebuild the tables as STRICT.

See issue.md issue 3. The listings table declared `price_rm REAL` but was not
STRICT, so SQLite's dynamic typing stored carlist's formatted strings verbatim.
Every later aggregate read "79,800" as 79. This repairs the stored values with
the same `parse_price` the importer now uses, then recreates each table as
STRICT so the class of bug cannot recur.

Idempotent: re-running on an already-migrated database reports and exits.
"""
from pathlib import Path
import re
import sqlite3
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import db  # noqa: E402

TABLES = ("source_runs", "listings", "valuations")


def _schema_for(table: str) -> str:
    block = re.search(rf"(CREATE TABLE IF NOT EXISTS {table} \(.*?\n\) STRICT;)", db.SCHEMA, re.S)
    if not block:
        raise SystemExit(f"no STRICT schema found for {table}")
    return block.group(1).replace(f"IF NOT EXISTS {table}", f"IF NOT EXISTS {table}_new")


def main(path: str | None = None) -> None:
    """Migrate the database at `path`, defaulting to db.DB_PATH.

    The path is an argument because two copies of this database exist: the
    scrapers write backend/data/used_market.db, while app.config.DATA_DIR reads
    the project-root data/used_market.db. Both need the repair.
    """
    con = sqlite3.connect(path or db.DB_PATH)
    con.execute("PRAGMA foreign_keys=off")

    already = [t for t in TABLES if "STRICT" in (con.execute(
        "SELECT sql FROM sqlite_master WHERE name=?", (t,)).fetchone() or [""])[0]]
    if len(already) == len(TABLES):
        print("already migrated; nothing to do")
        return

    repaired = 0
    for _id, raw in con.execute(
            "SELECT id, price_rm FROM listings WHERE typeof(price_rm)='text'").fetchall():
        con.execute("UPDATE listings SET price_rm=? WHERE id=?", (db.parse_price(raw), _id))
        repaired += 1

    before = {t: con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in TABLES}
    for table in TABLES:
        cols = [r[1] for r in con.execute(f"PRAGMA table_info({table})")]
        columns = ", ".join(f'"{c}"' for c in cols)
        con.executescript(_schema_for(table))
        con.execute(f"INSERT INTO {table}_new ({columns}) SELECT {columns} FROM {table}")
        con.execute(f"DROP TABLE {table}")
        con.execute(f"ALTER TABLE {table}_new RENAME TO {table}")

    for stmt in re.findall(r"CREATE INDEX[^;]+;", db.SCHEMA):
        con.execute(stmt)
    con.commit()

    after = {t: con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in TABLES}
    if before != after:
        con.rollback()
        raise SystemExit(f"row count changed, rolled back: {before} -> {after}")

    con.execute("VACUUM")
    con.close()
    print(f"repaired {repaired} text prices; rebuilt {', '.join(TABLES)} as STRICT")
    print(f"row counts unchanged: {after}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
