"""
feature_extractor.py  —  Sentinel ML Feature Extraction
========================================================
Converts a parsed email dict (from parse_email()) into three
feature groups used by the three ML models at inference time.

Used by both train.py (training) and ml_models.py (inference).
"""

import re
import math
from urllib.parse import urlparse

import numpy as np

# ── Top-500 brand domains for lookalike detection ──────────────────────────
# Extend this list with any domain your org commonly receives mail from
KNOWN_BRANDS = {
    "google.com", "gmail.com", "microsoft.com", "outlook.com", "hotmail.com",
    "yahoo.com", "apple.com", "icloud.com", "amazon.com", "paypal.com",
    "facebook.com", "instagram.com", "twitter.com", "linkedin.com",
    "dropbox.com", "salesforce.com", "slack.com", "zoom.us",
    "netflix.com", "spotify.com", "adobe.com", "oracle.com", "sap.com",
    "hdfc.com", "icici.com", "sbi.co.in", "axisbank.com", "kotak.com",
    "hdfcbank.com", "icicib.com", "rbi.org.in", "incometax.gov.in",
    "irctc.co.in", "nsdl.co.in", "uidai.gov.in", "mca.gov.in",
}

# ── Keyword signal lists ───────────────────────────────────────────────────
URGENCY_WORDS = [
    "urgent", "immediately", "asap", "deadline", "expire", "suspend",
    "verify", "confirm", "alert", "warning", "final notice", "act now",
    "limited time", "24 hours", "48 hours", "account will be", "click here",
    "respond immediately", "action required", "last chance",
]
FINANCIAL_WORDS = [
    "invoice", "payment", "transfer", "bank account", "wire", "paypal",
    "bitcoin", "cryptocurrency", "refund", "credit card", "billing",
    "transaction", "fund", "₹", "$", "€", "remittance", "disbursement",
    "financial", "salary", "tax", "irs", "income tax",
]
CREDENTIAL_WORDS = [
    "password", "username", "login", "sign in", "verify your",
    "enter your", "account details", "credentials", "otp", "pin",
    "ssn", "social security", "date of birth", "mother's maiden",
    "security question", "two-factor", "authentication code",
]
IMPERSON_WORDS = [
    "ceo", "cfo", "coo", "director", "management", "hr department",
    "it department", "support team", "helpdesk", "noreply",
    "microsoft", "google", "apple", "amazon", "paypal", "bank",
    "government", "irs", "police", "interpol", "court",
]
BEC_WORDS = [
    "do not call", "unavailable", "confidential", "process payment",
    "new account", "change of bank", "updated banking", "approve",
    "kindly transfer", "attached invoice", "wire transfer",
    "do not discuss", "keep this between", "new vendor",
]
SOCIAL_ENG_WORDS = [
    "won", "winner", "prize", "lottery", "selected", "congratulations",
    "free", "gift", "lucky", "claim now", "exclusive offer",
    "you have been chosen", "million dollars", "inheritance",
]


def keyword_score(text_lower: str, words: list) -> float:
    """Fraction of keyword list matched, capped at 1.0."""
    hits = sum(1 for w in words if w in text_lower)
    return min(hits / max(len(words) * 0.25, 1), 1.0)


# ── Levenshtein distance ───────────────────────────────────────────────────

def levenshtein(s1: str, s2: str) -> int:
    if len(s1) < len(s2):
        return levenshtein(s2, s1)
    if not s2:
        return len(s1)
    prev = list(range(len(s2) + 1))
    for i, c1 in enumerate(s1):
        curr = [i + 1]
        for j, c2 in enumerate(s2):
            curr.append(min(prev[j + 1] + 1, curr[j] + 1,
                            prev[j] + (c1 != c2)))
        prev = curr
    return prev[-1]


