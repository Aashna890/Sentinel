"""
geo_service.py  —  Sentinel IP Geolocation
===========================================
Provides enrich_ip(ip) → dict with full geolocation + infrastructure flags.

Provider chain (falls through on failure / rate-limit):
  1. ip-api.com        — free, 45 req/min, no key needed
  2. ipinfo.io         — 50k/month free tier, set IPINFO_TOKEN env var
  3. ipwho.is          — free, no key, generous limits

TOR exit node check:
  Downloads the official Tor Project exit list (cached in memory for 1 hour)
  and cross-references the originating IP.

All network calls are async (httpx) and have a 10-second timeout.
If every provider fails, returns {} so the rest of the pipeline still runs.

Usage:
    from services.geo_service import enrich_ip

    geo = await enrich_ip("103.21.244.0")
"""

import os
import asyncio
import time
from datetime import datetime, timezone

import httpx

# ── Provider URLs ─────────────────────────────────────────────────────────────

_IPAPI_URL = (
    "http://ip-api.com/json/{ip}"
    "?fields=status,country,countryCode,regionName,city,"
    "isp,org,as,asname,proxy,hosting,mobile,lat,lon,query,reverse"
)

_IPINFO_TOKEN = os.environ.get("IPINFO_TOKEN", "")
_IPINFO_URL   = "https://ipinfo.io/{ip}/json"   # append ?token=... if key set

_IPWHO_URL    = "https://ipwho.is/{ip}"

# ── TOR exit node cache ───────────────────────────────────────────────────────
# Fetched from the official Tor Project bulk exit list.
# Refreshed at most once per hour to avoid hammering the endpoint.

_TOR_EXITS: set[str] = set()
_TOR_LAST_FETCH: float = 0.0
_TOR_TTL: float = 3600.0           # 1 hour
_TOR_URL = "https://check.torproject.org/torbulkexitlist"

# ── Private / loopback ranges (skip geolocation for these) ────────────────────
import re as _re
_PRIVATE = _re.compile(
    r"^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|::1|localhost)"
)

# ── Known datacenter ASN keywords (supplement provider 'hosting' flag) ────────
_DC_KEYWORDS = {
    "amazon", "aws", "google", "gcp", "azure", "microsoft",
    "digitalocean", "linode", "vultr", "hetzner", "ovh",
    "cloudflare", "fastly", "akamai", "choopa", "leaseweb",
    "servers.com", "hostinger", "contabo", "datacamp",
}


# ─────────────────────────────────────────────────────────────────────────────
# TOR exit node list
# ─────────────────────────────────────────────────────────────────────────────

async def _refresh_tor_exits() -> set[str]:
    """Download the Tor bulk exit list and return as a set of IPs."""
    global _TOR_EXITS, _TOR_LAST_FETCH
    now = time.monotonic()
    if now - _TOR_LAST_FETCH < _TOR_TTL and _TOR_EXITS:
        return _TOR_EXITS
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(_TOR_URL)
        if r.status_code == 200:
            exits = {line.strip() for line in r.text.splitlines()
                     if line.strip() and not line.startswith("#")}
            _TOR_EXITS      = exits
            _TOR_LAST_FETCH = now
            print(f"[Sentinel Geo] TOR exit list refreshed — {len(exits)} nodes")
    except Exception as exc:
        print(f"[Sentinel Geo] TOR list fetch failed (non-fatal): {exc}")
    return _TOR_EXITS


# ─────────────────────────────────────────────────────────────────────────────
# Provider implementations — each returns a normalised dict or raises
# ─────────────────────────────────────────────────────────────────────────────

async def _from_ipapi(ip: str, client: httpx.AsyncClient) -> dict:
    """ip-api.com — free, 45 req/min, no auth required."""
    r = await client.get(_IPAPI_URL.format(ip=ip))
    r.raise_for_status()
    d = r.json()
    if d.get("status") != "success":
        raise ValueError(f"ip-api non-success: {d.get('message')}")
    return {
        "provider":   "ip-api.com",
        "ip":         d.get("query", ip),
        "rdns":       d.get("reverse", ""),
        "country":    d.get("country", ""),
        "country_code": d.get("countryCode", ""),
        "region":     d.get("regionName", ""),
        "city":       d.get("city", ""),
        "lat":        d.get("lat"),
        "lon":        d.get("lon"),
        "isp":        d.get("isp", ""),
        "org":        d.get("org", ""),
        "asn":        d.get("as", ""),
        "asname":     d.get("asname", ""),
        "is_proxy":   bool(d.get("proxy", False)),
        "is_hosting": bool(d.get("hosting", False)),
        "is_mobile":  bool(d.get("mobile", False)),
    }


