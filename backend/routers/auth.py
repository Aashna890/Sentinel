"""
Auth router
-----------
POST /auth/google          — Exchange a Google access token for a Sentinel JWT
POST /auth/login           — Email/password sign-in (fallback)
POST /auth/register        — Email/password registration
POST /auth/forgot-password — Send password reset email
POST /auth/reset-password  — Complete password reset
GET  /auth/me              — Return the authenticated user
"""

import os
import json
import uuid
from datetime import datetime, timedelta

import httpx
import jwt
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from services.auth_service import (
    create_jwt, decode_jwt, get_current_user,
    hash_password, verify_password,
    DB,          # simple in-memory dict — replace with your DB
)

router = APIRouter()

GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"
JWT_SECRET          = os.environ.get("JWT_SECRET", "change-me-in-production")


# ── Models ────────────────────────────────────────────────────────────────────

class GoogleTokenRequest(BaseModel):
    google_token: str

class LoginRequest(BaseModel):
    email: str
    password: str

class RegisterRequest(BaseModel):
    email: str
    password: str
    full_name: str = ""

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    password: str


# ── Google OAuth2 ─────────────────────────────────────────────────────────────

@router.post("/google")
async def google_auth(body: GoogleTokenRequest):
    """
    Accepts the Google OAuth access token that the Chrome extension
    obtained via chrome.identity.getAuthToken(), fetches the user's
    profile from Google, upserts a local user record, and returns a
    Sentinel JWT.
    """
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {body.google_token}"},
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Google token")

    profile = resp.json()
    email   = profile.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="No email in Google profile")

    # Upsert user in DB
    user = DB["users"].get(email)
    if not user:
        user = {
            "id":        str(uuid.uuid4()),
            "email":     email,
            "full_name": profile.get("name", ""),
            "avatar":    profile.get("picture", ""),
            "provider":  "google",
            "created_at": datetime.utcnow().isoformat(),
        }
        DB["users"][email] = user

    # Store their Google token so the backend can call Gmail API on their behalf
    DB["google_tokens"][user["id"]] = body.google_token

    token = create_jwt(user)
    return {"token": token, "user": user}


# ── Email / password ──────────────────────────────────────────────────────────

@router.post("/login")
async def login(body: LoginRequest):
    user = DB["users"].get(body.email)
    if not user or not verify_password(body.password, user.get("hashed_password", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return {"token": create_jwt(user), "user": _safe(user)}


@router.post("/register")
async def register(body: RegisterRequest):
    if body.email in DB["users"]:
        raise HTTPException(status_code=409, detail="Email already registered")
    user = {
        "id":              str(uuid.uuid4()),
        "email":           body.email,
        "full_name":       body.full_name,
        "hashed_password": hash_password(body.password),
        "provider":        "email",
        "created_at":      datetime.utcnow().isoformat(),
    }
    DB["users"][body.email] = user
    return {"token": create_jwt(user), "user": _safe(user)}


@router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordRequest):
    # Always return 200 to avoid email enumeration
    user = DB["users"].get(body.email)
    if user:
        reset_token = str(uuid.uuid4())
        DB["reset_tokens"][reset_token] = {
            "email":    body.email,
            "expires":  (datetime.utcnow() + timedelta(hours=1)).isoformat(),
        }
        # TODO: send reset_token via email (use SendGrid, SES, etc.)
        print(f"[DEV] Password reset token for {body.email}: {reset_token}")
    return {"message": "If that email exists, a reset link was sent."}


@router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest):
    record = DB["reset_tokens"].get(body.token)
    if not record:
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    if datetime.utcnow().isoformat() > record["expires"]:
        raise HTTPException(status_code=400, detail="Token expired")

    user = DB["users"].get(record["email"])
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user["hashed_password"] = hash_password(body.password)
    DB["reset_tokens"].pop(body.token)
    return {"message": "Password updated"}


@router.get("/me")
async def me(user=Depends(get_current_user)):
    return _safe(user)


def _safe(user: dict) -> dict:
    """Strip the hashed password before returning a user object."""
    return {k: v for k, v in user.items() if k != "hashed_password"}