"""The emailed PDF decision report.

Split out of routers/report.py, which had the document, the SMTP client and the
HTTP handler in one file. Only the document lives here.

Layout notes, since ReportLab's model is not obvious:

* `SimpleDocTemplate.build(..., onFirstPage=, onLaterPages=)` draws page
  furniture directly on the canvas, outside the flowable frame. The header goes
  there because it is the same on every page and needs no page count.
* The footer cannot: it carries "Page 3 of 7", and the total is unknown until
  the last page is laid out. `NumberedCanvas` below buffers the pages and stamps
  them on save, which is the standard two-pass answer to this.
* Margins must leave room for both. A frame that runs under its own header is
  the classic ReportLab bug and there is no warning when it happens.

Typography: the base-14 Helvetica only covers WinAnsi, so `CO₂` (U+2082) came
out as a black box in the previous version — verified by extracting the drawn
text from the output. `<sub>2</sub>` is used instead, which ReportLab renders
as a real typographic subscript (smaller size plus a text-rise) in the same
font. That avoids embedding a TTF, which matters because this deploys to a
Vercel Python function where no system fonts exist and the bundle is already
over the standard size limit.
"""

from __future__ import annotations

import io
from datetime import datetime, timedelta, timezone

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.pdfgen import canvas as pdfcanvas
from reportlab.platypus import (
    CondPageBreak,
    HRFlowable,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from ..config import brand_contact, settings
from .calculators import insurance, loan

# Malaysia is UTC+8. The previous version printed `datetime.utcnow()`, so for
# the eight hours between midnight and 08:00 MYT every report was dated the
# previous day — for a Malaysian product, on a document the reader checks the
# date of. (utcnow() is also deprecated from 3.12.)
MYT = timezone(timedelta(hours=8), "MYT")

# Brand, from frontend/DESIGN.md §1.
PINE = colors.HexColor("#1c4a3a")
INK = colors.HexColor("#15221c")
FOG = colors.HexColor("#5c6b62")
LINE = colors.HexColor("#d9d5c5")
BONE = colors.HexColor("#f4f3ec")
AMBER = colors.HexColor("#c97f10")

PAGE_W, PAGE_H = A4
MARGIN = 1.7 * cm
HEADER_H = 1.5 * cm
FOOTER_H = 1.5 * cm


# --------------------------------------------------------------------------
# Strings
#
# The analyst already writes its own output in the reader's language — headline,
# summary, tradeoffs and every roadmap milestone come back localised. Only this
# document's own chrome was English, so a Malay reader received Malay content
# under English headings. The profile carries `language`, so localising the
# chrome needs no API or frontend change; it just has to be read.
# --------------------------------------------------------------------------
S: dict[str, tuple[str, str]] = {
    "doc_title": ("EV vs Hybrid Decision Report", "Laporan Keputusan EV lwn Hibrid"),
    "tagline": ("Independent, data-led vehicle decisions", "Keputusan kenderaan bebas dan berasaskan data"),
    "generated": ("Generated {date}", "Dijana {date}"),
    "reference": ("Reference {token}", "Rujukan {token}"),
    "profile_h": ("Your profile", "Profil anda"),
    "p_daily": ("Daily driving", "Pemanduan harian"),
    "p_days": ("Days per week", "Hari seminggu"),
    "p_annual": ("Annual distance", "Jarak tahunan"),
    "p_long": ("Long trips", "Perjalanan jauh"),
    "p_dest": ("Usual destination", "Destinasi biasa"),
    "p_home": ("Can charge at home", "Boleh mengecas di rumah"),
    "p_post": ("Postcode", "Poskod"),
    "p_solar": ("Considering solar", "Mempertimbangkan solar"),
    "yes": ("Yes", "Ya"),
    "no": ("No", "Tidak"),
    "rec_h": ("Our recommendation", "Cadangan kami"),
    "tradeoff_h": ("What you trade off", "Apa yang anda korbankan"),
    "rank_h": ("Top {n} of {total} ranked", "{n} teratas daripada {total} yang dinilai"),
    "c_rank": ("#", "#"),
    "c_model": ("Model", "Model"),
    "c_type": ("Type", "Jenis"),
    "c_price": ("Price (RM)", "Harga (RM)"),
    "c_run": ("Running / yr (RM)", "Kos tahunan (RM)"),
    "c_tco": ("10-yr TCO (RM)", "TCO 10 tahun (RM)"),
    "road_h": ("Your roadmap", "Pelan tindakan anda"),
    "road_year": ("Year {n}", "Tahun {n}"),
    "road_now": ("Now", "Sekarang"),
    "how_h": ("How to get there", "Cara mencapainya"),
    "how_intro": (
        "Each figure below is produced by the same engine that ranked your shortlist, "
        "using the pick above. Each states the rule it applies.",
        "Setiap angka di bawah dihasilkan oleh enjin yang sama yang menilai senarai anda, "
        "menggunakan pilihan di atas. Setiap satu menyatakan peraturan yang digunakan.",
    ),
    "how_finance": ("Finance it", "Biayai"),
    "how_insure": ("Insure it", "Insurans"),
    "how_charge": ("Set up charging", "Sediakan pengecasan"),
    "how_tariff": ("Move to the EV tariff", "Beralih ke tarif EV"),
    "how_solar": ("Add rooftop solar", "Tambah solar bumbung"),
    "basis": ("Basis: {b}", "Asas: {b}"),
    "save_h": ("Savings and emissions", "Penjimatan dan pelepasan"),
    "contact_h": ("Talk to a person", "Bercakap dengan seseorang"),
    "contact_body": (
        "Bring this report. It has your reference number, so we can pull up the same "
        "figures you are looking at.",
        "Bawa laporan ini. Ia mempunyai nombor rujukan anda, jadi kami boleh melihat "
        "angka yang sama seperti yang anda lihat.",
    ),
    "contact_phone": ("Call or WhatsApp", "Hubungi atau WhatsApp"),
    "dealer_h": ("Where to buy the {brand}", "Di mana untuk membeli {brand}"),
    "dealer_distributor": ("Official distributor", "Pengedar rasmi"),
    "dealer_phone": ("Brand hotline", "Talian brand"),
    "dealer_web": ("Find your nearest showroom", "Cari bilik pameran terdekat"),
    "contact_web": ("Online", "Dalam talian"),
    "page_x_of_y": ("Page {i} of {n}", "Muka {i} drpd {n}"),
    "disclaimer_h": ("What this is and is not", "Apa ini dan apa bukan"),
    "disclaimer": (
        "Prices are on-the-road and move; tariffs, road tax and insurance follow published "
        "JPJ, TNB and PIAM schedules at the date above. This is a comparison of figures, not "
        "financial advice, and it is not a quotation. Nobody pays to appear in this ranking.",
        "Harga adalah atas jalan dan berubah; tarif, cukai jalan dan insurans mengikut jadual "
        "JPJ, TNB dan PIAM yang diterbitkan pada tarikh di atas. Ini ialah perbandingan angka, "
        "bukan nasihat kewangan, dan bukan sebut harga. Tiada sesiapa membayar untuk muncul "
        "dalam kedudukan ini.",
    ),
}


def t(key: str, lang: str, **fmt: object) -> str:
    en, bm = S[key]
    return (bm if lang == "bm" else en).format(**fmt)


def _rm(v: object) -> str:
    """RM figures, grouped, no decimals. Non-numeric input becomes an em dash
    rather than raising — a missing number must not cost the reader the whole
    report."""
    try:
        return f"{float(v):,.0f}"
    except (TypeError, ValueError):
        return "—"


# --------------------------------------------------------------------------
# Page furniture
# --------------------------------------------------------------------------
def _contact_line() -> str:
    """The footer's contact strip. Unset fields drop out entirely rather than
    printing an empty label."""
    bits = [b for b in (settings.report_agent_name, settings.report_agent_phone) if b]
    bits.append(settings.report_website)
    return "  ·  ".join(bits)


def _draw_header(canvas: pdfcanvas.Canvas, doc, lang: str) -> None:
    canvas.saveState()
    y = PAGE_H - MARGIN + 0.35 * cm
    canvas.setFillColor(PINE)
    canvas.setFont("Helvetica-Bold", 11)
    canvas.drawString(MARGIN, y, "VoltPilot")
    canvas.setFillColor(FOG)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(MARGIN + 2.0 * cm, y, t("tagline", lang))
    canvas.drawRightString(PAGE_W - MARGIN, y, t("doc_title", lang))
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.6)
    canvas.line(MARGIN, y - 0.22 * cm, PAGE_W - MARGIN, y - 0.22 * cm)
    canvas.restoreState()


