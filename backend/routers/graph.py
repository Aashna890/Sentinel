"""
Graph router
------------
GET  /api/graph/{case_id}          — Full subgraph + correlation for one case
GET  /api/graph/{case_id}/related  — Related cases only (lighter response)
GET  /api/graph/campaigns          — All detected campaigns across all cases
"""

from fastapi import APIRouter, Depends, HTTPException
from services.auth_service import get_current_user, DB
from services.graph_service import get_graph_data, correlate_case, detect_campaigns

router = APIRouter()


def _user_cases(user_id: str) -> list[dict]:
    """Return all cases belonging to this user."""
    return [c for c in DB["cases"].values() if c.get("user_id") == user_id]


@router.get("/{case_id}")
def graph_for_case(case_id: str, user=Depends(get_current_user)):
    """
    Full graph subgraph centred on this case (depth=2).
    Returns nodes, edges, campaigns, correlation report, and graph stats.
    Used by the frontend graph visualisation panel.
    """
    case = DB["cases"].get(case_id)
    if not case or case.get("user_id") != user["id"]:
        raise HTTPException(status_code=404, detail="Case not found")

    all_cases = _user_cases(user["id"])
    return get_graph_data(case_id, all_cases)


@router.get("/{case_id}/related")
def related_cases(case_id: str, user=Depends(get_current_user)):
    """
    Lightweight correlation report — related cases only, no full graph.
    Faster than the full graph endpoint; used by CaseDetail sidebar.
    """
    case = DB["cases"].get(case_id)
    if not case or case.get("user_id") != user["id"]:
        raise HTTPException(status_code=404, detail="Case not found")

    all_cases = _user_cases(user["id"])
    return correlate_case(case, all_cases)


@router.get("")
def all_campaigns(user=Depends(get_current_user)):
    """
    Detect and return all email campaigns across the user's case history.
    Used by the Campaigns page and the Dashboard threat-distribution chart.
    """
    all_cases = _user_cases(user["id"])
    campaigns = detect_campaigns(all_cases)
    return {
        "total_cases":    len(all_cases),
        "campaign_count": len(campaigns),
        "campaigns":      campaigns,
    }