def lookalike_score(domain: str) -> float:
    """
    0.0 = domain is a known brand (no lookalike risk)
    1.0 = highly suspicious lookalike

    Checks exact match first (0.0), then edit-distance ≤ 3 to any brand.
    """
    if not domain:
        return 0.0
    domain = domain.lower().split(":")[0]   # strip port
    if domain in KNOWN_BRANDS:
        return 0.0
    # Strip common subdomain prefixes for comparison
    bare = re.sub(r"^(mail|smtp|mx|webmail|login|secure|account)\.", "", domain)
    min_dist = min(levenshtein(bare, brand) for brand in KNOWN_BRANDS)
    # Distance 1-2 → very suspicious, 3 → moderately, >3 → not a lookalike
    if min_dist <= 1:
        return 1.0
    if min_dist == 2:
        return 0.8
    if min_dist == 3:
        return 0.5
    return 0.0


# ── URL feature extraction ─────────────────────────────────────────────────

def extract_url_features(text: str) -> dict:
    urls = re.findall(r"https?://[^\s\"'<>]+", text)
    if not urls:
        return {
            "url_count": 0, "has_http_only": 0, "has_ip_url": 0,
            "avg_url_length": 0.0, "max_subdomain_depth": 0,
            "sus_keyword_in_url": 0,
        }

    https_count = sum(1 for u in urls if u.startswith("https://"))
    ip_urls     = sum(1 for u in urls if re.search(r"https?://\d+\.\d+\.\d+\.\d+", u))

    lengths = []
    depths  = []
    sus_kw  = 0
    SUS_URL_KW = ["login", "verify", "account", "secure", "update",
                  "confirm", "banking", "payment", "reset", "click"]

    for u in urls:
        lengths.append(len(u))
        try:
            parsed = urlparse(u)
            depths.append(parsed.hostname.count(".") if parsed.hostname else 0)
            if any(k in u.lower() for k in SUS_URL_KW):
                sus_kw += 1
        except Exception:
            pass

    return {
        "url_count":          len(urls),
        "has_http_only":      int(https_count < len(urls)),
        "has_ip_url":         int(ip_urls > 0),
        "avg_url_length":     np.mean(lengths) if lengths else 0.0,
        "max_subdomain_depth":max(depths) if depths else 0,
        "sus_keyword_in_url": int(sus_kw > 0),
    }


# ── Header feature extraction ──────────────────────────────────────────────

def extract_header_features(parsed: dict) -> dict:
    """Extract structured features from parsed email headers."""

    sender_email = parsed.get("sender_email", "")
    reply_to     = parsed.get("reply_to", "") or ""
    return_path  = parsed.get("return_path", "") or ""
    received     = parsed.get("received_headers", []) or []
    display_name = parsed.get("sender_display_name", "") or ""

    # Extract domains
    def get_domain(addr):
        m = re.search(r"@([\w.\-]+)", addr)
        return m.group(1).lower() if m else ""

    from_domain    = get_domain(sender_email)
    reply_domain   = get_domain(reply_to)
    rpath_domain   = get_domain(return_path)

    # Reply-To mismatch (most reliable BEC indicator)
    reply_mismatch = int(bool(reply_domain) and reply_domain != from_domain)

    # Return-Path mismatch
    rpath_mismatch = int(bool(rpath_domain) and rpath_domain != from_domain)

    # Display name impersonation: name contains a brand but domain doesn't match
    display_impersonation = 0
    if display_name:
        dn_lower = display_name.lower()
        for brand in ["microsoft", "google", "apple", "amazon", "paypal",
                      "facebook", "bank", "support", "security", "admin"]:
            if brand in dn_lower:
                # If display name contains brand but domain doesn't, suspicious
                if brand not in from_domain:
                    display_impersonation = 1
                    break

    # Received chain length (longer = more relay hops = more suspicious if external)
    relay_hops = len(received)

    # Auth signals — parse from Authentication-Results header if present
    auth_raw  = parsed.get("authentication_results", "") or ""
    spf_pass  = int("spf=pass"  in auth_raw.lower())
    dkim_pass = int("dkim=pass" in auth_raw.lower())
    dmarc_pass= int("dmarc=pass"in auth_raw.lower())
    spf_fail  = int("spf=fail"  in auth_raw.lower() or "spf=softfail" in auth_raw.lower())
    dkim_fail = int("dkim=fail" in auth_raw.lower())
    dmarc_fail= int("dmarc=fail"in auth_raw.lower())

    # Domain lookalike score
    lookalike = lookalike_score(from_domain)

    return {
        "reply_to_mismatch":      reply_mismatch,
        "return_path_mismatch":   rpath_mismatch,
        "display_name_impersonation": display_impersonation,
        "relay_hops":             relay_hops,
        "spf_pass":               spf_pass,
        "dkim_pass":              dkim_pass,
        "dmarc_pass":             dmarc_pass,
        "spf_fail":               spf_fail,
        "dkim_fail":              dkim_fail,
        "dmarc_fail":             dmarc_fail,
        "lookalike_score":        lookalike,
    }