class NumberedCanvas(pdfcanvas.Canvas):
    """Two-pass canvas, so the footer can say "Page 3 of 7".

    `showPage` normally flushes a page immediately, which is why a one-pass
    footer cannot know the total. Here each page's state is buffered instead and
    replayed in `save()`, at which point `len(self._pages)` is the total. The
    footer is drawn during that replay.
    """

    # `lang` is NOT the parameter name: ReportLab 5's BaseDocTemplate forwards
    # its own `lang` (the PDF /Lang metadata) to the canvasmaker, and a second
    # meaning for that name collides on construction.
    def __init__(self, *args, report_lang: str = "en", **kwargs):
        super().__init__(*args, **kwargs)
        self._lang = report_lang
        self._pages: list[dict] = []

    def showPage(self) -> None:  # noqa: N802 - ReportLab's spelling
        self._pages.append(dict(self.__dict__))
        self._startPage()

    def save(self) -> None:
        total = len(self._pages)
        for state in self._pages:
            self.__dict__.update(state)
            self._draw_footer(total)
            super().showPage()
        super().save()

    def _draw_footer(self, total: int) -> None:
        self.saveState()
        y = MARGIN - 0.55 * cm
        self.setStrokeColor(LINE)
        self.setLineWidth(0.6)
        self.line(MARGIN, y + 0.42 * cm, PAGE_W - MARGIN, y + 0.42 * cm)
        self.setFont("Helvetica", 7.5)
        self.setFillColor(FOG)
        self.drawString(MARGIN, y, _contact_line())
        self.drawRightString(
            PAGE_W - MARGIN,
            y,
            t("page_x_of_y", self._lang, i=self._pageNumber, n=total),
        )
        self.restoreState()


