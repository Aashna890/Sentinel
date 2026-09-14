"""
graph_service.py  —  Sentinel Graph Correlation Engine
=======================================================
Implements Stage 9 of the ML pipeline:

  Graph nodes:
    EmailCase  — every analysed email
    Domain     — sender / reply-to / URL domains
    IP         — originating IPs from relay chains
    URL        — extracted URLs
    Campaign   — DBSCAN cluster of related emails

  Graph edges:
    email  ──sent_from──▶  domain
    email  ──originated──▶ ip
    email  ──contains──▶   url
    domain ──resolves──▶   ip
    email  ──member_of──▶  campaign

Exposed API:
    build_graph(cases)            → nx.DiGraph
    correlate_case(case, cases)   → dict  (related IPs, domains, campaigns)
    detect_campaigns(cases)       → list[dict]
    get_graph_data(case_id)       → dict  (nodes + edges for frontend)

All functions are pure (no DB side-effects). The router calls them and
decides what to persist.
"""

from __future__ import annotations

import os
import re
from collections import defaultdict
from typing import Any

import numpy as np

# NetworkX — graph construction and analysis
try:
    import networkx as nx
    _NX_AVAILABLE = True
except ImportError:
    _NX_AVAILABLE = False
    print("[Sentinel Graph] networkx not installed — run: pip install networkx")

# sklearn DBSCAN — campaign clustering
try:
    from sklearn.cluster import DBSCAN
    from sklearn.preprocessing import StandardScaler
    _SKLEARN_AVAILABLE = True
except ImportError:
    _SKLEARN_AVAILABLE = False


# ── Constants (all env-configurable — no hardcoded thresholds) ────────────────

# Minimum fraud score to include an email as a threat node
THREAT_SCORE_THRESHOLD = int(os.environ.get("GRAPH_THREAT_THRESHOLD", "40"))

# DBSCAN params — tunable via env
DBSCAN_EPS         = float(os.environ.get("DBSCAN_EPS", "0.5"))
DBSCAN_MIN_SAMPLES = int(os.environ.get("DBSCAN_MIN_SAMPLES", "2"))


# ── Node type constants ────────────────────────────────────────────────────────

NODE_EMAIL    = "email"
NODE_DOMAIN   = "domain"
NODE_IP       = "ip"
NODE_URL      = "url"
NODE_CAMPAIGN = "campaign"

EDGE_SENT_FROM   = "sent_from"
EDGE_ORIGINATED  = "originated_from"
EDGE_CONTAINS    = "contains_url"
EDGE_RESOLVES    = "domain_resolves_to"
EDGE_MEMBER_OF   = "member_of_campaign"
EDGE_REPLY_TO    = "reply_to_domain"
EDGE_SHARED_INFRA= "shared_infrastructure"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _extract_urls(text: str) -> list[str]:
    return list(set(re.findall(r"https?://[^\s\"'<>]{4,}", text or "")))


def _domain_from_url(url: str) -> str:
    m = re.search(r"https?://([^/?\s]+)", url)
    return m.group(1).lower().split(":")[0] if m else ""


def _domain_from_email(addr: str) -> str:
    m = re.search(r"@([\w.\-]+)", addr or "")
    return m.group(1).lower() if m else ""


def _is_private_ip(ip: str) -> bool:
    return bool(re.match(
        r"^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|::1|$)", ip or ""
    ))


# ── Graph construction ────────────────────────────────────────────────────────

