from __future__ import annotations

import smtplib
import ssl
from datetime import datetime
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import load_solar, settings
from ..db import Profile, Recommendation, ReportRequest, TopsisResult, get_db
from ..schemas import ReportRequest as ReportRequestSchema
from ..services.report_pdf import MYT, build_pdf

router = APIRouter(prefix="/report", tags=["report"])


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

    lang = str((profile_row.profile_json or {}).get("language", "en")).lower()
    subject = ("Laporan keputusan VoltPilot anda" if lang == "bm"
               else "Your VoltPilot decision report")
    solar = load_solar() if result.overview_json.get("solar_eligible") else None
    pdf = build_pdf({
        "token": body.result_token,
        "profile": profile_row.profile_json,
        "recommendation": rec_row.analyst_json,
        "ranking": result.ranking_json,
        "solar": solar,
    })
    try:
        await run_in_threadpool(
            send_email, body.email, subject,
            "Your personalised EV vs hybrid decision report is attached.\n\n— VoltPilot Malaysia",
            pdf)
    except Exception as exc:  # pragma: no cover - SMTP varies per environment
        raise HTTPException(status_code=502, detail=f"email send failed: {exc}")

    if existing:
        existing.send_count += 1
        await db.commit()
        return {"sent": True, "first": False, "email": existing.sent_to_email}
    db.add(ReportRequest(result_token=body.result_token, sent_to_email=body.email, sent_at=datetime.now(MYT)))
    await db.commit()
    return {"sent": True, "first": True, "email": body.email}