# --------------------------------------------------------------------------
# Document
# --------------------------------------------------------------------------
def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "h1": ParagraphStyle("h1", parent=base["Title"], fontSize=19, leading=22,
                             alignment=0, textColor=INK, spaceAfter=2),
        "meta": ParagraphStyle("meta", parent=base["BodyText"], fontSize=8.5,
                               leading=12, textColor=FOG),
        "h2": ParagraphStyle("h2", parent=base["Heading2"], fontSize=12.5, leading=15,
                             textColor=PINE, spaceBefore=12, spaceAfter=5),
        "h3": ParagraphStyle("h3", parent=base["Heading3"], fontSize=10.5, leading=13,
                             textColor=INK, spaceBefore=7, spaceAfter=2),
        "body": ParagraphStyle("body", parent=base["BodyText"], fontSize=9.5,
                               leading=14, textColor=INK),
        "small": ParagraphStyle("small", parent=base["BodyText"], fontSize=8,
                                leading=11, textColor=FOG),
        "bullet": ParagraphStyle("bullet", parent=base["BodyText"], fontSize=9.5,
                                 leading=14, textColor=INK, leftIndent=10,
                                 bulletIndent=0, spaceAfter=2),
        "headline": ParagraphStyle("headline", parent=base["Heading2"], fontSize=14,
                                   leading=17, textColor=PINE, spaceBefore=14,
                                   spaceAfter=4),
        "right": ParagraphStyle("right", parent=base["BodyText"], fontSize=8.5,
                                leading=12, textColor=FOG, alignment=TA_RIGHT),
    }


def _profile_table(prof: dict, lang: str, st: dict) -> Table:
    annual = float(prof.get("daily_km", 0) or 0) * float(prof.get("trips_per_week", 0) or 0) * 52
    yn = lambda v: t("yes" if v else "no", lang)  # noqa: E731
    rows = [
        (t("p_daily", lang), f"{float(prof.get('daily_km', 0) or 0):g} km"),
        (t("p_days", lang), f"{float(prof.get('trips_per_week', 0) or 0):g}"),
        (t("p_annual", lang), f"{annual:,.0f} km"),
        (t("p_long", lang),
         f"{prof.get('long_trip_frequency', '—')} · {float(prof.get('long_trip_km', 0) or 0):g} km"),
        (t("p_dest", lang), str(prof.get("destination_region", "—")).replace("_", " ").title()),
        (t("p_home", lang), yn(prof.get("can_charge_home"))),
        (t("p_post", lang), str(prof.get("home_postcode", "—"))),
        (t("p_solar", lang), yn(prof.get("consider_solar"))),
    ]
    # Two label/value pairs per row: the previous version ran all eight into one
    # paragraph, which is unreadable and unscannable on a printed page.
    paired = [
        [Paragraph(f"<b>{a[0]}</b>", st["small"]), Paragraph(a[1], st["body"]),
         Paragraph(f"<b>{b[0]}</b>", st["small"]), Paragraph(b[1], st["body"])]
        for a, b in zip(rows[::2], rows[1::2])
    ]
    tbl = Table(paired, colWidths=[3.3 * cm, 4.2 * cm, 3.3 * cm, 4.2 * cm])
    tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, LINE),
    ]))
    return tbl


