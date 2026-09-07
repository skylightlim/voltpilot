#!/usr/bin/env python3
"""Push the seed data files into the live database.

`seed_if_empty` only fires when catalog_vehicles is empty, which is right for a
first boot and useless afterwards: once the table has rows, a refreshed
data/catalog never reaches the database again. The daily refresh rewrites those
files, so something has to carry the change across. This does.

Idempotent by design — it upserts on (slug, variant) and only writes a price
history row when the price actually moved, so running it twice in a row is a
no-op and the history stays a record of changes rather than of cron firings.

Usage:
    DATABASE_URL=postgresql+asyncpg://... python3 scripts/sync_db.py
    python3 scripts/sync_db.py --dry-run
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from sqlalchemy import select  # noqa: E402

from app.config import load_catalog, load_fuel, load_policy, load_tariff  # noqa: E402
from app.db import (  # noqa: E402
    AsyncSessionLocal,
    CatalogPriceHistory,
    CatalogVehicle,
    ExternalFactor,
)


async def sync(dry_run: bool = False) -> dict:
    report = {"added": 0, "updated": 0, "unchanged": 0, "price_changes": 0, "factors": 0}

    async with AsyncSessionLocal() as db:
        existing = {
            (v.slug, v.variant): v
            for v in (await db.scalars(select(CatalogVehicle))).all()
        }

        for raw in load_catalog():
            key = (raw["id"], raw.get("variant", ""))
            fields = {
                "brand": raw["brand"],
                "model": raw["model"],
                "type": raw["type"],
                "price_rm": raw["price_rm"],
                "source": raw.get("source", "official"),
                "as_of_date": raw.get("as_of_date", ""),
                "ckd": raw.get("ckd", False),
                "specs": raw.get("specs", {}),
                "ownership": raw.get("ownership", {}),
            }
            row = existing.get(key)

            if row is None:
                report["added"] += 1
                if not dry_run:
                    db.add(CatalogVehicle(slug=key[0], variant=key[1], **fields))
                    db.add(
                        CatalogPriceHistory(
                            slug=key[0],
                            price_rm=fields["price_rm"],
                            source=fields["source"],
                            as_of_date=fields["as_of_date"],
                        )
                    )
                continue

            changed = [f for f, v in fields.items() if getattr(row, f) != v]
            if not changed:
                report["unchanged"] += 1
                continue

            report["updated"] += 1
            price_moved = "price_rm" in changed
            if price_moved:
                report["price_changes"] += 1
            if not dry_run:
                for f, v in fields.items():
                    setattr(row, f, v)
                # History records movements, not cron firings.
                if price_moved:
                    db.add(
                        CatalogPriceHistory(
                            slug=key[0],
                            price_rm=fields["price_rm"],
                            source=fields["source"],
                            as_of_date=fields["as_of_date"],
                        )
                    )

        for key, obj in [("fuel", load_fuel()), ("tariff", load_tariff()), ("policy", load_policy())]:
            as_of = obj.get("_meta", {}).get("updated_at", "")
            row = await db.scalar(select(ExternalFactor).where(ExternalFactor.key == key))
            if row is None:
                report["factors"] += 1
                if not dry_run:
                    db.add(ExternalFactor(key=key, value_json=obj, as_of_date=as_of))
            elif row.value_json != obj or row.as_of_date != as_of:
                report["factors"] += 1
                if not dry_run:
                    row.value_json = obj
                    row.as_of_date = as_of

        if dry_run:
            await db.rollback()
        else:
            await db.commit()

    return report


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true", help="report changes without writing")
    args = ap.parse_args()

    report = asyncio.run(sync(dry_run=args.dry_run))
    label = "would change" if args.dry_run else "changed"
    print(
        f"catalog {label}: +{report['added']} added, {report['updated']} updated, "
        f"{report['unchanged']} unchanged, {report['price_changes']} price moves; "
        f"{report['factors']} external factor(s)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
