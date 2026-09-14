"""App settings router — GET /app/public-settings"""

from fastapi import APIRouter

router = APIRouter()

@router.get("/public-settings")
def public_settings():
    return {
        "name":    "Sentinel Email Forensics",
        "version": "1.0.0",
        "auth_providers": ["google", "email"],
    }