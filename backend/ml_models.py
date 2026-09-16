"""
ml_models.py  —  Sentinel ML Inference Engine
==============================================
Loads trained models once at startup and exposes run_ml_pipeline()
which is called by analysis_service.py for every email.

Pipeline per email:
  1. Build text string (subject + body)
  2. Build 25-dim structured feature vector
  3. NLP model  → class probabilities (TF-IDF + LinearSVC)
  4. Structured model → threat probability (XGBoost)
  5. Anomaly model → anomaly score (Isolation Forest)
  6. Ensemble → final fraud_score + threat_level
  7. SHAP → top contributing features (explainability)
"""

import os
import re
from pathlib import Path
from typing import Optional

import numpy as np
import joblib

from ml_pipeline.feature_extractor import (
    build_feature_vector,
    extract_header_features,
    extract_url_features,
    STRUCTURED_FEATURE_NAMES,
    lookalike_score,
    KNOWN_BRANDS,
)

MODEL_DIR = Path(__file__).parent / "ml_pipeline" / "models"

# ── Lazy model store ──────────────────────────────────────────────────────────
_models: dict = {}


def _load_models():
    """Load all .joblib models once at first call. Thread-safe for uvicorn."""
    global _models
    if _models:
        return _models

    required = ["nlp_model", "structured_model", "anomaly_model", "label_encoder"]
    for name in required:
        path = MODEL_DIR / f"{name}.joblib"
        if not path.exists():
            raise FileNotFoundError(
                f"Model not found: {path}\n"
                f"Run:  cd backend && python train.py"
            )
        _models[name] = joblib.load(path)
        print(f"[Sentinel ML] Loaded {name}.joblib")

    # Try to load SHAP explainer (optional — only works if shap is installed)
    try:
        import shap
        _models["shap_explainer"] = shap.TreeExplainer(_models["structured_model"])
        print("[Sentinel ML] SHAP explainer ready")
    except Exception as e:
        print(f"[Sentinel ML] SHAP not available: {e} — feature importance disabled")
        _models["shap_explainer"] = None

    return _models


def models_ready() -> bool:
    """Check if models are trained and available."""
    return all(
        (MODEL_DIR / f"{n}.joblib").exists()
        for n in ["nlp_model", "structured_model", "anomaly_model", "label_encoder"]
    )


# ── Threat level mapper ───────────────────────────────────────────────────────
# Thresholds are env-configurable so they can be tuned post-deployment
import os as _os

_THRESH_FRAUD      = int(_os.environ.get("THRESH_FRAUD",      "85"))
_THRESH_PHISHING   = int(_os.environ.get("THRESH_PHISHING",   "70"))
_THRESH_SUSPICIOUS = int(_os.environ.get("THRESH_SUSPICIOUS", "40"))

def _score_to_threat_level(score: float, nlp_label: str = "") -> str:
    """
    Map ensemble fraud score → threat level.
    The NLP label is used as a tiebreaker when the score is borderline —
    e.g. a score of 68 with nlp_label='bec' is promoted to 'fraud'.
    """
    high_confidence_labels = {"bec", "impersonation", "phishing"}

    if score >= _THRESH_FRAUD:
        return "fraud"
    if score >= _THRESH_PHISHING:
        # BEC and impersonation at this score → promote to fraud
        if nlp_label in high_confidence_labels:
            return "fraud"
        return "phishing"
    if score >= _THRESH_SUSPICIOUS:
        if nlp_label == "bec":
            return "phishing"         # BEC always at least phishing
        if nlp_label == "impersonation":
            return "impersonation"
        return "suspicious"
    if score > 0:
        return "legitimate"
    return "legitimate"


# ── Label → threat weight mapping (NLP model output → ensemble contribution) ──

LABEL_THREAT_MAP = {
    # Maps LabelEncoder class names → threat weight for ensemble
    # Weight of 0.0 = fully legitimate, 1.0 = maximum threat signal
    "legitimate":    {"is_threat": False, "weight": 0.0},
    "spam":          {"is_threat": True,  "weight": 0.35},
    "phishing":      {"is_threat": True,  "weight": 0.80},
    "bec":           {"is_threat": True,  "weight": 0.92},
    "impersonation": {"is_threat": True,  "weight": 0.78},
}


