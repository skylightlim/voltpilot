from __future__ import annotations

import io
import smtplib
import ssl
from datetime import datetime
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from fastapi import APIRouter, Depends, HTTPException
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import load_solar, settings
from ..db import Profile, Recommendation, ReportRequest, TopsisResult, get_db
from ..schemas import ReportRequest as ReportRequestSchema

router = APIRouter(prefix="/report", tags=["report"])


def build_pdf(context: dict) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=1.6 * cm, bottomMargin=1.6 * cm)
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("H1", parent=styles["Title"], fontSize=17, spaceAfter=6)
    h2 = ParagraphStyle("H2", parent=styles["Heading2"], fontSize=13, textColor=colors.HexColor("#0F3D5E"))
    body = ParagraphStyle("Body", parent=styles["BodyText"], fontSize=9.5, leading=14)

    story = [Paragraph("VoltPilot — EV vs Hybrid Decision Report", h1),
             Paragraph(f"Generated {datetime.utcnow():%d %b %Y} · result token {context['token'][:8]}…", body),
             Spacer(1, 0.5 * cm)]

    prof = context["profile"]
    story.append(Paragraph("Your profile", h2))
    story.append(Paragraph(
        f"Daily driving: {prof.get('daily_km', 0):g} km · days/week: {prof.get('trips_per_week', 0):g} · "
        f"long trips: {prof.get('long_trip_frequency', '-')} ({prof.get('long_trip_km', 0):g} km) · "
        f"destination region: {prof.get('destination_region', '-')} · charge at home: "
        f"{'yes' if prof.get('can_charge_home') else 'no'} · postcode: {prof.get('home_postcode', '-')} · "
        f"considering solar: {'yes' if prof.get('consider_solar') else 'no'}",
        body))
    story.append(Spacer(1, 0.3 * cm))

    story.append(Paragraph("Recommendation", h2))
    rec = context["recommendation"]
    story.append(Paragraph(rec["headline"], ParagraphStyle("head", parent=styles["Heading3"])))
    story.append(Paragraph(rec["summary"], body))
    for t in rec.get("tradeoffs", []):
        story.append(Paragraph(f"• {t}", body))
    story.append(Spacer(1, 0.3 * cm))

    story.append(Paragraph("Roadmap (relative years)", h2))
    for m in rec.get("roadmap", []):
        story.append(Paragraph(
            f"Year {m['year']} — {m['title']}",
            ParagraphStyle("rm", parent=styles["BodyText"], fontName="Helvetica-Bold")))
        story.append(Paragraph(m["detail"], body))
    story.append(Spacer(1, 0.3 * cm))

    story.append(Paragraph("TOPSIS ranking (top 5 of 167)", h2))
    data = [["#", "Model", "Type", "Price (RM)", "Running cost/yr (RM)", "10-yr excl. TCO (RM)"]]
    for r in context["ranking"][:5]:
        data.append([
            str(r["rank"]),
            f"{r['brand']} {r['model']} {r.get('variant', '')}".strip(),
            r["type"].upper(),
            f"{r['price_rm']:,.0f}",
            f"{r['running_cost_rm_yr']:,.0f}",
            f"{r['tco_excluding_rm']:,.0f}",
        ])
    table = Table(data, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F3D5E")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.grey),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#EEF3F7")]),
    ]))
    story.append(table)
    story.append(Spacer(1, 0.3 * cm))

    savings = rec.get("savings", {})
    story.append(Paragraph("Savings & emissions", h2))
    story.append(Paragraph(
        f"Estimated CO₂ saved over 10 years: {savings.get('co2_saved_10yr_kg', 0):,} kg versus a "
        f"petrol baseline. Top pick annual running cost: RM{savings.get('cost_rm_yr_top', 0):,} "
        f"(petrol baseline: ~RM{savings.get('cost_rm_yr_petrol_baseline', 0):,}).", body))

    solar = context.get("solar")
    if solar:
        story.append(Spacer(1, 0.3 * cm))
        story.append(Paragraph("Solar-first savings (eligible)", h2))
        story.append(Paragraph(
            f"Rooftop solar (avg MY): capex RM{solar['capex_rm']:,}, savings ~RM{solar['savings_rm_per_year']:,}/yr, "
            f"payback {solar['payback_years']} years — daytime charging becomes near-zero cost.", body))

    doc.build(story)
    return buf.getvalue()


def send_email(to: str, subject: str, body_text: str, pdf: bytes) -> None:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg.attach(MIMEText(body_text, "plain", "utf-8"))
    part = MIMEApplication(pdf, _subtype="pdf")
    part.add_header("Content-Disposition", "attachment", filename="ai-transport-report.pdf")
    msg.attach(part)

    context = ssl.create_default_context()
    if settings.smtp_tls:  # implicit TLS on e.g. port 465
        with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=10, context=context) as smtp:
            if settings.smtp_user:
                smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(msg)
        return

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
        smtp.starttls(context=context)  # STARTTLS upgrade (e.g. port 587)
        if settings.smtp_user:
            smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(msg)


@router.post("")
async def email_report(body: ReportRequestSchema, db: AsyncSession = Depends(get_db)) -> dict:
    """Single-send + email bind (D16/D21): first email stored; repeats re-send to that address only."""
    result = await db.scalar(select(TopsisResult).where(TopsisResult.result_token == body.result_token))
    if not result:
        raise HTTPException(status_code=404, detail="no result for this token")

    profile_row = await db.scalar(select(Profile).where(Profile.token == body.result_token))
    rec_row = await db.scalar(select(Recommendation).where(Recommendation.result_token == body.result_token))
    if not (profile_row and rec_row):
        raise HTTPException(status_code=409, detail="analysis not ready yet — please try again in a moment")

    existing = await db.scalar(select(ReportRequest).where(ReportRequest.result_token == body.result_token))
    if existing and existing.sent_to_email.lower() != body.email.lower():
        raise HTTPException(status_code=409, detail="this report is bound to the email used on first send")

    if not settings.enable_email:
        raise HTTPException(status_code=503, detail="email sending disabled in this environment")

    solar = load_solar() if result.overview_json.get("solar_eligible") else None
    pdf = build_pdf({
        "token": body.result_token,
        "profile": profile_row.profile_json,
        "recommendation": rec_row.analyst_json,
        "ranking": result.ranking_json,
        "solar": solar,
    })
    try:
        send_email(body.email, "Your VoltPilot decision report",
                   "Your personalised EV vs hybrid decision report is attached.\n\n— VoltPilot Malaysia",
                   pdf)
    except Exception as exc:  # pragma: no cover - SMTP varies per environment
        raise HTTPException(status_code=502, detail=f"email send failed: {exc}")

    if existing:
        existing.send_count += 1
        await db.commit()
        return {"sent": True, "first": False, "email": existing.sent_to_email}
    db.add(ReportRequest(result_token=body.result_token, sent_to_email=body.email, sent_at=datetime.utcnow()))
    await db.commit()
    return {"sent": True, "first": True, "email": body.email}