def build_graph(cases: list[dict]) -> "nx.DiGraph":
    """
    Build a directed property graph from a list of EmailCase dicts.
    Each case must have the structure saved by analysis_service.analyze_and_save().
    """
    if not _NX_AVAILABLE:
        raise RuntimeError("networkx is required: pip install networkx")

    G = nx.DiGraph()

    for case in cases:
        case_id     = case.get("id", "")
        fraud_score = case.get("fraud_score", 0)
        threat_lvl  = case.get("threat_level", "legitimate")
        subject     = case.get("subject", "(no subject)")
        sender      = case.get("sender_email", "")
        reply_to    = case.get("domain_intel", {}).get("reply_to_domain") or ""
        orig_ip     = case.get("originating_ip", "")
        body        = case.get("raw_email", "")

        # ── Email node ────────────────────────────────────────────────────────
        G.add_node(
            f"email:{case_id}",
            node_type    = NODE_EMAIL,
            label        = subject[:60],
            case_id      = case_id,
            fraud_score  = fraud_score,
            threat_level = threat_lvl,
            sender       = sender,
        )

        # ── Sender domain node + edge ─────────────────────────────────────────
        from_domain = _domain_from_email(sender)
        if from_domain:
            dn = f"domain:{from_domain}"
            if not G.has_node(dn):
                G.add_node(dn, node_type=NODE_DOMAIN, label=from_domain,
                           email_count=0, max_fraud_score=0)
            G.nodes[dn]["email_count"]     += 1
            G.nodes[dn]["max_fraud_score"]  = max(
                G.nodes[dn]["max_fraud_score"], fraud_score
            )
            G.add_edge(f"email:{case_id}", dn, edge_type=EDGE_SENT_FROM)

        # ── Reply-To domain node + edge ───────────────────────────────────────
        rt_domain = _domain_from_email(reply_to) if "@" in reply_to else reply_to
        if rt_domain and rt_domain != from_domain:
            rn = f"domain:{rt_domain}"
            if not G.has_node(rn):
                G.add_node(rn, node_type=NODE_DOMAIN, label=rt_domain,
                           email_count=0, max_fraud_score=0)
            G.add_edge(f"email:{case_id}", rn, edge_type=EDGE_REPLY_TO)

        # ── Originating IP node + edge ────────────────────────────────────────
        if orig_ip and not _is_private_ip(orig_ip):
            ipn = f"ip:{orig_ip}"
            geo = case.get("geolocation", {}) or {}
            if not G.has_node(ipn):
                G.add_node(ipn, node_type=NODE_IP, label=orig_ip,
                           country=geo.get("country", ""),
                           isp=geo.get("isp", ""),
                           is_proxy=geo.get("is_proxy", False),
                           is_hosting=geo.get("is_hosting", False),
                           email_count=0)
            G.nodes[ipn]["email_count"] += 1
            G.add_edge(f"email:{case_id}", ipn, edge_type=EDGE_ORIGINATED)

            # Domain → IP edge (if both exist)
            if from_domain:
                G.add_edge(f"domain:{from_domain}", ipn, edge_type=EDGE_RESOLVES)

        # ── URL nodes + edges ─────────────────────────────────────────────────
        urls = _extract_urls(body)
        for url in urls[:10]:          # cap at 10 URLs per email to keep graph manageable
            url_domain = _domain_from_url(url)
            un = f"url:{url[:100]}"    # truncate very long URLs
            if not G.has_node(un):
                G.add_node(un, node_type=NODE_URL, label=url[:80],
                           domain=url_domain)
            G.add_edge(f"email:{case_id}", un, edge_type=EDGE_CONTAINS)

            # URL domain → IP shared-infra edges
            if orig_ip and not _is_private_ip(orig_ip) and url_domain:
                ud = f"domain:{url_domain}"
                if not G.has_node(ud):
                    G.add_node(ud, node_type=NODE_DOMAIN, label=url_domain,
                               email_count=0, max_fraud_score=0)
                G.add_edge(ud, f"ip:{orig_ip}", edge_type=EDGE_SHARED_INFRA)

    return G


# ── Campaign detection (DBSCAN clustering) ────────────────────────────────────

def _case_to_feature_vector(case: dict) -> list[float]:
    """
    Convert an email case to a numeric feature vector for DBSCAN clustering.
    Features are chosen to cluster emails that share infrastructure/patterns,
    not just similar text (text similarity → NLP model's job).
    """
    from_domain = _domain_from_email(case.get("sender_email", ""))
    orig_ip     = case.get("originating_ip", "") or ""
    fraud_score = case.get("fraud_score", 0) / 100.0
    auth        = case.get("authentication", {}) or {}

    # Encode domain as a simple hash bucket (0-1 range)
    domain_hash = (hash(from_domain) % 10000) / 10000.0 if from_domain else 0.0
    ip_hash     = (hash(orig_ip)     % 10000) / 10000.0 if orig_ip     else 0.0

    spf_fail  = float(auth.get("spf",  "none") in ("fail", "softfail"))
    dkim_fail = float(auth.get("dkim", "none") == "fail")
    dmarc_fail= float(auth.get("dmarc","none") == "fail")

    url_count = min(
        len(_extract_urls(case.get("raw_email", ""))), 20
    ) / 20.0

    return [
        domain_hash, ip_hash, fraud_score,
        spf_fail, dkim_fail, dmarc_fail, url_count,
    ]


