"""
Auth Service
------------
JWT creation / decoding, password hashing, current-user dependency,
and the in-memory database (swap for PostgreSQL / MongoDB in production).
"""

import os
import hashlib
import hmac
from datetime import datetime, timedelta

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

JWT_SECRET    = os.environ.get("JWT_SECRET", "change-me-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRES   = timedelta(days=30)

bearer_scheme = HTTPBearer(auto_error=False)

# ── In-memory store (replace with a real database) ────────────────────────────
DB: dict = {
    "users":         {},  # email → user dict
    "google_tokens": {},  # user_id → google access_token
    "watches":       {},  # user_id → {historyId, expiration}
    "cases":         {},  # case_id → case dict
    "alerts":        {},  # alert_id → alert dict
    "reset_tokens":  {},  # token_string → {email, expires}
}


# ── JWT ───────────────────────────────────────────────────────────────────────

def create_jwt(user: dict) -> str:
    payload = {
        "sub":   user["id"],
        "email": user["email"],
        "exp":   datetime.utcnow() + JWT_EXPIRES,
        "iat":   datetime.utcnow(),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_jwt(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])


# ── FastAPI dependency ────────────────────────────────────────────────────────

async def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    if not creds:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = decode_jwt(creds.credentials)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    email = payload.get("email")
    user  = DB["users"].get(email)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


# ── Password hashing (PBKDF2 — no extra deps) ─────────────────────────────────

_SALT = os.environ.get("PASSWORD_SALT", "sentinel-salt").encode()

def hash_password(password: str) -> str:
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), _SALT, 260_000)
    return dk.hex()

def verify_password(plain: str, hashed: str) -> bool:
    return hmac.compare_digest(hash_password(plain), hashed)