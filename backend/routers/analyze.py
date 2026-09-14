"""
Analyze router
--------------
POST /api/analyze        — Full pipeline (web app): ML + Gemini summary + save case
POST /api/analyze/quick  — Fast path (Chrome extension): ML only, <300ms, no save
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from services.auth_service import get_current_user
from services.analysis_service import analyze_and_save, parse_email, run_quick_pipeline

router = APIRouter()


class AnalyzeRequest(BaseModel):
    raw_email: str


# ── Full pipeline (web app) ───────────────────────────────────────────────────

@router.post("")
async def analyze(body: AnalyzeRequest, user=Depends(get_current_user)):
    """
    Full forensic analysis pipeline.
    Runs ML models → optional Gemini summary → saves EmailCase + Alert to DB.
    Called by AnalyzeEmail.jsx when the analyst clicks "Run Forensic Analysis".
    """
    result = await analyze_and_save(raw_email=body.raw_email, user_id=user["id"])
    return result


# ── Quick pipeline (Chrome extension fast path) ───────────────────────────────

@router.post("/quick")
def analyze_quick(body: AnalyzeRequest, user=Depends(get_current_user)):
    """
    Lightweight synchronous endpoint for the Chrome extension.
    Runs only the three ML models + ensemble scoring.
    - No Gemini call (saves ~2-5s latency)
    - No DB save (caller decides whether to escalate)
    - Target response time: <300ms

    Returns the same threat_level / fraud_score / ml_scores fields
    so the extension can inject a banner into Gmail immediately.
    """
    parsed = parse_email(body.raw_email)
    result = run_quick_pipeline(parsed)

    # Return a slimmed response — just what the extension needs for its banner
    return {
        "threat_level":     result.get("threat_level", "suspicious"),
        "fraud_score":      result.get("fraud_score", 0),
        "classification":   result.get("classification", ""),
        "summary":          result.get("summary", ""),
        "ml_scores":        result.get("ml_scores", {}),
        "threat_indicators":result.get("threat_indicators", [])[:3],  # top 3 only
        "authentication":   result.get("authentication", {}),
        "originating_ip":   result.get("originating_ip", ""),
    }