async def _from_ipinfo(ip: str, client: httpx.AsyncClient) -> dict:
    """ipinfo.io — 50k/month free, optional token via IPINFO_TOKEN."""
    url = _IPINFO_URL.format(ip=ip)
    if _IPINFO_TOKEN:
        url += f"?token={_IPINFO_TOKEN}"
    r = await client.get(url)
    r.raise_for_status()
    d = r.json()
    if "bogon" in d or "error" in d:
        raise ValueError(f"ipinfo error: {d}")

    # ipinfo returns "lat,lon" as a single "loc" string
    lat, lon = None, None
    if d.get("loc"):
        try:
            lat, lon = (float(x) for x in d["loc"].split(","))
        except Exception:
            pass

    # ipinfo puts ASN in org field as "AS12345 Company Name"
    org = d.get("org", "")
    asn, asname = "", org
    if org.upper().startswith("AS"):
        parts = org.split(" ", 1)
        asn    = parts[0]
        asname = parts[1] if len(parts) > 1 else org

    return {
        "provider":     "ipinfo.io",
        "ip":           d.get("ip", ip),
        "rdns":         d.get("hostname", ""),
        "country":      d.get("country", ""),
        "country_code": d.get("country", ""),
        "region":       d.get("region", ""),
        "city":         d.get("city", ""),
        "lat":          lat,
        "lon":          lon,
        "isp":          asname,
        "org":          org,
        "asn":          asn,
        "asname":       asname,
        "is_proxy":     False,   # ipinfo doesn't surface this in free tier
        "is_hosting":   False,
        "is_mobile":    False,
    }


async def _from_ipwho(ip: str, client: httpx.AsyncClient) -> dict:
    """ipwho.is — free, no key required, generous rate limits."""
    r = await client.get(_IPWHO_URL.format(ip=ip))
    r.raise_for_status()
    d = r.json()
    if not d.get("success", True):
        raise ValueError(f"ipwho.is error: {d.get('message')}")

    conn = d.get("connection", {})
    return {
        "provider":     "ipwho.is",
        "ip":           d.get("ip", ip),
        "rdns":         "",
        "country":      d.get("country", ""),
        "country_code": d.get("country_code", ""),
        "region":       d.get("region", ""),
        "city":         d.get("city", ""),
        "lat":          d.get("latitude"),
        "lon":          d.get("longitude"),
        "isp":          conn.get("isp", ""),
        "org":          conn.get("org", ""),
        "asn":          str(conn.get("asn", "")),
        "asname":       conn.get("isp", ""),
        "is_proxy":     False,
        "is_hosting":   False,
        "is_mobile":    False,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Post-processing: derive infrastructure flags not all providers return
# ─────────────────────────────────────────────────────────────────────────────

def _enrich_flags(geo: dict, tor_exits: set[str]) -> dict:
    """
    Augment provider data with:
      - is_tor      — IP is a known TOR exit node
      - is_datacenter — heuristic from ASN/org name keywords
      - infrastructure_type — human-readable summary tag
      - risk_flags  — list of active flag names for the UI
    """
    ip = geo.get("ip", "")
    geo["is_tor"] = ip in tor_exits

    # Datacenter heuristic — check org + asname + isp against known DC keywords
    combined = " ".join([
        geo.get("org", ""),
        geo.get("asname", ""),
        geo.get("isp", ""),
    ]).lower()
    geo["is_datacenter"] = (
        geo.get("is_hosting", False) or
        any(kw in combined for kw in _DC_KEYWORDS)
    )

    # Canonical infrastructure type
    if geo["is_tor"]:
        infra = "TOR Exit Node"
    elif geo.get("is_proxy"):
        infra = "Proxy / VPN"
    elif geo["is_datacenter"]:
        infra = "Datacenter / Hosting"
    elif geo.get("is_mobile"):
        infra = "Mobile Network"
    else:
        infra = "Residential ISP"

    geo["infrastructure_type"] = infra

    # Risk flags list — used by the frontend badge renderer
    flags = []
    if geo["is_tor"]:        flags.append("TOR")
    if geo.get("is_proxy"):  flags.append("Proxy/VPN")
    if geo["is_datacenter"]: flags.append("Datacenter")
    if geo.get("is_mobile"): flags.append("Mobile")
    geo["risk_flags"] = flags

    return geo


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

async def enrich_ip(ip: str) -> dict:
    """
    Main entry point.  Called by analysis_service.analyze_and_save().

    Returns a dict with all geolocation + infrastructure fields,
    or {} if the IP is private / empty / all providers fail.

    Fields returned:
        provider, ip, rdns, country, country_code, region, city,
        lat, lon, isp, org, asn, asname,
        is_proxy, is_hosting, is_mobile, is_tor, is_datacenter,
        infrastructure_type, risk_flags
    """
    if not ip or _PRIVATE.match(ip):
        return {}

    # Kick off TOR list refresh in background (non-blocking, result cached)
    tor_task = asyncio.create_task(_refresh_tor_exits())

    geo: dict = {}
    async with httpx.AsyncClient(timeout=10) as client:
        for provider_fn in (_from_ipapi, _from_ipinfo, _from_ipwho):
            try:
                geo = await provider_fn(ip, client)
                break                       # first success wins
            except Exception as exc:
                print(f"[Sentinel Geo] {provider_fn.__name__} failed for {ip}: {exc}")
                continue

    if not geo:
        print(f"[Sentinel Geo] All providers failed for {ip}")
        return {}

    # Wait for TOR check (should already be done by the time provider returns)
    tor_exits = await tor_task
    geo = _enrich_flags(geo, tor_exits)

    # Timestamp the enrichment
    geo["enriched_at"] = datetime.now(timezone.utc).isoformat()

    return geo