# ── SHAP explainability ───────────────────────────────────────────────────────

def _get_shap_contributions(vec: np.ndarray) -> list[dict]:
    """Return top-5 feature contributions from SHAP TreeExplainer."""
    m = _models.get("shap_explainer")
    if m is None:
        return []
    try:
        import shap
        sv = m.shap_values(vec.reshape(1, -1))
        # sv shape: (1, n_features) or list for multi-class
        if isinstance(sv, list):
            sv = sv[1]  # class=1 (threat) SHAP values
        contributions = sv[0]
        pairs = list(zip(STRUCTURED_FEATURE_NAMES, contributions))
        pairs.sort(key=lambda x: abs(x[1]), reverse=True)
        return [
            {"feature": name, "contribution": round(float(val), 4), "direction": "+" if val > 0 else "-"}
            for name, val in pairs[:5]
        ]
    except Exception as e:
        print(f"[Sentinel ML] SHAP error: {e}")
        return []


# ── Main inference function ───────────────────────────────────────────────────

def run_ml_pipeline(parsed: dict) -> dict:
    """
    Full ML inference pipeline.

    Args:
        parsed: Output of parse_email() from analysis_service.py

    Returns:
        dict with all fields needed by analysis_service.analyze_and_save()
    """
    m = _load_models()

    subject = parsed.get("subject", "") or ""
    body    = parsed.get("body", "")    or ""
    text    = f"{subject} {body}".strip()

    # ── Step 1: Feature extraction ────────────────────────────────────────────
    vec = build_feature_vector(text, parsed)

    # ── Step 2: NLP model (TF-IDF + LinearSVC) ───────────────────────────────
    nlp_model = m["nlp_model"]
    le        = m["label_encoder"]

    # LinearSVC doesn't have predict_proba — use decision_function
    decision_scores = nlp_model.decision_function([text])
    if decision_scores.ndim == 1:
        # Binary case
        nlp_threat_prob = float(1 / (1 + np.exp(-decision_scores[0])))  # sigmoid
        nlp_label = "threat" if nlp_threat_prob > 0.5 else "legitimate"
    else:
        # Multi-class
        probs = np.exp(decision_scores) / np.exp(decision_scores).sum(axis=1, keepdims=True)
        pred_idx = np.argmax(probs[0])
        nlp_label = le.classes_[pred_idx]
        # Weight by threat label mapping
        nlp_threat_prob = LABEL_THREAT_MAP.get(nlp_label, {"weight": 0.5})["weight"]

    # ── Step 3: Structured model (XGBoost) ───────────────────────────────────
    xgb_model       = m["structured_model"]
    xgb_proba       = xgb_model.predict_proba(vec.reshape(1, -1))[0]
    xgb_threat_prob = float(xgb_proba[1])   # probability of class=1 (threat)

    # ── Step 4: Anomaly detector (Isolation Forest) ───────────────────────────
    iso_model    = m["anomaly_model"]
    raw_score    = float(iso_model.score_samples(vec.reshape(1, -1))[0])
    # score_samples returns negative: more negative = more anomalous
    # Normalise to [0,1] where 1.0 = highly anomalous
    # Typical range is roughly [-0.6, 0.1]
    anomaly_prob = float(np.clip((raw_score + 0.6) / 0.7, 0, 1))
    anomaly_prob = 1.0 - anomaly_prob  # flip: high = anomalous

    # ── Step 5: Ensemble scorer ───────────────────────────────────────────────
    # Weights designed so that NLP + header/structured signals dominate
    # and anomaly acts as a tiebreaker
    #
    #   fraud_score = 0.40 × NLP + 0.35 × Structured + 0.15 × Anomaly
    #               + header_bonus (up to 10 pts for hard auth failures)
    #
    raw_ensemble = (
        0.40 * nlp_threat_prob +
        0.35 * xgb_threat_prob +
        0.15 * anomaly_prob
    )

    # ── Step 6: Header hard-signal bonus ─────────────────────────────────────
    hf = extract_header_features(parsed)
    header_bonus = 0.0
    if hf["reply_to_mismatch"]:          header_bonus += 0.05
    if hf["spf_fail"]:                   header_bonus += 0.04
    if hf["dkim_fail"]:                  header_bonus += 0.03
    if hf["dmarc_fail"]:                 header_bonus += 0.04
    if hf["display_name_impersonation"]: header_bonus += 0.04
    if hf["lookalike_score"] >= 0.8:     header_bonus += 0.05

    final_prob   = min(raw_ensemble + header_bonus, 1.0)
    fraud_score  = int(round(final_prob * 100))
    threat_level = _score_to_threat_level(fraud_score, nlp_label)

    # ── Step 7: SHAP feature contributions ───────────────────────────────────
    shap_contributions = _get_shap_contributions(vec)

    # ── Step 8: Build threat indicators for UI ────────────────────────────────
    threat_indicators = _build_threat_indicators(parsed, hf, text)
    bec_patterns      = _detect_bec_patterns(parsed, text)
    header_anomalies  = _detect_header_anomalies(parsed, hf)

    # ── Step 9: Authentication status (from parsed headers) ──────────────────
    authentication = _parse_auth_results(parsed)

    # ── Step 10: Relay path ───────────────────────────────────────────────────
    relay_path = _parse_relay_path(parsed)

    # ── Step 11: Domain intel ─────────────────────────────────────────────────
    domain_intel = _build_domain_intel(parsed, hf)

    # ── Step 12: Attribution assessment ──────────────────────────────────────
    attribution = _build_attribution(fraud_score, hf, relay_path)

    # ── Step 13: Classification label ─────────────────────────────────────────
    classification = _classify(threat_level, hf, bec_patterns, text, nlp_label)

    # ── Step 14: Originating IP from relay path ────────────────────────────────
    originating_ip = _extract_originating_ip(parsed)

    # ── Step 15: Recommendations ──────────────────────────────────────────────
    recommendations = _build_recommendations(threat_level, hf, fraud_score)

    return {
        # Core classification
        "threat_level":    threat_level,
        "fraud_score":     fraud_score,
        "classification":  classification,
        # Human-readable (will be enriched by Gemini if available)
        "summary":         _build_summary(fraud_score, threat_level, classification, threat_indicators),
        # Indicators
        "threat_indicators":  threat_indicators,
        "bec_patterns":       bec_patterns,
        "header_anomalies":   header_anomalies,
        # Auth
        "authentication":     authentication,
        # Forensics
        "relay_path":         relay_path,
        "originating_ip":     originating_ip,
        "domain_intel":       domain_intel,
        "attribution":        attribution,
        "recommendations":    recommendations,
        # ML internals (shown in detailed forensic report)
        "ml_scores": {
            "nlp_score":        round(nlp_threat_prob * 100),
            "structured_score": round(xgb_threat_prob * 100),
            "anomaly_score":    round(anomaly_prob * 100),
            "header_bonus_pts": round(header_bonus * 100),
            "nlp_label":        nlp_label,
            "ensemble_weights": {
                "nlp":        0.40,
                "structured": 0.35,
                "anomaly":    0.15,
                "header":     round(header_bonus, 3),
            },
        },
        "shap_contributions": shap_contributions,
    }


