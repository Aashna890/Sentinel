"""
domain_intel_service.py  —  Sentinel Domain Intelligence
=========================================================
Provides enrich_domain(domain) → dict with:

  WHOIS data   — registrar, creation/expiry date, registrant country,
                 name servers, domain age in days
  DNS records  — A, MX, TXT (SPF), NS records via dnspython
  Risk signals — newly registered domain, missing MX, suspicious TLD,
                 disposable domain, free webmail, domain age risk score

Both python-whois and dnspython are already in requirements.txt.
All operations are synchronous (run in executor via analysis_service).

Usage (from async context):
    import asyncio
    from services.domain_intel_service import enrich_domain

    # Run the blocking calls in a thread pool so they don't block the event loop
    loop   = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, enrich_domain, "micros0ft-support.com")
"""

import re
import socket
from datetime import datetime, timezone, timedelta
from typing import Optional

# ── Optional imports — degrade gracefully if not installed ───────────────────
try:
    import whois as _whois          # python-whois
    _WHOIS_OK = True
except ImportError:
    _WHOIS_OK = False

try:
    import dns.resolver as _dns     # dnspython
    import dns.exception
    _DNS_OK = True
except ImportError:
    _DNS_OK = False


# ── Suspicious TLD list (common in phishing campaigns) ───────────────────────
_SUSPICIOUS_TLDS = {
    ".tk", ".ml", ".ga", ".cf", ".gq",          # Freenom free TLDs
    ".xyz", ".top", ".club", ".online", ".site",
    ".work", ".click", ".link", ".loan", ".win",
    ".download", ".stream", ".gdn", ".racing",
}

# ── Disposable / throwaway email domain indicators ───────────────────────────
_DISPOSABLE_KEYWORDS = {
    "tempmail", "guerrilla", "mailinator", "throwam", "yopmail",
    "discard", "sharklasers", "trashmail", "fakeinbox", "spamgourmet",
    "maildrop", "getairmail", "mailnull", "spamspot", "dispostable",
}

# ── Free webmail providers (not suspicious alone, but noted) ─────────────────
_WEBMAIL_DOMAINS = {
    "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "live.com",
    "aol.com", "protonmail.com", "icloud.com", "me.com", "mac.com",
    "zoho.com", "yandex.com", "mail.com", "gmx.com", "inbox.com",
}

# ── Known brand domains (should never appear as senders for other orgs) ──────
_BRAND_DOMAINS = {
    "microsoft.com", "google.com", "apple.com", "amazon.com", "paypal.com",
    "facebook.com", "instagram.com", "twitter.com", "linkedin.com",
    "netflix.com", "dropbox.com", "salesforce.com", "adobe.com",
    "hdfc.com", "icici.com", "sbi.co.in", "axisbank.com",
}


# ─────────────────────────────────────────────────────────────────────────────
# WHOIS lookup
# ─────────────────────────────────────────────────────────────────────────────

def _run_whois(domain: str) -> dict:
    """
    Run a WHOIS lookup and return normalised data.
    Returns {} on any error so the rest of the pipeline is unaffected.
    """
    if not _WHOIS_OK:
        return {"whois_error": "python-whois not installed"}

    try:
        w = _whois.whois(domain)
    except Exception as exc:
        return {"whois_error": str(exc)[:120]}

    if not w or not w.domain_name:
        return {"whois_error": "No WHOIS record found"}

    # Normalise creation/expiry dates — python-whois can return a list or single value
    def _first_date(val) -> Optional[datetime]:
        if val is None:
            return None
        if isinstance(val, list):
            val = val[0]
        if isinstance(val, datetime):
            # Make timezone-aware if naive
            if val.tzinfo is None:
                val = val.replace(tzinfo=timezone.utc)
            return val
        return None

    created = _first_date(w.creation_date)
    expiry  = _first_date(w.expiration_date)
    updated = _first_date(w.updated_date)

    # Domain age in days (from creation to now)
    age_days: Optional[int] = None
    if created:
        delta    = datetime.now(timezone.utc) - created
        age_days = delta.days

    # Name servers — normalise to list of lowercase strings
    ns = w.name_servers or []
    if isinstance(ns, str):
        ns = [ns]
    name_servers = sorted({n.lower().rstrip(".") for n in ns if n})

    # Registrant country — may be None for privacy-protected domains
    registrant_country = (
        getattr(w, "country", None) or
        getattr(w, "registrant_country", None)
    )
    if isinstance(registrant_country, list):
        registrant_country = registrant_country[0]

    return {
        "registrar":          w.registrar or "",
        "created":            created.strftime("%Y-%m-%d") if created else "",
        "expiry":             expiry.strftime("%Y-%m-%d")  if expiry  else "",
        "updated":            updated.strftime("%Y-%m-%d") if updated else "",
        "age_days":           age_days,
        "registrant_country": registrant_country or "",
        "name_servers":       name_servers[:6],   # cap to 6 for storage
        "privacy_protected":  bool(
            "privacy" in str(w.registrar or "").lower() or
            "redacted" in str(getattr(w, "name", "") or "").lower()
        ),
        "whois_error":        "",
    }


