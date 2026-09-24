"""
Analysis Service  —  Sentinel
==============================
Core pipeline (updated):
  1. Parse raw email headers + body
  2. Run real ML pipeline (NLP + XGBoost + Isolation Forest + Ensemble)
  3. Gemini called ONLY for human-readable summary (optional, graceful fallback)
  4. IP geolocation
  5. Save EmailCase + Alert to DB
  6. Apply Gmail label if threat detected

Gemini is NO LONGER the classifier — it only writes plain-English
summaries after the ML models have made the classification decision.
"""

import os
import re
import json
import uuid
import asyncio
import email as email_lib
from datetime import datetime
from email import policy

import httpx
from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials

from services.auth_service import DB
from services.geo_service import enrich_ip                    # ← new
from services.domain_intel_service import enrich_domain       # ← new

# ── Gemini config (summary only) ──────────────────────────────────────────────
def _gemini_key() -> str:
    return os.environ.get("VITE_GEMINI_API_KEY") or os.environ.get("GEMINI_API_KEY", "")

GEMINI_MODEL     = "gemini-3.5-flash"
GMAIL_LABEL_NAME = "⚠️ SENTINEL THREAT"


# ─── Main entry point ─────────────────────────────────────────────────────────

async def analyze_and_save(
    raw_email: str,
    user_id: str,
    gmail_message_id: str | None = None,
) -> dict:
    """Full pipeline: parse → ML classify → Gemini summary → geolocate → save → label."""

    parsed   = parse_email(raw_email)
    analysis = await run_full_pipeline(raw_email, parsed)

    # ── Real IP geolocation (3-provider chain + TOR detection) ───────────────
    geo = await enrich_ip(analysis.get("originating_ip", ""))

    # ── Full WHOIS + DNS domain intelligence (blocking → thread pool) ─────────
    sender_domain = (analysis.get("domain_intel") or {}).get("sender_domain", "")
    if not sender_domain:
        # Fallback: extract domain from sender email
        sender_email = parsed.get("sender_email", "")
        if "@" in sender_email:
            sender_domain = sender_email.split("@", 1)[1].lower()

    if sender_domain:
        loop         = asyncio.get_event_loop()
        domain_intel = await loop.run_in_executor(None, enrich_domain, sender_domain)
        # Merge lookalike fields already computed by ml_models._build_domain_intel
        ml_di = analysis.get("domain_intel") or {}
        domain_intel["lookalike_risk"]  = ml_di.get("lookalike_risk")
        domain_intel["lookalike_score"] = ml_di.get("lookalike_score")
        domain_intel["display_name"]    = ml_di.get("display_name")
        domain_intel["reply_to_domain"] = ml_di.get("reply_to_domain")
        # Append any ML notes to the risk notes
        ml_notes = ml_di.get("notes") or ""
        if ml_notes and ml_notes not in (domain_intel.get("notes") or ""):
            existing = domain_intel.get("notes") or ""
            domain_intel["notes"] = f"{existing}; {ml_notes}".strip("; ")
        analysis["domain_intel"] = domain_intel

    fraud_score = analysis.get("fraud_score", 0)

    # ── Save case ─────────────────────────────────────────────────────────────
    case_id = str(uuid.uuid4())
    case = {
        "id":                  case_id,
        "user_id":             user_id,
        "gmail_message_id":    gmail_message_id,
        "subject":             parsed.get("subject", "(no subject)"),
        "sender_email":        parsed.get("sender_email", ""),
        "sender_display_name": parsed.get("sender_display_name", ""),
        "recipient_email":     parsed.get("recipient_email", ""),
        "raw_email":           raw_email,
        "threat_level":        analysis.get("threat_level", "suspicious"),
        "fraud_score":         fraud_score,
        "classification":      analysis.get("classification", ""),
        "summary":             analysis.get("summary", ""),
        "threat_indicators":   analysis.get("threat_indicators", []),
        "bec_patterns":        analysis.get("bec_patterns", []),
        "header_anomalies":    analysis.get("header_anomalies", []),
        "authentication":      analysis.get("authentication", {}),
        "relay_path":          analysis.get("relay_path", []),
        "originating_ip":      analysis.get("originating_ip", ""),
        "domain_intel":        analysis.get("domain_intel", {}),
        "geolocation":         geo,
        "attribution":         analysis.get("attribution", {}),
        "recommendations":     analysis.get("recommendations", []),
        "ml_scores":           analysis.get("ml_scores", {}),
        "shap_contributions":  analysis.get("shap_contributions", []),
        "status":              "new",
        "created_date":        datetime.utcnow().isoformat(),
    }
    DB["cases"][case_id] = case

    # ── Alert if threat score ≥ 50 ────────────────────────────────────────────
    if fraud_score >= 50:
        severity = (
            "critical" if fraud_score >= 90 else
            "high"     if fraud_score >= 70 else
            "medium"
        )
        alert_id = str(uuid.uuid4())
        alert = {
            "id":               alert_id,
            "user_id":          user_id,
            "case_id":          case_id,
            "gmail_message_id": gmail_message_id,
            "title":            f"{analysis.get('threat_level','threat').title()}: {parsed.get('subject','(no subject)')}",
            "severity":         severity,
            "message":          analysis.get("summary", ""),
            "indicator":        analysis.get("originating_ip") or parsed.get("sender_email"),
            "acknowledged":     False,
            "created_date":     datetime.utcnow().isoformat(),
        }
        DB["alerts"][alert_id] = alert

        if gmail_message_id:
            google_token = DB["google_tokens"].get(user_id)
            if google_token:
                await apply_gmail_label(google_token, gmail_message_id, severity)

    return {"case": case, "geolocation": geo, "analysis": analysis}