# ── Helper builders ───────────────────────────────────────────────────────────

def _build_threat_indicators(parsed: dict, hf: dict, text: str) -> list[str]:
    indicators = []
    t = text.lower()

    if hf["reply_to_mismatch"]:
        indicators.append(f"Reply-To address differs from sender domain (Reply-To: {parsed.get('reply_to','')})")
    if hf["return_path_mismatch"]:
        indicators.append("Return-Path domain does not match From domain")
    if hf["display_name_impersonation"]:
        indicators.append(f"Display name '{parsed.get('sender_display_name','')}' impersonates a known brand")
    if hf["lookalike_score"] >= 0.8:
        indicators.append(f"Sender domain is a lookalike of a known brand (score: {hf['lookalike_score']:.0%})")
    if hf["spf_fail"]:
        indicators.append("SPF authentication failed — email may not be from claimed domain")
    if hf["dkim_fail"]:
        indicators.append("DKIM signature invalid — message may have been tampered with")
    if hf["dmarc_fail"]:
        indicators.append("DMARC policy check failed")
    if "urgent" in t or "immediately" in t:
        indicators.append("Urgency language detected (pressure tactics)")
    if re.search(r"https?://\d+\.\d+\.\d+\.\d+", t):
        indicators.append("URL with raw IP address instead of domain name")
    if "password" in t or "verify your account" in t:
        indicators.append("Credential harvesting language detected")

    return indicators


