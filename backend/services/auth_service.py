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

# ── Persistent SQLite store ───────────────────────────────────────────────────
from services.database import db as _db

# Legacy shim — existing routers that do DB["cases"][id] still work via the
# DictProxy wrapper. New code should use `from services.database import db`.
class _DictProxy:
    """Makes db.cases behave like a plain dict for legacy callers."""
    def __init__(self, table): self._t = table
    def __getitem__(self, k):
        v = self._t.get(k)
        if v is None: raise KeyError(k)
        return v
    def __setitem__(self, k, v): self._t.set(k, v)
    def __contains__(self, k):   return self._t.get(k) is not None
    def get(self, k, default=None):
        v = self._t.get(k)
        return v if v is not None else default
    def values(self): return self._t.all()
    def items(self):
        return [(r.get("id") or r.get("email") or r.get("user_id"), r)
                for r in self._t.all()]

DB = {
    "users":         _DictProxy(_db.users),
    "google_tokens": _DictProxy(_db.google_tokens),
    "watches":       _DictProxy(_db.watches),
    "cases":         _DictProxy(_db.cases),
    "alerts":        _DictProxy(_db.alerts),
    "reset_tokens":  _DictProxy(_db.reset_tokens),
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