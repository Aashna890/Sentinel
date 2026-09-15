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
import email as email_lib
from datetime import datetime
from email import policy

import httpx
from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials

from services.auth_service import DB

# ── Gemini config (summary only) ──────────────────────────────────────────────
def _gemini_key() -> str:
    return os.environ.get("VITE_GEMINI_API_KEY") or os.environ.get("GEMINI_API_KEY", "")

GEMINI_MODEL     = "gemini-3.5-flash"
IPAPI_URL        = "http://ip-api.com/json/{ip}?fields=status,country,regionName,city,isp,org,as,asname,proxy,hosting,mobile,lat,lon,query"
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
    geo      = await geolocate(analysis.get("originating_ip", ""))

    # DNS/WHOIS enrichment — runs in parallel with case save, non-blocking
    sender_domain = parsed.get("sender_email", "").split("@")[-1] if "@" in parsed.get("sender_email", "") else ""
    dns_intel = await enrich_domain_intel(sender_domain) if sender_domain else {}
    # Merge DNS intel into domain_intel (ML model findings take priority)
    base_domain_intel = analysis.get("domain_intel", {}) or {}
    base_domain_intel.update({k: v for k, v in dns_intel.items() if k not in base_domain_intel or not base_domain_intel[k]})
    analysis["domain_intel"] = base_domain_intel

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
You are a cybersecurity analyst writing a brief forensic summary for a security dashboard.

The email below has already been analysed by our ML pipeline. Use ONLY the data provided —
do not re-score or re-classify. Write 2-3 clear sentences for a non-technical analyst:
  • What the threat is
  • What the strongest evidence is
  • What action they should take

ML Results:
  Threat Level:    {threat_level}
  Fraud Score:     {fraud_score}/100
  Classification:  {classification}
  Key Indicators:  {indicators}
  BEC Patterns:    {bec}
  Auth Status:     SPF={spf}, DKIM={dkim}, DMARC={dmarc}

Email From: {sender}
Subject:    {subject}

Respond in 2-3 sentences only. No markdown, no bullet points.
"""

async def _gemini_summarise(ml_result: dict, parsed: dict, api_key: str) -> str:
    auth = ml_result.get("authentication", {})
    indicators = ml_result.get("threat_indicators", [])

    prompt = SUMMARY_PROMPT.format(
        threat_level  = ml_result.get("threat_level", "unknown"),
        fraud_score   = ml_result.get("fraud_score", 0),
        classification= ml_result.get("classification", ""),
        indicators    = "; ".join(indicators[:3]) if indicators else "None",
        bec           = "; ".join(ml_result.get("bec_patterns", [])[:2]) or "None",
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
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 256},
    }

    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(url, json=payload)

    if resp.status_code != 200:
        return ""

    try:
        return resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
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

async def geolocate(ip: str) -> dict:
    if not ip or ip in ("127.0.0.1", "::1", ""):
        return {}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(IPAPI_URL.format(ip=ip))
        data = r.json()
        if data.get("status") != "success":
            return {}
        return {
            "ip":         data.get("query"),
            "country":    data.get("country"),
            "region":     data.get("regionName"),
            "city":       data.get("city"),
            "lat":        data.get("lat"),
            "lon":        data.get("lon"),
            "isp":        data.get("isp"),
            "org":        data.get("org"),
            "asn":        data.get("as"),
            "asname":     data.get("asname"),
            "is_proxy":   data.get("proxy", False),
            "is_hosting": data.get("hosting", False),
            "is_mobile":  data.get("mobile", False),
        }
    except Exception as exc:
        print(f"[Sentinel] Geolocate failed for {ip}: {exc}")
        return {}


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

# ─── DNS / WHOIS enrichment ───────────────────────────────────────────────────

async def enrich_domain_intel(domain: str) -> dict:
    """
    Enrich domain intelligence with live DNS and WHOIS data.
    Non-blocking — failures return partial data gracefully.

    Returns dict with:
      mx_records   — list of MX hostnames
      a_records    — list of A record IPs
      has_spf      — bool (TXT record contains v=spf1)
      has_dmarc    — bool (_dmarc TXT record exists)
      domain_age_days — int or None (from WHOIS)
      registrar    — str or None
      created      — str or None
      is_new_domain — bool (registered < 30 days ago)
      whois_error  — str or None
    """
    import asyncio
    result = {
        "mx_records":     [],
        "a_records":      [],
        "has_spf":        False,
        "has_dmarc":      False,
        "domain_age_days": None,
        "registrar":      None,
        "created":        None,
        "is_new_domain":  False,
        "whois_error":    None,
    }

    if not domain:
        return result

    loop = asyncio.get_event_loop()

    # ── MX records (via socket/DNS) ───────────────────────────────────────────
    try:
        import dns.resolver
        mx_answers = dns.resolver.resolve(domain, "MX", lifetime=5)
        result["mx_records"] = sorted(
            [str(r.exchange).rstrip(".") for r in mx_answers],
            key=lambda x: x
        )
    except Exception:
        # dnspython not installed or DNS error — try stdlib
        try:
            mx = await loop.run_in_executor(None, socket.getaddrinfo, domain, None)
            result["a_records"] = list({item[4][0] for item in mx})
        except Exception:
            pass

    # ── A records ─────────────────────────────────────────────────────────────
    try:
        import dns.resolver
        a_answers = dns.resolver.resolve(domain, "A", lifetime=5)
        result["a_records"] = [str(r) for r in a_answers]
    except Exception:
        pass

    # ── SPF TXT record ────────────────────────────────────────────────────────
    try:
        import dns.resolver
        txt_answers = dns.resolver.resolve(domain, "TXT", lifetime=5)
        for rdata in txt_answers:
            txt = b"".join(rdata.strings).decode("utf-8", errors="ignore")
            if "v=spf1" in txt.lower():
                result["has_spf"] = True
                break
    except Exception:
        pass

    # ── DMARC record ─────────────────────────────────────────────────────────
    try:
        import dns.resolver
        dmarc_answers = dns.resolver.resolve(f"_dmarc.{domain}", "TXT", lifetime=5)
        result["has_dmarc"] = any(
            "v=dmarc1" in b"".join(r.strings).decode("utf-8", errors="ignore").lower()
            for r in dmarc_answers
        )
    except Exception:
        pass

    # ── WHOIS (domain age, registrar) ─────────────────────────────────────────
    try:
        import whois as _whois
        def _do_whois():
            return _whois.whois(domain)
        w = await asyncio.wait_for(
            loop.run_in_executor(None, _do_whois), timeout=8
        )
        if w:
            created = w.creation_date
            if isinstance(created, list):
                created = created[0]
            if created:
                result["created"] = str(created)[:10]
                age = (datetime.utcnow() - created).days if hasattr(created, "year") else None
                result["domain_age_days"] = age
                result["is_new_domain"]   = age is not None and age < 30
            result["registrar"] = str(w.registrar or "")[:80] or None
    except Exception as e:
        result["whois_error"] = str(e)[:100]

    return result