def _detect_bec_patterns(parsed: dict, text: str) -> list[str]:
    patterns = []
    t = text.lower()
    if "do not call" in t or "unavailable" in t:
        patterns.append("Sender claims to be unavailable — prevents phone verification (classic BEC)")
    if "wire transfer" in t or "process payment" in t:
        patterns.append("Urgent payment/wire transfer request")
    if "new bank account" in t or "change of bank" in t or "updated banking" in t:
        patterns.append("Request to update banking/payment details")
    if "invoice" in t and ("urgent" in t or "immediately" in t):
        patterns.append("Urgent invoice payment request (BEC financial fraud pattern)")
    if "keep this confidential" in t or "do not discuss" in t:
        patterns.append("Request for secrecy — typical social engineering pattern")
    return patterns


def _detect_header_anomalies(parsed: dict, hf: dict) -> list[str]:
    anomalies = []
    received = parsed.get("received_headers", []) or []

    if len(received) > 8:
        anomalies.append(f"Unusually long relay chain ({len(received)} hops) — may indicate relay abuse")
    if hf["reply_to_mismatch"]:
        anomalies.append("Reply-To/From domain mismatch in headers")
    if hf["return_path_mismatch"]:
        anomalies.append("Return-Path/From domain mismatch — envelope spoofing indicator")
    if not parsed.get("message_id"):
        anomalies.append("Missing Message-ID header — unusual for legitimate email")
    return anomalies


def _parse_auth_results(parsed: dict) -> dict:
    """Extract SPF/DKIM/DMARC from Authentication-Results header if present."""
    auth_raw = parsed.get("authentication_results", "") or ""
    # Also check received headers for auth info
    received = " ".join(parsed.get("received_headers", []) or [])
    combined = (auth_raw + " " + received).lower()

    def _check(proto):
        if f"{proto}=pass" in combined:  return "pass"
        if f"{proto}=fail" in combined:  return "fail"
        if f"{proto}=softfail" in combined: return "softfail"
        if f"{proto}=neutral" in combined:  return "neutral"
        return "none"

    spf   = _check("spf")
    dkim  = _check("dkim")
    dmarc = _check("dmarc")

    return {
        "spf":          spf,
        "dkim":         dkim,
        "dmarc":        dmarc,
        "spf_aligned":  spf == "pass",
        "dkim_aligned": dkim == "pass",
        "notes":        (
            "All authentication checks passed." if spf == dkim == dmarc == "pass"
            else "One or more authentication checks failed — sender may be spoofed."
            if "fail" in [spf, dkim, dmarc]
            else "Partial or missing authentication data."
        ),
    }


def _parse_relay_path(parsed: dict) -> list[dict]:
    """Parse Received headers into structured relay hops."""
    received = parsed.get("received_headers", []) or []
    hops = []
    for i, header in enumerate(received):
        # Match IPs in [brackets] or (parentheses)
        ip_match   = re.search(r"[\[\(](\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})[\]\)]", header)
        from_match = re.search(r"from\s+([\w.\-]+)", header, re.IGNORECASE)
        by_match   = re.search(r"by\s+([\w.\-]+)", header, re.IGNORECASE)
        ts_match   = re.search(r";\s*(.+)$", header)
        hops.append({
            "hop":       i + 1,
            "from":      from_match.group(1) if from_match else "",
            "by":        by_match.group(1)   if by_match   else "",
            "ip":        ip_match.group(1)   if ip_match   else "",
            "timestamp": ts_match.group(1).strip() if ts_match else "",
        })
    return hops


def _extract_originating_ip(parsed: dict) -> str:
    """Extract the first untrusted external IP from Received headers.
    Handles both [brackets] and (parentheses) formats used by different MTAs.
    """
    received = parsed.get("received_headers", []) or []
    PRIVATE = re.compile(
        r"^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|::1)"
    )
    # Match IPs in either [x.x.x.x] or (x.x.x.x) format
    IP_PATTERN = re.compile(r"[\[\(](\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})[\]\)]")

    for header in reversed(received):  # oldest hop = most external = first
        for m in IP_PATTERN.finditer(header):
            ip = m.group(1)
            if not PRIVATE.match(ip):
                return ip
    return ""


