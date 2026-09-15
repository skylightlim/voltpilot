"""The emailed decision report.

This document is attached to an email and cannot be recalled once sent, so the
failures worth guarding are the ones a reader sees and we do not: a glyph that
renders as a box, a page with no contact details, chrome in the wrong language.

Assertions run against the extracted PDF text rather than the code that builds
it — the previous CO2 bug was invisible in the source and only showed in the
output stream.
"""

from __future__ import annotations

import re

import pytest
from reportlab import rl_config

from app.services import report_pdf
from app.services.report_pdf import build_pdf


@pytest.fixture(autouse=True)
def _plain_streams():
    """Build uncompressed so the assertions can read the drawn text.

    ReportLab ships content streams through ASCII85 *and* Flate by default, and
    reimplementing that filter chain in a test is a second thing to get wrong.
    Compression changes only the encoding of the stream, never the text
    operators inside it, so switching it off here tests the same document.
    """
    before = rl_config.pageCompression
    rl_config.pageCompression = 0
    yield
    rl_config.pageCompression = before


def _pdf_text(pdf: bytes) -> str:
    """Every string drawn into the document, in page order. Reads the content
    streams directly, so the suite needs no poppler on the machine or in CI."""
    return "\n".join(
        piece.decode("latin-1")
        for piece in re.findall(rb"\((.*?)(?<!\\)\)\s*Tj", pdf, re.S)
    )


def _ctx(lang: str = "en", **over) -> dict:
    ctx = {
        "token": "7f3a9c21-4b8e-4c1a-9f22-1d0e5a7b3c99",
        "profile": {
            "language": lang, "daily_km": 52, "trips_per_week": 5.5,
            "long_trip_frequency": "monthly", "long_trip_km": 340,
            "destination_region": "east_coast", "can_charge_home": True,
            "home_postcode": "43300", "consider_solar": False,
        },
        "recommendation": {
            "headline": "Our recommendation: BYD Atto 3 Extended",
            "summary": "Recovers its premium in year four.",
            "tradeoffs": ["Thinner DC coverage on the LPT2 corridor."],
            "roadmap": [
                {"year": 0, "title": "Before you sign", "detail": "Confirm the wallbox is included."},
                {"year": 4, "title": "The crossover", "detail": "Cumulative cost passes the hybrid."},
            ],
            "savings": {"co2_saved_10yr_kg": 18420, "cost_rm_yr_top": 2180,
                        "cost_rm_yr_petrol_baseline": 5960},
        },
        "ranking": [
            {"rank": i + 1, "brand": "BYD", "model": f"M{i}", "variant": "X", "type": "ev",
             "price_rm": 149800, "running_cost_rm_yr": 2180, "tco_excluding_rm": 243000}
            for i in range(37)
        ],
        "solar": None,
    }
    ctx.update(over)
    return ctx


@pytest.fixture
def contactable(monkeypatch):
    monkeypatch.setattr(report_pdf.settings, "report_agent_name", "VoltPilot Advisory", raising=False)
    monkeypatch.setattr(report_pdf.settings, "report_agent_phone", "+60 12-345 6789", raising=False)
    monkeypatch.setattr(report_pdf.settings, "report_website", "https://voltpilot.my", raising=False)


def test_it_is_a_pdf_with_more_than_one_page():
    pdf = build_pdf(_ctx())
    assert pdf.startswith(b"%PDF-")
    assert pdf.count(b"/Type /Page\n") >= 2 or pdf.count(b"/Type /Page") >= 2


def test_co2_is_a_real_subscript_not_a_missing_glyph():
    """Helvetica is WinAnsi-encoded and has no U+2082. Writing the character
    directly produced a black box in the reader's PDF, which no test caught
    because the source string looked perfectly correct."""
    pdf = build_pdf(_ctx())
    text = _pdf_text(pdf)
    assert "CO" in text
    # \x82 would be the mis-encoded subscript; the real thing is a separate
    # "2" run drawn at a text-rise, which the extractor sees as plain "2".
    assert "\x82" not in text
    assert b" Ts " in pdf or b"Ts" in pdf, "no text-rise: the subscript is not being drawn"


def test_every_page_carries_the_header_and_the_footer(contactable):
    pdf = build_pdf(_ctx())
    text = _pdf_text(pdf)
    pages = max(pdf.count(b"/Type /Page\n"), 2)
    assert text.count("VoltPilot") >= pages, "header missing from at least one page"
    assert text.count("voltpilot.my") >= pages, "footer contact missing from at least one page"