def detect_campaigns(cases: list[dict]) -> list[dict]:
    """
    Use DBSCAN to cluster related email cases into campaigns.
    Emails that share originating IP, sender domain patterns,
    and authentication failures are grouped together.

    Returns a list of campaign dicts:
      {
        "campaign_id": str,
        "case_ids":    [str, ...],
        "size":        int,
        "shared_ips":  [str, ...],
        "shared_domains": [str, ...],
        "max_fraud_score": int,
        "threat_levels":   {level: count},
        "label":       str,     ← human-readable campaign name
      }
    """
    if not _SKLEARN_AVAILABLE:
        print("[Sentinel Graph] sklearn not available for DBSCAN")
        return []

    threat_cases = [c for c in cases if c.get("fraud_score", 0) >= THREAT_SCORE_THRESHOLD]
    if len(threat_cases) < DBSCAN_MIN_SAMPLES:
        return []

    # Build feature matrix
    X = np.array([_case_to_feature_vector(c) for c in threat_cases], dtype=np.float32)

    # Scale features
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # DBSCAN — eps and min_samples configurable via env
    db = DBSCAN(eps=DBSCAN_EPS, min_samples=DBSCAN_MIN_SAMPLES, metric="euclidean")
    labels = db.fit_predict(X_scaled)

    # Group cases by cluster label (-1 = noise / unclustered)
    cluster_map: dict[int, list[dict]] = defaultdict(list)
    for case, label in zip(threat_cases, labels):
        if label >= 0:
            cluster_map[label].append(case)

    campaigns = []
    for cluster_id, cluster_cases in cluster_map.items():
        ips     = list({c.get("originating_ip","") for c in cluster_cases if c.get("originating_ip")})
        domains = list({_domain_from_email(c.get("sender_email","")) for c in cluster_cases
                        if _domain_from_email(c.get("sender_email",""))})
        scores  = [c.get("fraud_score", 0) for c in cluster_cases]
        levels  = defaultdict(int)
        for c in cluster_cases:
            levels[c.get("threat_level", "unknown")] += 1

        # Derive a human-readable label from the dominant pattern
        dominant_level = max(levels, key=levels.get)
        domain_sample  = domains[0] if domains else "unknown"
        campaign_label = f"{dominant_level.title()} campaign — {domain_sample}"

        campaigns.append({
            "campaign_id":      f"campaign-{cluster_id}",
            "case_ids":         [c["id"] for c in cluster_cases],
            "size":             len(cluster_cases),
            "shared_ips":       ips,
            "shared_domains":   domains,
            "max_fraud_score":  max(scores),
            "avg_fraud_score":  round(sum(scores) / len(scores)),
            "threat_levels":    dict(levels),
            "label":            campaign_label,
        })

    # Sort by size descending
    campaigns.sort(key=lambda c: c["size"], reverse=True)
    return campaigns


# ── Single-case correlation ───────────────────────────────────────────────────

def correlate_case(case: dict, all_cases: list[dict]) -> dict:
    """
    For a single case, find all related cases that share:
      - The same originating IP
      - The same sender domain
      - The same reply-to domain
      - Overlapping URLs

    Returns a correlation report used by the /api/graph/{case_id} endpoint.
    """
    case_id    = case.get("id", "")
    orig_ip    = case.get("originating_ip", "") or ""
    from_domain= _domain_from_email(case.get("sender_email", ""))
    rt_domain  = (case.get("domain_intel") or {}).get("reply_to_domain") or ""
    urls       = set(_extract_urls(case.get("raw_email", "")))
    url_domains= {_domain_from_url(u) for u in urls}

    related_by_ip:        list[dict] = []
    related_by_domain:    list[dict] = []
    related_by_url_domain:list[dict] = []

    for other in all_cases:
        if other.get("id") == case_id:
            continue

        other_ip     = other.get("originating_ip", "") or ""
        other_domain = _domain_from_email(other.get("sender_email", ""))
        other_rt     = (other.get("domain_intel") or {}).get("reply_to_domain") or ""
        other_urls   = set(_extract_urls(other.get("raw_email", "")))
        other_url_d  = {_domain_from_url(u) for u in other_urls}

        stub = {
            "id":           other.get("id"),
            "subject":      other.get("subject", ""),
            "sender":       other.get("sender_email", ""),
            "fraud_score":  other.get("fraud_score", 0),
            "threat_level": other.get("threat_level", ""),
            "created_date": other.get("created_date", ""),
        }

        if orig_ip and orig_ip == other_ip and not _is_private_ip(orig_ip):
            related_by_ip.append({**stub, "match": "shared_ip", "value": orig_ip})

        elif from_domain and from_domain == other_domain:
            related_by_domain.append({**stub, "match": "sender_domain", "value": from_domain})

        elif rt_domain and rt_domain in (other_domain, other_rt):
            related_by_domain.append({**stub, "match": "reply_to_domain", "value": rt_domain})

        elif url_domains & other_url_d:
            shared = list(url_domains & other_url_d)
            related_by_url_domain.append({**stub, "match": "shared_url_domain",
                                           "value": shared[0] if shared else ""})

    all_related = related_by_ip + related_by_domain + related_by_url_domain
    # Deduplicate by case id
    seen = set()
    unique_related = []
    for r in all_related:
        if r["id"] not in seen:
            seen.add(r["id"])
            unique_related.append(r)

    return {
        "case_id":               case_id,
        "related_count":         len(unique_related),
        "related_by_ip":         related_by_ip[:10],
        "related_by_domain":     related_by_domain[:10],
        "related_by_url_domain": related_by_url_domain[:10],
        "all_related":           unique_related[:20],
        "infrastructure": {
            "originating_ip":  orig_ip,
            "sender_domain":   from_domain,
            "reply_to_domain": rt_domain,
            "url_domains":     list(url_domains)[:10],
        },
    }


