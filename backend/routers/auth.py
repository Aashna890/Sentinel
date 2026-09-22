"""
Auth router
-----------
POST /auth/google             — Chrome extension: exchange Google token for Sentinel JWT
GET  /auth/google/redirect    — Web app: redirect to Google consent screen
GET  /auth/google/callback    — Web app: handle Google OAuth callback
POST /auth/login              — Email/password sign-in
POST /auth/register           — Email/password registration
POST /auth/forgot-password    — Send password reset email
POST /auth/reset-password     — Complete password reset
GET  /auth/me                 — Return the authenticated user
"""

import os
import uuid
import httpx
from urllib.parse import urlencode
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from services.auth_service import (
    create_jwt, decode_jwt, get_current_user,
    hash_password, verify_password,
    DB,
)

router = APIRouter()

# ── Google OAuth config ───────────────────────────────────────────────────────
GOOGLE_AUTH_URL      = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL     = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL  = "https://www.googleapis.com/oauth2/v3/userinfo"
GOOGLE_CLIENT_ID     = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
BACKEND_URL          = os.environ.get("BACKEND_URL",  "http://localhost:8000")
FRONTEND_URL         = os.environ.get("FRONTEND_URL", "http://localhost:5173")
JWT_SECRET           = os.environ.get("JWT_SECRET", "change-me-in-production")


# ── Pydantic models ───────────────────────────────────────────────────────────

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


# ── Chrome Extension: exchange Google token for Sentinel JWT ──────────────────

@router.post("/google")
async def google_auth(body: GoogleTokenRequest):
    """
    Used by the Chrome extension only.
    Accepts the Google OAuth access token from chrome.identity.getAuthToken(),
    fetches user profile from Google, upserts user, returns Sentinel JWT.
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

    user = DB["users"].get(email)
    if not user:
        user = {
            "id":         str(uuid.uuid4()),
            "email":      email,
            "full_name":  profile.get("name", ""),
            "avatar":     profile.get("picture", ""),
            "provider":   "google",
            "created_at": datetime.utcnow().isoformat(),
        }
        DB["users"][email] = user

    # Store Google token so backend can call Gmail API on their behalf
    DB["google_tokens"][user["id"]] = body.google_token

    token = create_jwt(user)
    return {"token": token, "user": _safe(user)}


# ── Web App: Google OAuth redirect flow ───────────────────────────────────────

@router.get("/google/redirect")
def google_redirect(returnTo: str = "/dashboard"):
    """Step 1 — redirect browser to Google consent screen."""
    params = {
        "client_id":     GOOGLE_CLIENT_ID,
        "redirect_uri":  f"{BACKEND_URL}/api/auth/google/callback",
        "response_type": "code",
        "scope":         "openid email profile",
        "access_type":   "offline",
        "state":         returnTo,
    }
    return RedirectResponse(f"{GOOGLE_AUTH_URL}?{urlencode(params)}")


@router.get("/google/callback")
async def google_callback(code: str, state: str = "/dashboard"):
    """Step 2 — Google redirects here with auth code; exchange for JWT."""
    async with httpx.AsyncClient() as client:
        token_res = await client.post(GOOGLE_TOKEN_URL, data={
            "code":          code,
            "client_id":     GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri":  f"{BACKEND_URL}/api/auth/google/callback",
            "grant_type":    "authorization_code",
        })
        tokens = token_res.json()

        if "access_token" not in tokens:
            print(f"[Sentinel] Google token error: {tokens}")
            raise HTTPException(status_code=400, detail="Google token exchange failed")

        profile_res = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )
        profile = profile_res.json()

    email = profile.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="No email in Google profile")

    user = DB["users"].get(email)
    if not user:
        user = {
            "id":         str(uuid.uuid4()),
            "email":      email,
            "full_name":  profile.get("name", ""),
            "avatar":     profile.get("picture", ""),
            "provider":   "google",
            "created_at": datetime.utcnow().isoformat(),
        }
        DB["users"][email] = user

    token = create_jwt(user)
    # Redirect to OAuthCallback.jsx which stores the token
    return RedirectResponse(
        f"{FRONTEND_URL}/auth/callback?token={token}&returnTo={state}"
    )


# ── Email / password ──────────────────────────────────────────────────────────

@router.post("/login")
async def login(body: LoginRequest):
    user = DB["users"].get(body.email)
    if not user or not verify_password(body.password, user.get("hashed_password", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return {"token": create_jwt(user), "user": _safe(user)}


@router.post("/register")
async def register(body: RegisterRequest):
    if DB["users"].get(body.email):
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
    user = DB["users"].get(body.email)
    if user:
        reset_token = str(uuid.uuid4())
        DB["reset_tokens"][reset_token] = {
            "email":   body.email,
            "expires": (datetime.utcnow() + timedelta(hours=1)).isoformat(),
        }
        # TODO: send email via SendGrid / SES
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
    DB["reset_tokens"].delete(body.token)
    return {"message": "Password updated"}


# ── Current user ──────────────────────────────────────────────────────────────

@router.get("/me")
async def me(user=Depends(get_current_user)):
    return _safe(user)


# ── Helper ────────────────────────────────────────────────────────────────────

def _safe(user: dict) -> dict:
    """Strip hashed_password before returning user object."""
    return {k: v for k, v in user.items() if k != "hashed_password"}