# ── Combined structured feature vector (for XGBoost + IsolationForest) ────

STRUCTURED_FEATURE_NAMES = [
    # NLP keyword scores (5)
    "urgency", "financial", "credential", "impersonation", "bec",
    # Text statistics (3)
    "caps_ratio", "punct_density", "social_engineering",
    # URL features (6)
    "url_count_norm", "has_http_only", "has_ip_url",
    "avg_url_length_norm", "sus_keyword_in_url", "max_subdomain_depth_norm",
    # Header features (11)
    "reply_to_mismatch", "return_path_mismatch", "display_name_impersonation",
    "relay_hops_norm", "spf_pass", "dkim_pass", "dmarc_pass",
    "spf_fail", "dkim_fail", "dmarc_fail", "lookalike_score",
]   # Total: 25 features


def build_feature_vector(text: str, parsed: dict) -> np.ndarray:
    """
    Build the full 25-dimensional feature vector for a single email.
    Used at both training and inference time.

    Args:
        text:   Subject + body combined string
        parsed: Output of parse_email()

    Returns:
        np.ndarray of shape (25,), dtype float32
    """
    t = text.lower()

    # ── NLP keyword scores ────────────────────────────────────────────────
    urgency       = keyword_score(t, URGENCY_WORDS)
    financial     = keyword_score(t, FINANCIAL_WORDS)
    credential    = keyword_score(t, CREDENTIAL_WORDS)
    impersonation = keyword_score(t, IMPERSON_WORDS)
    bec           = keyword_score(t, BEC_WORDS)
    social_eng    = keyword_score(t, SOCIAL_ENG_WORDS)

    # ── Text statistics ───────────────────────────────────────────────────
    caps_ratio    = sum(1 for c in text if c.isupper()) / max(len(text), 1)
    punct_density = sum(1 for c in text if c in "!?$#@") / max(len(text), 1) * 50

    # ── URL features ──────────────────────────────────────────────────────
    url_feats = extract_url_features(text)
    url_count_norm       = min(url_feats["url_count"] / 10, 1.0)
    has_http_only        = float(url_feats["has_http_only"])
    has_ip_url           = float(url_feats["has_ip_url"])
    avg_url_len_norm     = min(url_feats["avg_url_length"] / 200, 1.0)
    sus_kw_url           = float(url_feats["sus_keyword_in_url"])
    max_subdomain_norm   = min(url_feats["max_subdomain_depth"] / 5, 1.0)

    # ── Header features ───────────────────────────────────────────────────
    hf = extract_header_features(parsed)

    vec = np.array([
        urgency, financial, credential, impersonation, bec,
        caps_ratio, punct_density, social_eng,
        url_count_norm, has_http_only, has_ip_url,
        avg_url_len_norm, sus_kw_url, max_subdomain_norm,
        float(hf["reply_to_mismatch"]),
        float(hf["return_path_mismatch"]),
        float(hf["display_name_impersonation"]),
        min(hf["relay_hops"] / 10, 1.0),
        float(hf["spf_pass"]),
        float(hf["dkim_pass"]),
        float(hf["dmarc_pass"]),
        float(hf["spf_fail"]),
        float(hf["dkim_fail"]),
        float(hf["dmarc_fail"]),
        float(hf["lookalike_score"]),
    ], dtype=np.float32)

    return vec