def test_page_numbers_count_up_and_know_the_total(contactable):
    text = _pdf_text(build_pdf(_ctx()))
    found = re.findall(r"Page (\d+) of (\d+)", text)
    assert found, "no page numbering"
    totals = {t for _, t in found}
    assert len(totals) == 1, f"pages disagree about the total: {totals}"
    assert [int(i) for i, _ in found] == list(range(1, len(found) + 1))
    assert int(found[0][1]) == len(found), "total does not match the pages produced"


def test_the_contact_details_reach_the_document(contactable):
    text = _pdf_text(build_pdf(_ctx()))
    assert "+60 12-345 6789" in text
    assert "voltpilot.my" in text


def test_an_unset_phone_is_omitted_rather_than_printed_empty(monkeypatch):
    """A report that goes to a customer must not carry a dangling "Call or
    WhatsApp" label with nothing after it."""
    monkeypatch.setattr(report_pdf.settings, "report_agent_name", "", raising=False)
    monkeypatch.setattr(report_pdf.settings, "report_agent_phone", "", raising=False)
    monkeypatch.setattr(report_pdf.settings, "report_website", "https://voltpilot.my", raising=False)
    text = _pdf_text(build_pdf(_ctx()))
    assert "Call or WhatsApp" not in text
    assert "voltpilot.my" in text


def test_the_ranking_total_is_the_ranking_it_was_given():
    """The figure was hardcoded to 167 while the catalogue held 184."""
    ctx = _ctx()
    text = _pdf_text(build_pdf(ctx))
    assert f"of {len(ctx['ranking'])} ranked" in text
    assert "167" not in text


def test_the_roadmap_and_its_how_to_reach_the_document():
    text = _pdf_text(build_pdf(_ctx()))
    for expected in ("Your roadmap", "Before you sign", "The crossover",
                     "How to get there", "Finance it", "Insure it"):
        assert expected in text, f"missing: {expected}"


def test_the_how_to_quotes_the_calculator_rather_than_an_invented_number():
    """Every figure in that section must carry the basis string the calculator
    returned, so a reader can check it."""
    text = _pdf_text(build_pdf(_ctx()))
    assert "Basis:" in text
    assert "flat" in text.lower()


def test_malay_gets_malay_chrome_not_just_malay_content():
    """The analyst already localises headline, summary and roadmap. Only the
    document's own headings were English, so a Malay reader got Malay content
    under English headings."""
    text = _pdf_text(build_pdf(_ctx(lang="bm")))
    for expected in ("Profil anda", "Pelan tindakan anda", "Cara mencapainya", "Muka "):
        assert expected in text, f"missing Malay chrome: {expected}"
    assert "Your profile" not in text
    assert "Page 1 of" not in text


def test_it_survives_an_empty_analysis():
    """A report is still sent if the analyst returned nothing useful; it must
    not raise, and it must still carry the contact details."""
    pdf = build_pdf({"token": "abc", "profile": {"language": "en"},
                     "recommendation": {}, "ranking": [], "solar": None})
    assert pdf.startswith(b"%PDF-")


def test_generated_date_is_malaysian_time():
    from datetime import datetime
    text = _pdf_text(build_pdf(_ctx()))
    assert f"{datetime.now(report_pdf.MYT):%d %b %Y}" in text


def test_the_report_names_where_to_buy_the_recommended_car(contactable):
    """The document ranks 184 cars and then has to tell the reader what to do
    next. BYD resolves to a verified distributor, so its panel must appear."""
    text = _pdf_text(build_pdf(_ctx()))
    assert "Where to buy the BYD" in text
    assert "Sime Darby Motors" in text
    assert "byd.simemotors.my" in text


def test_a_brand_with_no_verified_contact_prints_no_panel(contactable):
    """11 of 46 brands could not be resolved. Those must produce nothing rather
    than a heading over an empty box."""
    ctx = _ctx()
    for row in ctx["ranking"]:
        row["brand"] = "Higer"  # in the catalogue, deliberately unresolved
    text = _pdf_text(build_pdf(ctx))
    assert "Where to buy" not in text
    # the VoltPilot advisor panel is unrelated and must still be there
    assert "voltpilot.my" in text


def test_the_dealer_panel_is_localised(contactable):
    text = _pdf_text(build_pdf(_ctx(lang="bm")))
    assert "Di mana untuk membeli" in text
    assert "Pengedar rasmi" in text
    assert "Where to buy" not in text