def _build_domain_intel(parsed: dict, hf: dict) -> dict:
    sender_email = parsed.get("sender_email", "") or ""
    m = re.search(r"@([\w.\-]+)", sender_email)
    domain = m.group(1) if m else ""

    reply_to   = parsed.get("reply_to", "") or ""
    m2 = re.search(r"@([\w.\-]+)", reply_to)
    reply_domain = m2.group(1) if m2 else None

    return {
        "sender_domain":    domain,
        "display_name":     parsed.get("sender_display_name"),
        "reply_to_domain":  reply_domain if reply_domain != domain else None,
        "lookalike_risk":   hf["lookalike_score"] >= 0.5,
        "lookalike_score":  round(hf["lookalike_score"], 2),
        "notes":            (
            f"Domain '{domain}' resembles a known brand (lookalike risk: {hf['lookalike_score']:.0%})"
            if hf["lookalike_score"] >= 0.5 else None
        ),
    }


def _build_attribution(fraud_score: int, hf: dict, relay_path: list) -> dict:
    confidence = min(fraud_score, 80)  # never claim >80% attribution confidence

    if hf["spf_fail"] and hf["dkim_fail"]:
        origin_type = "spoofed_domain"
    elif hf["reply_to_mismatch"] and fraud_score >= 70:
        origin_type = "direct_actor"
    elif relay_path and len(relay_path) > 5:
        origin_type = "anonymized_infra"
    else:
        origin_type = "unknown"

    return {
        "confidence":         confidence,
        "likely_origin_type": origin_type,
        "assessment": (
            f"Based on header forensics and ML analysis, this email shows "
            f"characteristics of a {origin_type.replace('_',' ')} attack. "
            f"Attribution confidence is {confidence}%. "
            f"IP geolocation provides infrastructure-level indicators only — "
            f"not attacker identity."
        ),
    }


def _classify(threat_level: str, hf: dict, bec_patterns: list,
              text: str, nlp_label: str = "") -> str:
    """
    Produce a human-readable classification string.
    Uses the NLP model's label as the primary signal, with rule-based
    header forensics as confirmation evidence.
    """
    t = text.lower()

    # NLP model's multi-class label takes priority
    if nlp_label == "bec" or bec_patterns:
        return "Business Email Compromise (BEC) — financial fraud attempt"
    if nlp_label == "impersonation" or (
        hf["display_name_impersonation"] or hf["lookalike_score"] >= 0.8
    ):
        return "Brand / Executive Impersonation"
    if nlp_label == "phishing" or (
        "password" in t or "verify your account" in t or "click here" in t
    ):
        return "Credential Phishing"
    if nlp_label == "spam":
        return "Spam / Unsolicited commercial email"
    if threat_level == "fraud":
        return "Email Fraud — high-confidence malicious communication"
    if threat_level == "phishing":
        return "Phishing — deceptive email attempting to steal information"
    if threat_level in ("suspicious", "impersonation"):
        return "Suspicious Email — manual review recommended"
    return "Legitimate Email"


def _build_summary(score: int, level: str, classification: str,
                   indicators: list) -> str:
    if score < 40:
        return (
            f"This email appears legitimate with a fraud score of {score}/100. "
            f"No significant threat indicators were detected by the ML pipeline."
        )
    top_indicators = "; ".join(indicators[:2]) if indicators else "several anomalies"
    return (
        f"ML analysis flagged this email as {level} with a fraud score of {score}/100. "
        f"Classification: {classification}. "
        f"Key signals: {top_indicators}. "
        f"Full forensic details are available in the indicator and header sections below."
    )


def _build_recommendations(threat_level: str, hf: dict, score: int) -> list[str]:
    recs = []
    if score >= 70:
        recs.append("Do not click any links or open attachments in this email")
        recs.append("Report to your security team immediately")
    if hf["reply_to_mismatch"]:
        recs.append("Do not reply — Reply-To address is different from sender")
    if hf["spf_fail"] or hf["dkim_fail"]:
        recs.append("Verify sender identity through a separate trusted channel before responding")
    if score >= 50:
        recs.append("Block sender domain if confirmed malicious")
        recs.append("Search for similar emails from the same IP or domain in the case database")
    if score < 40:
        recs.append("Email appears safe — no action required")
    return recs