def _ranking_table(ranking: list[dict], lang: str, st: dict) -> Table:
    head = [t(k, lang) for k in ("c_rank", "c_model", "c_type", "c_price", "c_run", "c_tco")]
    data = [head]
    for r in ranking[:5]:
        data.append([
            str(r.get("rank", "")),
            Paragraph(f"{r.get('brand','')} {r.get('model','')} {r.get('variant','') or ''}".strip(),
                      st["small"]),
            str(r.get("type", "")).upper(),
            _rm(r.get("price_rm")),
            _rm(r.get("running_cost_rm_yr")),
            _rm(r.get("tco_excluding_rm")),
        ])
    tbl = Table(data, repeatRows=1, colWidths=[0.9 * cm, 5.6 * cm, 1.5 * cm, 2.5 * cm, 3.0 * cm, 3.0 * cm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), PINE),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, BONE]),
    ]))
    return tbl


def _how_to_get_there(ctx: dict, lang: str, st: dict) -> list:
    """Concrete steps for the pick, priced by the site's own calculators.

    Every number here comes from `services.calculators`, the same module the
    website's calculators page uses, and each item prints the `basis` string
    that module returns. Nothing is estimated in this file — a report that is
    emailed to a customer is the wrong place to invent a figure.
    """
    ranking = ctx.get("ranking") or []
    if not ranking:
        return []
    pick = ranking[0]
    price = float(pick.get("price_rm") or 0)
    if price <= 0:
        return []

    prof = ctx.get("profile") or {}
    vtype = "ev" if str(pick.get("type", "")).lower() == "ev" else "hybrid"
    name = f"{pick.get('brand','')} {pick.get('model','')}".strip()

    out: list = [Paragraph(t("how_h", lang), st["h2"]),
                 Paragraph(t("how_intro", lang), st["small"]), Spacer(1, 0.2 * cm)]

    def step(title: str, text: str, basis: str) -> None:
        out.append(Paragraph(title, st["h3"]))
        out.append(Paragraph(text, st["body"]))
        if basis:
            out.append(Paragraph(t("basis", lang, b=basis), st["small"]))

    ln = loan(price, vehicle_type=vtype)
    step(
        t("how_finance", lang),
        f"{name} at RM{_rm(price)}. With a {ln['down_payment_pct']:g}% deposit "
        f"(RM{_rm(ln['down_payment_rm'])}) over {ln['tenure_years']} years at "
        f"{ln['flat_rate_pct']:g}% flat, the instalment is "
        f"<b>RM{_rm(ln['monthly_rm'])} a month</b> — RM{_rm(ln['total_payable_rm'])} payable in total.",
        str(ln.get("basis", "")),
    )

    ins = insurance(price, vehicle_type=vtype, policy_year=1,
                    east_malaysia=str(prof.get("destination_region", "")) == "east_malaysia")
    step(
        t("how_insure", lang),
        f"First-year premium about <b>RM{_rm(ins['premium_rm'])}</b> at "
        f"{ins['ncd_pct']:g}% NCD. Each claim-free year moves you up the NCD ladder.",
        str(ins.get("basis", "")),
    )

    if vtype == "ev" and prof.get("can_charge_home"):
        step(
            t("how_charge", lang),
            "You said you can charge at home, which is what makes the running cost above "
            "achievable — it assumes home charging at the off-peak rate, not public DC.",
            "",
        )
        step(
            t("how_tariff", lang),
            "Apply to TNB for the EV-specific Time-of-Use tariff and charge overnight. "
            "The running-cost figure in the table is priced at the off-peak rate; on the "
            "standard domestic tariff it is materially higher.",
            "",
        )
    elif vtype == "ev":
        step(
            t("how_charge", lang),
            "You said you cannot charge at home. The running cost above is priced on public "
            "charging, which is why it is higher than the home-charging case — securing any "
            "overnight AC point changes this figure more than the choice of car does.",
            "",
        )

    if ctx.get("solar"):
        s = ctx["solar"]
        step(
            t("how_solar", lang),
            f"Capex RM{_rm(s.get('capex_rm'))}, saving about RM{_rm(s.get('savings_rm_per_year'))} "
            f"a year, paying back in {s.get('payback_years', '—')} years. Daytime charging then "
            f"costs close to nothing.",
            "",
        )
    return out