# ─────────────────────────────────────────────────────────────────────────────
# DNS lookups
# ─────────────────────────────────────────────────────────────────────────────

_DNS_TIMEOUT = 5.0      # seconds per query

def _query_dns(domain: str, rtype: str) -> list[str]:
    """Return a list of string answers for a DNS record type, or []."""
    if not _DNS_OK:
        return []
    try:
        resolver = _dns.Resolver()
        resolver.lifetime = _DNS_TIMEOUT
        answers = resolver.resolve(domain, rtype)
        return [str(r) for r in answers]
    except (dns.exception.DNSException, Exception):
        return []


def _run_dns(domain: str) -> dict:
    """
    Resolve A, MX, NS, and TXT records for the domain.
    TXT records are scanned for SPF policy.
    Returns {} on total failure.
    """
    a_records  = _query_dns(domain, "A")
    mx_raw     = _query_dns(domain, "MX")
    ns_records = _query_dns(domain, "NS")
    txt_records= _query_dns(domain, "TXT")

    # Parse MX records into (priority, hostname) tuples, sorted by priority
    mx_records = []
    for rec in mx_raw:
        parts = rec.split()
        if len(parts) >= 2:
            try:
                prio = int(parts[0])
                host = parts[1].lower().rstrip(".")
                mx_records.append(f"{prio} {host}")
            except ValueError:
                mx_records.append(rec)

    # Find SPF record in TXT answers
    spf_record = next(
        (t.strip('"') for t in txt_records if "v=spf1" in t.lower()),
        ""
    )

    # Reverse-DNS of the first A record
    rdns = ""
    if a_records:
        try:
            rdns = socket.gethostbyaddr(a_records[0])[0]
        except Exception:
            pass

    return {
        "a_records":   a_records[:4],
        "mx_records":  mx_records[:8],
        "ns_records":  [ns.rstrip(".") for ns in ns_records[:4]],
        "txt_records": txt_records[:6],
        "spf_record":  spf_record,
        "rdns":        rdns,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Risk signal derivation
# ─────────────────────────────────────────────────────────────────────────────

def _derive_risk(domain: str, whois_data: dict, dns_data: dict) -> dict:
    """
    Compute risk signals that are not available from a single provider.
    Returns a dict of boolean flags + a risk_score (0-100) + notes list.
    """
    notes: list[str] = []
    risk  = 0

    tld = "." + domain.rsplit(".", 1)[-1].lower() if "." in domain else ""

    # ── Newly registered domain (< 30 days) ──────────────────────────────────
    age_days        = whois_data.get("age_days")
    is_new_domain   = age_days is not None and age_days < 30
    is_young_domain = age_days is not None and 30 <= age_days < 180

    if is_new_domain:
        risk += 40
        notes.append(f"Domain registered only {age_days} days ago — very high risk indicator")
    elif is_young_domain:
        risk += 20
        notes.append(f"Domain is {age_days} days old — relatively new")

    # ── Suspicious TLD ────────────────────────────────────────────────────────
    is_suspicious_tld = tld in _SUSPICIOUS_TLDS
    if is_suspicious_tld:
        risk += 15
        notes.append(f"TLD '{tld}' is commonly used in phishing campaigns")

    # ── No MX records (can't receive email — suspicious for an email sender) ──
    has_no_mx = not dns_data.get("mx_records")
    if has_no_mx:
        risk += 10
        notes.append("No MX records found — domain cannot receive email replies")

    # ── No SPF record ─────────────────────────────────────────────────────────
    has_no_spf = not dns_data.get("spf_record")
    if has_no_spf:
        risk += 10
        notes.append("No SPF record — sender authentication cannot be verified")

    # ── Disposable email provider ─────────────────────────────────────────────
    domain_lower = domain.lower()
    is_disposable = any(kw in domain_lower for kw in _DISPOSABLE_KEYWORDS)
    if is_disposable:
        risk += 30
        notes.append("Domain matches known disposable/throwaway email provider")

    # ── Free webmail provider ─────────────────────────────────────────────────
    is_webmail = domain_lower in _WEBMAIL_DOMAINS
    if is_webmail:
        notes.append("Sender is using a free webmail provider (not necessarily malicious)")

    # ── Privacy-protected registration ───────────────────────────────────────
    if whois_data.get("privacy_protected"):
        risk += 5
        notes.append("WHOIS registration is privacy-protected")

    # ── Impersonating a known brand ───────────────────────────────────────────
    is_brand_impersonation = False
    for brand_domain in _BRAND_DOMAINS:
        brand_name = brand_domain.split(".")[0]
        if brand_name in domain_lower and domain_lower != brand_domain:
            is_brand_impersonation = True
            risk += 25
            notes.append(f"Domain name contains '{brand_name}' but is NOT the official {brand_domain}")
            break

    risk = min(risk, 100)

    return {
        "is_new_domain":           is_new_domain,
        "is_young_domain":         is_young_domain,
        "is_suspicious_tld":       is_suspicious_tld,
        "has_no_mx":               has_no_mx,
        "has_no_spf":              has_no_spf,
        "is_disposable":           is_disposable,
        "is_webmail":              is_webmail,
        "is_brand_impersonation":  is_brand_impersonation,
        "domain_risk_score":       risk,
        "risk_notes":              notes,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def enrich_domain(domain: str) -> dict:
    """
    Main entry point.  Run in a thread pool from async context:

        result = await loop.run_in_executor(None, enrich_domain, domain)

    Returns a merged dict with WHOIS + DNS + risk signal fields,
    plus the original fields already in _build_domain_intel() so the
    caller can replace it entirely.

    All errors are caught internally — returns partial data on failure.
    """
    if not domain:
        return {}

    domain = domain.lower().strip().rstrip(".")

    # Skip obvious internal / test domains
    if domain in ("localhost", "example.com", "test.com"):
        return {"sender_domain": domain, "notes": "Internal/test domain — skipped"}

    # ── Run WHOIS and DNS in sequence (both are blocking I/O) ────────────────
    whois_data = _run_whois(domain)
    dns_data   = _run_dns(domain)
    risk_data  = _derive_risk(domain, whois_data, dns_data)

    # ── Build the primary notes string for the UI ─────────────────────────────
    # Consolidate risk notes + whois error into a single readable note
    ui_notes = risk_data.get("risk_notes", [])
    if whois_data.get("whois_error"):
        ui_notes = [f"WHOIS lookup: {whois_data['whois_error']}"] + ui_notes

    return {
        # ── Fields already expected by CaseDetail.jsx ─────────────────────────
        "sender_domain":    domain,
        "registrar":        whois_data.get("registrar", ""),
        "created":          whois_data.get("created", ""),
        "expiry":           whois_data.get("expiry", ""),
        "age_days":         whois_data.get("age_days"),
        "mx_records":       dns_data.get("mx_records", []),
        "ns_records":       dns_data.get("ns_records", []),
        "spf_record":       dns_data.get("spf_record", ""),
        "a_records":        dns_data.get("a_records", []),
        "rdns":             dns_data.get("rdns", ""),
        "registrant_country": whois_data.get("registrant_country", ""),
        "privacy_protected":  whois_data.get("privacy_protected", False),
        "name_servers":       whois_data.get("name_servers", []),
        "notes":              "; ".join(ui_notes) if ui_notes else None,

        # ── Extended risk intelligence ─────────────────────────────────────────
        "lookalike_risk":          None,    # filled by ml_models._build_domain_intel
        "lookalike_score":         None,    # filled by ml_models._build_domain_intel
        "is_new_domain":           risk_data.get("is_new_domain", False),
        "is_young_domain":         risk_data.get("is_young_domain", False),
        "is_suspicious_tld":       risk_data.get("is_suspicious_tld", False),
        "has_no_mx":               risk_data.get("has_no_mx", False),
        "has_no_spf":              risk_data.get("has_no_spf", False),
        "is_disposable":           risk_data.get("is_disposable", False),
        "is_webmail":              risk_data.get("is_webmail", False),
        "is_brand_impersonation":  risk_data.get("is_brand_impersonation", False),
        "domain_risk_score":       risk_data.get("domain_risk_score", 0),
        "risk_notes":              risk_data.get("risk_notes", []),

        # ── Raw DNS for deep forensics ──────────────────────────────────────────
        "txt_records":    dns_data.get("txt_records", []),
        "whois_error":    whois_data.get("whois_error", ""),
    }