"""Cases router — GET /cases, GET /cases/{id}, PATCH /cases/{id}"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from services.auth_service import get_current_user, DB

router = APIRouter()

class StatusUpdate(BaseModel):
    status: str

@router.get("")
async def list_cases(user=Depends(get_current_user)):
    cases = [c for c in DB["cases"].values() if c.get("user_id") == user["id"]]
    return sorted(cases, key=lambda c: c.get("created_date", ""), reverse=True)

@router.get("/{case_id}")
async def get_case(case_id: str, user=Depends(get_current_user)):
    case = DB["cases"].get(case_id)
    if not case or case.get("user_id") != user["id"]:
        raise HTTPException(status_code=404, detail="Case not found")
    return case

@router.patch("/{case_id}")
async def update_case(case_id: str, body: StatusUpdate, user=Depends(get_current_user)):
    case = DB["cases"].get(case_id)
    if not case or case.get("user_id") != user["id"]:
        raise HTTPException(status_code=404, detail="Case not found")
    case["status"] = body.status
    return case