def _dealer_block(ctx: dict, lang: str, st: dict) -> list:
    """The distributor for the recommended car's own brand.

    Separate from the VoltPilot advisor panel below it: one is who ranked the
    cars, the other is who sells this one, and a reader needs to be able to tell
    them apart. Brands we could not verify produce nothing at all rather than an
    empty card — see data/brand_contacts.json.
    """
    ranking = ctx.get("ranking") or []
    if not ranking:
        return []
    pick = ranking[0]
    c = brand_contact(pick.get("brand"))
    if not c:
        return []

    rows = []
    if c.get("distributor"):
        rows.append((t("dealer_distributor", lang), c["distributor"]))
    if c.get("phone"):
        rows.append((t("dealer_phone", lang), c["phone"]))
    if c.get("website"):
        rows.append((t("dealer_web", lang), c["website"]))
    if not rows:
        return []

    tbl = Table(
        [[Paragraph(f"<b>{k}</b>", st["body"]), Paragraph(v, st["body"])] for k, v in rows],
        colWidths=[4.5 * cm, 11.5 * cm],
    )
    tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("BOX", (0, 0), (-1, -1), 0.6, LINE),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, LINE),
    ]))
    brand = str(pick.get("brand", "")).strip()
    return [KeepTogether([
        Paragraph(t("dealer_h", lang, brand=brand), st["h2"]),
        Spacer(1, 0.2 * cm),
        tbl,
    ])]


def _contact_block(lang: str, st: dict) -> list:
    """Omits any line that is not configured — see config.Settings."""
    rows = []
    if settings.report_agent_phone:
        label = t("contact_phone", lang)
        who = settings.report_agent_name
        rows.append([Paragraph(f"<b>{label}</b>", st["body"]),
                     Paragraph(f"{settings.report_agent_phone}"
                               + (f"<br/><font size=8 color='#5c6b62'>{who}</font>" if who else ""),
                               st["body"])])
    rows.append([Paragraph(f"<b>{t('contact_web', lang)}</b>", st["body"]),
                 Paragraph(settings.report_website, st["body"])])

    tbl = Table(rows, colWidths=[4.5 * cm, 11.5 * cm])
    tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("BACKGROUND", (0, 0), (-1, -1), BONE),
        ("BOX", (0, 0), (-1, -1), 0.6, LINE),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, LINE),
    ]))
    # One block: a "Talk to a person" heading stranded at the foot of a page
    # with the number itself overleaf defeats the point of printing it.
    return [KeepTogether([
        Paragraph(t("contact_h", lang), st["h2"]),
        Paragraph(t("contact_body", lang), st["body"]),
        Spacer(1, 0.25 * cm),
        tbl,
    ])]


