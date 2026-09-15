"""
database.py  —  Sentinel Persistent Storage
============================================
Replaces the in-memory DB dict in auth_service.py with SQLite via
SQLAlchemy Core (no ORM — keeps it simple and dependency-light).

All tables are created on first run. The DB file lives at:
  backend/sentinel.db   (path configurable via DB_PATH env var)

Public API — mirrors the old DB dict so existing callers need
minimal changes:

    from services.database import db

    db.users.get(email)            → dict | None
    db.users.set(email, user)
    db.cases.get(case_id)          → dict | None
    db.cases.set(case_id, case)
    db.cases.all_for_user(user_id) → list[dict]
    db.alerts.get(alert_id)        → dict | None
    db.alerts.set(alert_id, alert)
    db.alerts.all_for_user(user_id)→ list[dict]
    db.alerts.update(alert_id, patch)
    db.google_tokens.get(user_id)  → str | None
    db.google_tokens.set(user_id, token)
    db.watches.get(user_id)        → dict | None
    db.watches.set(user_id, watch)
    db.reset_tokens.get(token)     → dict | None
    db.reset_tokens.set(token, record)
    db.reset_tokens.delete(token)
"""

import os
import json
from pathlib import Path
from datetime import datetime

from sqlalchemy import (
    create_engine, text,
    Table, Column, String, Text, MetaData, Integer
)

_DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent.parent / "sentinel.db"))
_ENGINE  = create_engine(f"sqlite:///{_DB_PATH}", connect_args={"check_same_thread": False})
_META    = MetaData()

# ── Schema — all rows stored as JSON blobs keyed by their primary key ─────────
# This keeps the schema migration-free while still persisting to disk.
# For a production system, decompose into typed columns.

_TABLES = {
    "users":         ("email",    "data"),   # email → user dict
    "cases":         ("id",       "data"),   # case_id → case dict
    "alerts":        ("id",       "data"),   # alert_id → alert dict
    "google_tokens": ("user_id",  "token"),  # user_id → token string
    "watches":       ("user_id",  "data"),   # user_id → watch dict
    "reset_tokens":  ("token",    "data"),   # token → {email, expires}
}

_sa_tables: dict = {}

def _init():
    """Create tables if they don't exist, called once at import time."""
    for tname, (pk_col, val_col) in _TABLES.items():
        t = Table(
            tname, _META,
            Column(pk_col,  String(512), primary_key=True),
            Column(val_col, Text,        nullable=False),
            Column("updated_at", String(32), default=""),
            extend_existing=True,
        )
        _sa_tables[tname] = t
    _META.create_all(_ENGINE)

_init()


# ── Low-level helpers ─────────────────────────────────────────────────────────

def _get(tname: str, pk: str):
    t = _sa_tables[tname]
    pk_col  = list(t.primary_key.columns)[0].name
    val_col = [c.name for c in t.columns if c.name not in (pk_col, "updated_at")][0]
    with _ENGINE.connect() as conn:
        row = conn.execute(t.select().where(t.c[pk_col] == pk)).fetchone()
    if not row:
        return None
    raw = getattr(row, val_col)
    try:
        return json.loads(raw)
    except Exception:
        return raw   # plain string (e.g. google token)


def _set(tname: str, pk: str, value):
    t = _sa_tables[tname]
    pk_col  = list(t.primary_key.columns)[0].name
    val_col = [c.name for c in t.columns if c.name not in (pk_col, "updated_at")][0]
    raw     = json.dumps(value) if not isinstance(value, str) else value
    now     = datetime.utcnow().isoformat()
    with _ENGINE.begin() as conn:
        exists = conn.execute(t.select().where(t.c[pk_col] == pk)).fetchone()
        if exists:
            conn.execute(
                t.update().where(t.c[pk_col] == pk)
                .values({val_col: raw, "updated_at": now})
            )
        else:
            conn.execute(t.insert().values({pk_col: pk, val_col: raw, "updated_at": now}))


def _all(tname: str) -> list:
    t = _sa_tables[tname]
    pk_col  = list(t.primary_key.columns)[0].name
    val_col = [c.name for c in t.columns if c.name not in (pk_col, "updated_at")][0]
    with _ENGINE.connect() as conn:
        rows = conn.execute(t.select()).fetchall()
    result = []
    for row in rows:
        raw = getattr(row, val_col)
        try:
            result.append(json.loads(raw))
        except Exception:
            result.append(raw)
    return result


def _delete(tname: str, pk: str):
    t = _sa_tables[tname]
    pk_col = list(t.primary_key.columns)[0].name
    with _ENGINE.begin() as conn:
        conn.execute(t.delete().where(t.c[pk_col] == pk))


# ── Typed table accessors ─────────────────────────────────────────────────────

class _Users:
    def get(self, email: str):          return _get("users", email)
    def set(self, email: str, user):    _set("users", email, user)
    def all(self):                      return _all("users")

class _Cases:
    def get(self, case_id: str):        return _get("cases", case_id)
    def set(self, case_id: str, case):  _set("cases", case_id, case)
    def all(self):                      return _all("cases")
    def all_for_user(self, user_id: str):
        return [c for c in self.all() if c.get("user_id") == user_id]

class _Alerts:
    def get(self, alert_id: str):           return _get("alerts", alert_id)
    def set(self, alert_id: str, alert):    _set("alerts", alert_id, alert)
    def all(self):                          return _all("alerts")
    def all_for_user(self, user_id: str):
        return [a for a in self.all() if a.get("user_id") == user_id]
    def update(self, alert_id: str, patch: dict):
        existing = self.get(alert_id)
        if existing:
            existing.update(patch)
            self.set(alert_id, existing)
        return existing

class _GoogleTokens:
    def get(self, user_id: str):            return _get("google_tokens", user_id)
    def set(self, user_id: str, token: str):_set("google_tokens", user_id, token)

class _Watches:
    def get(self, user_id: str):            return _get("watches", user_id)
    def set(self, user_id: str, watch):     _set("watches", user_id, watch)

class _ResetTokens:
    def get(self, token: str):              return _get("reset_tokens", token)
    def set(self, token: str, record):      _set("reset_tokens", token, record)
    def delete(self, token: str):           _delete("reset_tokens", token)


class _DB:
    """
    Drop-in replacement for the old in-memory DB dict.
    Usage: from services.database import db
    """
    def __init__(self):
        self.users         = _Users()
        self.cases         = _Cases()
        self.alerts        = _Alerts()
        self.google_tokens = _GoogleTokens()
        self.watches       = _Watches()
        self.reset_tokens  = _ResetTokens()

db = _DB()