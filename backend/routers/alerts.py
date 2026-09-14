"""Alerts router — GET /alerts, PATCH /alerts/{id}/acknowledge"""

from fastapi import APIRouter, Depends, HTTPException, Query
from services.auth_service import get_current_user, DB

router = APIRouter()

@router.get("")
async def list_alerts(
    unacknowledged: bool = Query(False),
    user=Depends(get_current_user),
):
    alerts = [a for a in DB["alerts"].values() if a.get("user_id") == user["id"]]
    if unacknowledged:
        alerts = [a for a in alerts if not a.get("acknowledged")]
    return sorted(alerts, key=lambda a: a.get("created_date", ""), reverse=True)

@router.patch("/{alert_id}/acknowledge")
async def acknowledge(alert_id: str, user=Depends(get_current_user)):
    alert = DB["alerts"].get(alert_id)
    if not alert or alert.get("user_id") != user["id"]:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert["acknowledged"] = True
    return alert