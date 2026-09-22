from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from google import genai
import os, json, uuid

router = APIRouter()

# ── Request / Response models ────────────────────────────────────────────────

class ScanRequest(BaseModel):
    subject:      str = ""
    sender_name:  str = ""
    sender_email: str = ""
    body:         str = ""
    links:        List[str] = []
    reply_to:     str = ""

class ScanResponse(BaseModel):
    threat:    bool
    severity:  str
    title:     str
    indicator: Optional[str] = None
    case_id:   Optional[str] = None

# ── Gemini analysis ──────────────────────────────────────────────────────────

SYSTEM_PROMPT = """
You are an email security analyst. Analyze the email data provided and determine
whether it contains any of these threats:
- Phishing (fake sender, urgency to pay/click, mismatched links)
- Business Email Compromise (BEC) — e.g. fake invoice, payment redirect
- Malware / malicious attachment references
- Social engineering

Respond ONLY with a valid JSON object (no markdown, no extra text):
{
  "threat": true or false,
  "severity": "SAFE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "title": "one-line summary of the threat (or 'No threats detected' if safe)",
  "indicator": "the specific suspicious element (domain, phrase, link) or empty string"
}
"""

def analyze_with_gemini(data: ScanRequest) -> dict:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not set")

    client = genai.Client(api_key=api_key)

    email_text = f"""
Subject: {data.subject}
From: {data.sender_name} <{data.sender_email}>
Reply-To: {data.reply_to}
Links found: {', '.join(data.links) if data.links else 'none'}

Body:
{data.body[:4000]}
""".strip()

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=SYSTEM_PROMPT + "\n\nEmail to analyze:\n" + email_text
    )

    raw = response.text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw.strip())


# ── Route ────────────────────────────────────────────────────────────────────

@router.post("/api/scan", response_model=ScanResponse)
async def scan_email(data: ScanRequest):
    if not data.body and not data.subject:
        raise HTTPException(status_code=400, detail="No email content provided")

    try:
        result = analyze_with_gemini(data)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Gemini returned invalid JSON: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    case_id = None
    if result.get("threat"):
        case_id = str(uuid.uuid4())

    return ScanResponse(
        threat    = result.get("threat", False),
        severity  = result.get("severity", "SAFE"),
        title     = result.get("title", ""),
        indicator = result.get("indicator") or None,
        case_id   = case_id,
    )