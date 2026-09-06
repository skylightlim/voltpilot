from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from .db import CatalogVehicle, CatalogPriceHistory, ExternalFactor, BlockedSite
from .config import load_catalog, load_fuel, load_policy, load_tariff, settings


async def run(db: AsyncSession) -> None:
    for raw in load_catalog():
        vehicle = CatalogVehicle(
            slug=raw["id"],
            brand=raw["brand"],
            model=raw["model"],
            variant=raw.get("variant", ""),
            type=raw["type"],
            price_rm=raw["price_rm"],
            source=raw.get("source", "official"),
            as_of_date=raw.get("as_of_date", ""),
            ckd=raw.get("ckd", False),
            specs=raw.get("specs", {}),
            ownership=raw.get("ownership", {}),
        )
        db.add(vehicle)
        db.add(
            CatalogPriceHistory(
                slug=vehicle.slug,
                price_rm=vehicle.price_rm,
                source=vehicle.source,
                as_of_date=vehicle.as_of_date,
            )
        )

    for key, obj in [
        ("fuel", load_fuel()),
        ("tariff", load_tariff()),
        ("policy", load_policy()),
    ]:
        db.add(
            ExternalFactor(
                key=key,
                value_json=obj,
                as_of_date=obj.get("_meta", {}).get("updated_at", ""),
            )
        )

    db.add(BlockedSite(site="(seed none)", error="", fallback="bootstrap catalog hand-curated"))
    await db.commit()