# ─── Full pipeline: ML primary + Gemini summary ───────────────────────────────

async def run_full_pipeline(raw_email: str, parsed: dict) -> dict:
    """
    Step 1: Run ML pipeline (always).
    Step 2: Optionally enrich summary via Gemini (never changes the score).
    """
    from ml_pipeline.ml_models import run_ml_pipeline, models_ready

    if not models_ready():
        print("[Sentinel] ML models not trained yet — run: python ml_pipeline/train.py")
        return _fallback_analysis(parsed)

    # ── ML classification (the real decision) ─────────────────────────────────
    try:
        ml_result = run_ml_pipeline(parsed)
    except Exception as e:
        print(f"[Sentinel] ML pipeline error: {e}")
        return _fallback_analysis(parsed)

    # ── Gemini: enrich summary only (fire-and-forget; never blocks) ───────────
    api_key = _gemini_key()
    if api_key and ml_result.get("fraud_score", 0) >= 30:
        try:
            enriched_summary = await _gemini_summarise(ml_result, parsed, api_key)
            if enriched_summary:
                ml_result["summary"] = enriched_summary
        except Exception as e:
            print(f"[Sentinel] Gemini summary failed (non-fatal): {e}")
            # Keep the ML-generated summary — pipeline is unaffected

    return ml_result


# ─── Quick pipeline (extension fast path — no Gemini) ────────────────────────

def run_quick_pipeline(parsed: dict) -> dict:
    """
    Synchronous, Gemini-free pipeline for the Chrome extension's /analyze/quick
    endpoint. Returns in <300ms.
    """
    from ml_pipeline.ml_models import run_ml_pipeline, models_ready

    if not models_ready():
        return _fallback_analysis(parsed)

    try:
        return run_ml_pipeline(parsed)
    except Exception as e:
        print(f"[Sentinel] Quick pipeline error: {e}")
        return _fallback_analysis(parsed)


# ─── Gemini summary enrichment (non-blocking) ─────────────────────────────────

SUMMARY_PROMPT = """\
You are a cybersecurity analyst. Write a plain-text forensic summary.

STRICT RULES — follow every rule or your response is rejected:
- Write EXACTLY 2 sentences. Not 1, not 3. Exactly 2.
- NO asterisks, NO markdown, NO bullet points, NO bold, NO headers.
- NO labels like "Goal:", "Sentence 1:", "Note:". Just 2 sentences directly.
- Every sentence must be grammatically complete. Do not trail off.

Sentence 1: State what type of threat this email is and its fraud score out of 100.
Sentence 2: State the single strongest piece of evidence and the recommended action.

Data to use:
Threat={threat_level}, Score={fraud_score}/100, Class={classification}
Evidence={indicators}
BEC={bec}
Auth: SPF={spf} DKIM={dkim} DMARC={dmarc}
From={sender} Subject={subject}
"""

async def _gemini_summarise(ml_result: dict, parsed: dict, api_key: str) -> str:
    import re as _re
    auth       = ml_result.get("authentication", {})
    indicators = ml_result.get("threat_indicators", [])

    prompt = SUMMARY_PROMPT.format(
        threat_level  = ml_result.get("threat_level", "unknown"),
        fraud_score   = ml_result.get("fraud_score", 0),
        classification= ml_result.get("classification", ""),
        indicators    = "; ".join(indicators[:2]) if indicators else "None",
        bec           = "; ".join(ml_result.get("bec_patterns", [])[:1]) or "None",
        spf           = auth.get("spf", "none"),
        dkim          = auth.get("dkim", "none"),
        dmarc         = auth.get("dmarc", "none"),
        sender        = parsed.get("sender_email", ""),
        subject       = parsed.get("subject", ""),
    )

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{GEMINI_MODEL}:generateContent?key={api_key}"
    )
    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.1, "maxOutputTokens": 600},
    }

    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(url, json=payload)

    if resp.status_code != 200:
        return ""

    try:
        raw = resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
        # Strip any markdown Gemini adds despite instructions
        clean = _re.sub(r"\*+", "", raw)
        clean = _re.sub(r"^#+\s*", "", clean, flags=_re.MULTILINE)
        clean = _re.sub(r"^\s*[-•]\s*", "", clean, flags=_re.MULTILINE)
        clean = _re.sub(r"\*?(Goal|Sentence\s*\d+|Note|Summary):\*?\s*", "", clean, flags=_re.IGNORECASE)
        clean = _re.sub(r"\n{2,}", " ", clean)
        return clean.strip()
    except Exception:
        return ""