def build_pdf(context: dict) -> bytes:
    """Render the report. `context` carries token, profile, recommendation,
    ranking and (optionally) solar."""
    prof = context.get("profile") or {}
    lang = "bm" if str(prof.get("language", "en")).lower() == "bm" else "en"
    rec = context.get("recommendation") or {}
    ranking = context.get("ranking") or []
    st = _styles()

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        title=t("doc_title", lang),
        author="VoltPilot",
        subject=t("tagline", lang),
        # Sets the PDF's /Lang, which is what a screen reader uses to pick a
        # pronunciation. Free to set correctly, and wrong by default.
        lang="ms-MY" if lang == "bm" else "en-MY",
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        # The frame must clear the furniture drawn outside it, or the first line
        # of body text lands under the header rule.
        topMargin=MARGIN + HEADER_H,
        bottomMargin=MARGIN + FOOTER_H,
    )

    now = datetime.now(MYT)
    story: list = [
        Paragraph(t("doc_title", lang), st["h1"]),
        Paragraph(
            t("generated", lang, date=f"{now:%d %b %Y}") + "  ·  "
            + t("reference", lang, token=str(context.get("token", ""))[:8]),
            st["meta"],
        ),
        Spacer(1, 0.45 * cm),
        Paragraph(t("profile_h", lang), st["h2"]),
        _profile_table(prof, lang, st),
    ]

    # The analyst's headline is already a full statement of the recommendation
    # ("Our recommendation: BYD Atto 3" / "Cadangan kami: ..."), so printing a
    # section heading above it echoed the same words twice running. Let the
    # headline BE the heading, and fall back to the generic one only when the
    # analyst returned nothing.
    if rec.get("headline"):
        story.append(Paragraph(rec["headline"], st["headline"]))
    else:
        story.append(Paragraph(t("rec_h", lang), st["h2"]))
    if rec.get("summary"):
        story.append(Paragraph(rec["summary"], st["body"]))

    tradeoffs = [x for x in (rec.get("tradeoffs") or []) if x]
    if tradeoffs:
        story.append(Paragraph(t("tradeoff_h", lang), st["h3"]))
        for item in tradeoffs:
            story.append(Paragraph(item, st["bullet"], bulletText="•"))

    if ranking:
        story.append(Paragraph(
            t("rank_h", lang, n=min(5, len(ranking)), total=len(ranking)), st["h2"]))
        story.append(_ranking_table(ranking, lang, st))

    milestones = [m for m in (rec.get("roadmap") or []) if m]
    if milestones:
        story.append(Paragraph(t("road_h", lang), st["h2"]))
        for m in milestones:
            year = m.get("year", 0)
            label = t("road_now", lang) if not year else t("road_year", lang, n=year)
            # KeepTogether stops a milestone's heading being orphaned at the
            # foot of a page with its detail overleaf.
            story.append(KeepTogether([
                Paragraph(f"{label} — {m.get('title','')}", st["h3"]),
                Paragraph(m.get("detail", ""), st["body"]),
            ]))

    how = _how_to_get_there(context, lang, st)
    if how:
        # CondPageBreak, not PageBreak: an unconditional break left a page
        # holding two roadmap milestones and 20cm of nothing. This starts the
        # section on a fresh page only when there is too little room to be worth
        # starting it here.
        story.append(CondPageBreak(7 * cm))
        story.extend(how)

    savings = rec.get("savings") or {}
    if savings:
        story.append(Paragraph(t("save_h", lang), st["h2"]))
        story.append(Paragraph(
            f"Estimated CO<sub>2</sub> saved over 10 years: "
            f"<b>{_rm(savings.get('co2_saved_10yr_kg'))} kg</b> against a petrol baseline. "
            f"Annual running cost of the pick: RM{_rm(savings.get('cost_rm_yr_top'))} "
            f"(petrol baseline about RM{_rm(savings.get('cost_rm_yr_petrol_baseline'))}).",
            st["body"]))

    # Solar is not repeated here: it already appears under "How to get there"
    # with the same three figures, framed as something to act on rather than
    # something to note. Two copies on one page read as an editing mistake.

    dealer = _dealer_block(context, lang, st)
    if dealer:
        story.append(Spacer(1, 0.3 * cm))
        story.extend(dealer)

    # The small print comes before the contact panel so the document ENDS on
    # how to reach a person. Report length varies per reader, so which page the
    # tail lands on cannot be fixed by tuning spacing — only by choosing what is
    # last. Both blocks are bound so neither splits mid-sentence.
    story.append(Spacer(1, 0.35 * cm))
    story.append(KeepTogether([
        HRFlowable(width="100%", thickness=0.5, color=LINE, spaceAfter=5),
        Paragraph(t("disclaimer_h", lang), st["h3"]),
        Paragraph(t("disclaimer", lang), st["small"]),
    ]))
    story.append(Spacer(1, 0.45 * cm))
    story.extend(_contact_block(lang, st))

    def on_page(canvas, doc_):
        _draw_header(canvas, doc_, lang)

    doc.build(
        story,
        onFirstPage=on_page,
        onLaterPages=on_page,
        canvasmaker=lambda *a, **kw: NumberedCanvas(*a, report_lang=lang, **kw),
    )
    return buf.getvalue()