# ── Graph serialiser for frontend ─────────────────────────────────────────────

def get_graph_data(case_id: str, all_cases: list[dict]) -> dict:
    """
    Build a subgraph centred on case_id (depth=2) and serialise it to
    {nodes: [...], edges: [...]} for the frontend graph visualisation.

    Node shape:  { id, label, type, fraud_score?, country?, isp? }
    Edge shape:  { source, target, type }
    """
    if not _NX_AVAILABLE:
        return {"nodes": [], "edges": [], "error": "networkx not installed"}

    # Build the full graph from all cases
    G = build_graph(all_cases)

    target_node = f"email:{case_id}"
    if target_node not in G:
        return {"nodes": [], "edges": [], "campaigns": []}

    # Extract ego-graph (2 hops) around the target email
    ego = nx.ego_graph(G, target_node, radius=2, undirected=True)

    nodes = []
    for node_id, attrs in ego.nodes(data=True):
        node = {
            "id":        node_id,
            "label":     attrs.get("label", node_id),
            "type":      attrs.get("node_type", "unknown"),
        }
        if attrs.get("node_type") == NODE_EMAIL:
            node["fraud_score"]  = attrs.get("fraud_score", 0)
            node["threat_level"] = attrs.get("threat_level", "")
            node["is_focus"]     = node_id == target_node
        if attrs.get("node_type") == NODE_IP:
            node["country"]    = attrs.get("country", "")
            node["isp"]        = attrs.get("isp", "")
            node["is_proxy"]   = attrs.get("is_proxy", False)
            node["is_hosting"] = attrs.get("is_hosting", False)
        if attrs.get("node_type") == NODE_DOMAIN:
            node["email_count"]     = attrs.get("email_count", 0)
            node["max_fraud_score"] = attrs.get("max_fraud_score", 0)
        nodes.append(node)

    edges = [
        {
            "source": src,
            "target": tgt,
            "type":   data.get("edge_type", ""),
        }
        for src, tgt, data in ego.edges(data=True)
    ]

    # Run campaign detection on all cases and filter to relevant ones
    campaigns = detect_campaigns(all_cases)
    relevant_campaigns = [
        c for c in campaigns if case_id in c.get("case_ids", [])
    ]

    # Graph-level statistics
    stats = {
        "total_nodes":   ego.number_of_nodes(),
        "total_edges":   ego.number_of_edges(),
        "email_nodes":   sum(1 for _, d in ego.nodes(data=True) if d.get("node_type") == NODE_EMAIL),
        "domain_nodes":  sum(1 for _, d in ego.nodes(data=True) if d.get("node_type") == NODE_DOMAIN),
        "ip_nodes":      sum(1 for _, d in ego.nodes(data=True) if d.get("node_type") == NODE_IP),
        "url_nodes":     sum(1 for _, d in ego.nodes(data=True) if d.get("node_type") == NODE_URL),
    }

    return {
        "nodes":      nodes,
        "edges":      edges,
        "campaigns":  relevant_campaigns,
        "stats":      stats,
        "correlation":correlate_case(
            next((c for c in all_cases if c.get("id") == case_id), {}),
            all_cases,
        ),
    }