"""Brand contacts — the data that tells a reader where to buy the car.

This reaches customers two ways that cannot be taken back: a link they click
and an emailed PDF. The rule the whole file exists to enforce is that nothing
here is unsourced — a phone number with no page it was read from is exactly the
shape of a hallucinated one.
"""

from __future__ import annotations

import json
import re

import pytest

from app.config import DATA_DIR, brand_contact, load_brand_contacts, load_catalog


@pytest.fixture(scope="module")
def raw() -> dict:
    return json.loads((DATA_DIR / "brand_contacts.json").read_text(encoding="utf-8"))


def test_every_catalogue_brand_has_an_entry(raw):
    """Not every brand has contacts — 11 of 46 could not be resolved — but every
    brand must have a ROW, so a gap is recorded rather than merely absent."""
    catalogue = {v["brand"] for v in load_catalog()}
    listed = {c["brand"] for c in raw["contacts"]}
    assert catalogue - listed == set(), f"brands in the catalogue with no row: {sorted(catalogue - listed)}"


def test_no_phone_number_is_unsourced(raw):
    """The one rule that matters. A number without the page it came from cannot
    be checked by anyone later, and this data is emailed to customers."""
    unsourced = [c["brand"] for c in raw["contacts"] if c.get("phone") and not c.get("phone_source")]
    assert unsourced == [], f"phone with no source: {unsourced}"


def test_no_distributor_is_unsourced(raw):
    unsourced = [
        c["brand"] for c in raw["contacts"] if c.get("distributor") and not c.get("distributor_source")
    ]
    assert unsourced == [], f"distributor with no source: {unsourced}"


def test_phone_numbers_look_like_malaysian_numbers(raw):
    """Catches a truncated paste or a stray character, not formatting taste."""
    for c in raw["contacts"]:
        if not c.get("phone"):
            continue
        digits = re.sub(r"\D", "", c["phone"])
        assert 8 <= len(digits) <= 13, f"{c['brand']}: {c['phone']!r} has {len(digits)} digits"


def test_websites_are_absolute_https_urls(raw):
    for c in raw["contacts"]:
        site = c.get("website")
        if site:
            assert site.startswith("https://"), f"{c['brand']}: {site}"


def test_no_domain_parking_or_marketplace_links(raw):
    """A parked domain answers HTTP 200, so "it resolved" is not evidence it is
    the brand's site. Two candidates during collection were a dynadot for-sale
    page and a dn.com listing; both would have shipped a squatter's link into a
    customer's PDF."""
    bad = ("dynadot", "sedo.com", "/sale/", "forsale", "godaddy", "afternic", "hugedomains")
    for c in raw["contacts"]:
        site = (c.get("website") or "").lower()
        assert not any(b in site for b in bad), f"{c['brand']} points at a domain sale page: {site}"


def test_contacts_are_reachable_by_the_catalogue_spelling(raw):
    """The lookup key is a vehicle row's `brand`, so a case mismatch between the
    catalogue and this file silently yields no contact at all."""
    for brand in {v["brand"] for v in load_catalog()}:
        row = load_brand_contacts().get(brand.casefold())
        assert row is not None, f"{brand!r} does not resolve case-insensitively"


def test_a_brand_with_nothing_useful_resolves_to_none():
    """An entry that exists only to record a gap must not render as an empty
    contact card."""
    empties = [c for c in load_brand_contacts().values() if not (c.get("website") or c.get("phone"))]
    assert empties, "expected some unresolved brands; if all are filled, delete this test"
    for c in empties:
        assert brand_contact(c["brand"]) is None


def test_known_good_entries_survive(raw):
    """Two numbers were read off official pages during collection. If either
    changes, it should be a deliberate edit with a fresh source, not a drift."""
    by = {c["brand"]: c for c in raw["contacts"]}
    assert by["Honda"]["phone"] == "1-800-88-2020"
    assert "honda.com.my" in by["Honda"]["phone_source"]
    assert by["Proton"]["phone"] == "1-800-88-8398"
    assert "proton.com" in by["Proton"]["phone_source"]


def test_coverage_is_reported(raw, capsys):
    """Not an assertion about the number — it will move as gaps get filled. It
    prints, so `pytest -s` says exactly which brands still need manual entry."""
    rows = raw["contacts"]
    missing = sorted(c["brand"] for c in rows if not c.get("website"))
    with capsys.disabled():
        print(
            f"\n  brand contacts: {len(rows) - len(missing)}/{len(rows)} with a verified site"
            f"\n  needs manual entry: {', '.join(missing) or 'none'}"
        )
    assert len(rows) - len(missing) > 0