# ─── Email parser ─────────────────────────────────────────────────────────────

def parse_email(raw: str) -> dict:
    msg = email_lib.message_from_string(raw, policy=policy.compat32)

    sender_raw   = msg.get("From", "") or ""
    sender_email = _extract_email(sender_raw)
    sender_name  = _extract_name(sender_raw)

    # Collect Authentication-Results header for auth parsing
    auth_results = msg.get("Authentication-Results", "") or ""
    # Also check ARC-Authentication-Results
    arc_auth = msg.get("ARC-Authentication-Results", "") or ""

    return {
        "subject":                parsed_subject(msg),
        "sender_email":           sender_email,
        "sender_display_name":    sender_name,
        "recipient_email":        _extract_email(msg.get("To", "") or ""),
        "reply_to":               msg.get("Reply-To", "") or "",
        "return_path":            msg.get("Return-Path", "") or "",
        "message_id":             msg.get("Message-ID", "") or "",
        "received_headers":       msg.get_all("Received") or [],
        "authentication_results": auth_results + " " + arc_auth,
        "date":                   msg.get("Date", "") or "",
        "body":                   _get_body(msg),
        "has_headers":            bool(msg.get_all("Received")),
    }


def parsed_subject(msg) -> str:
    raw = msg.get("Subject", "") or ""
    # Decode encoded subjects (=?UTF-8?...?=)
    from email.header import decode_header
    parts = decode_header(raw)
    result = []
    for part, enc in parts:
        if isinstance(part, bytes):
            result.append(part.decode(enc or "utf-8", errors="replace"))
        else:
            result.append(str(part))
    return " ".join(result) or "(no subject)"


def _extract_email(addr: str) -> str:
    m = re.search(r"<([^>]+)>", addr)
    return m.group(1).strip() if m else addr.strip()

def _extract_name(addr: str) -> str:
    m = re.match(r'^"?([^"<]+)"?\s*<', addr)
    return m.group(1).strip() if m else ""

def _get_body(msg) -> str:
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain":
                try:
                    payload = part.get_payload(decode=True)
                    if payload:
                        return payload.decode("utf-8", errors="replace")
                except Exception:
                    pass
    try:
        payload = msg.get_payload(decode=True)
        if payload:
            return payload.decode("utf-8", errors="replace")
    except Exception:
        pass
    raw_payload = msg.get_payload()
    return raw_payload if isinstance(raw_payload, str) else ""


# ─── Fallback when models not trained ────────────────────────────────────────

def _fallback_analysis(parsed: dict) -> dict:
    return {
        "threat_level":      "suspicious",
        "fraud_score":       0,
        "classification":    "ML models not trained — run python ml_pipeline/train.py",
        "summary":           (
            "The ML models have not been trained yet. "
            "Run: cd backend && python ml_pipeline/train.py "
            "then restart the server."
        ),
        "threat_indicators": [],
        "bec_patterns":      [],
        "header_anomalies":  [],
        "authentication":    {"spf": "none", "dkim": "none", "dmarc": "none",
                              "spf_aligned": False, "dkim_aligned": False, "notes": ""},
        "relay_path":        [],
        "originating_ip":    "",
        "domain_intel":      {},
        "attribution":       {"confidence": 0, "likely_origin_type": "unknown", "assessment": ""},
        "recommendations":   ["Train models: cd backend && python ml_pipeline/train.py"],
        "ml_scores":         {},
        "shap_contributions":[],
    }


# ─── IP Geolocation ───────────────────────────────────────────────────────────
# Moved to services/geo_service.py  →  enrich_ip(ip)
# Imported at the top of this file.


# ─── Gmail label ──────────────────────────────────────────────────────────────

LABEL_COLORS = {
    "critical": {"backgroundColor": "#cc0000", "textColor": "#ffffff"},
    "high":     {"backgroundColor": "#ff4500", "textColor": "#ffffff"},
    "medium":   {"backgroundColor": "#ff9900", "textColor": "#ffffff"},
    "low":      {"backgroundColor": "#0000cc", "textColor": "#ffffff"},
}

async def apply_gmail_label(google_token: str, message_id: str, severity: str):
    try:
        creds   = Credentials(token=google_token)
        service = build("gmail", "v1", credentials=creds)
        label_id = _get_or_create_label(service, severity)
        service.users().messages().modify(
            userId="me",
            id=message_id,
            body={"addLabelIds": [label_id]},
        ).execute()
    except Exception as exc:
        print(f"[Sentinel] apply_gmail_label failed: {exc}")


def _get_or_create_label(service, severity: str) -> str:
    label_name = f"{GMAIL_LABEL_NAME} [{severity.upper()}]"
    existing   = service.users().labels().list(userId="me").execute().get("labels", [])
    for lbl in existing:
        if lbl["name"] == label_name:
            return lbl["id"]
    created = service.users().labels().create(
        userId="me",
        body={
            "name":                  label_name,
            "labelListVisibility":   "labelShow",
            "messageListVisibility": "show",
            "color":                 LABEL_COLORS.get(severity, LABEL_COLORS["high"]),
        },
    ).execute()
    return created["id"]