"""
Gmail router
------------
POST /gmail/watch    — Register a Gmail push-notification watch for the user
POST /gmail/webhook  — Receive Pub/Sub push messages from Google

How Gmail push notifications work:
  1. Your backend calls gmail.users.watch() with a Cloud Pub/Sub topic.
  2. Google publishes a notification to that topic whenever the user's
     mailbox changes (new email, label change, etc.).
  3. A Pub/Sub push subscription forwards the notification to
     POST /gmail/webhook.
  4. We decode the notification, fetch the new message via Gmail API,
     and pass it to the analysis pipeline.
"""

import base64
import json
import os
from datetime import datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from services.auth_service import get_current_user, DB
from services.analysis_service import analyze_and_save

router = APIRouter()

PUBSUB_TOPIC = os.environ.get(
    "GMAIL_PUBSUB_TOPIC",
    "projects/YOUR_PROJECT_ID/topics/sentinel-gmail-push",
)


# ── Register watch ────────────────────────────────────────────────────────────

@router.post("/watch")
async def register_watch(user=Depends(get_current_user)):
    """
    Calls Gmail API users.watch() so Google pushes new-message events
    to our Pub/Sub topic.  The watch expires after 7 days — the extension
    background script re-calls this via an alarm.
    """
    google_token = DB["google_tokens"].get(user["id"])
    if not google_token:
        raise HTTPException(status_code=400, detail="No Google token for user")

    creds   = _creds_from_token(google_token)
    service = build("gmail", "v1", credentials=creds)

    try:
        result = service.users().watch(
            userId="me",
            body={
                "topicName":    PUBSUB_TOPIC,
                "labelIds":     ["INBOX"],
                "labelFilterBehavior": "INCLUDE",
            },
        ).execute()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Gmail watch failed: {exc}")

    DB["watches"][user["id"]] = {
        "historyId": result.get("historyId"),
        "expiration": result.get("expiration"),
    }
    return {"ok": True, "watch": result}


# ── Pub/Sub webhook ───────────────────────────────────────────────────────────

@router.post("/webhook")
async def gmail_webhook(request: Request, background: BackgroundTasks):
    """
    Google Pub/Sub calls this endpoint with a push message containing
    a base64-encoded JSON payload: { emailAddress, historyId }.
    We fetch the actual new messages and run threat analysis.
    """
    body = await request.json()

    # Pub/Sub message wrapper
    pubsub_msg = body.get("message", {})
    raw_data   = pubsub_msg.get("data", "")

    try:
        decoded   = base64.b64decode(raw_data + "==").decode("utf-8")
        payload   = json.loads(decoded)
    except Exception:
        return {"ok": False, "reason": "bad payload"}

    email_address = payload.get("emailAddress")
    history_id    = payload.get("historyId")

    if not email_address:
        return {"ok": True}  # acknowledge without processing

    # Find the user by email
    user = DB["users"].get(email_address)
    if not user:
        return {"ok": True}  # unknown user — acknowledge and drop

    background.add_task(
        _fetch_and_analyze_new_messages,
        user=user,
        new_history_id=history_id,
    )

    # Return 200 quickly so Pub/Sub does not retry
    return {"ok": True}


# ── Background task ───────────────────────────────────────────────────────────

async def _fetch_and_analyze_new_messages(user: dict, new_history_id: str):
    google_token  = DB["google_tokens"].get(user["id"])
    if not google_token:
        return

    creds   = _creds_from_token(google_token)
    service = build("gmail", "v1", credentials=creds)

    # Find out what changed since the last history ID we recorded
    old_watch = DB["watches"].get(user["id"], {})
    start_id  = old_watch.get("historyId")
    if not start_id:
        return

    try:
        history_response = service.users().history().list(
            userId="me",
            startHistoryId=start_id,
            historyTypes=["messageAdded"],
            labelId="INBOX",
        ).execute()
    except Exception as exc:
        print(f"[Sentinel] history.list failed for {user['email']}: {exc}")
        return

    # Update stored history ID
    DB["watches"][user["id"]]["historyId"] = new_history_id

    histories = history_response.get("history", [])
    for history in histories:
        for msg_added in history.get("messagesAdded", []):
            message_id = msg_added["message"]["id"]
            await _process_message(service, user, message_id)


async def _process_message(service, user: dict, message_id: str):
    try:
        msg = service.users().messages().get(
            userId="me",
            id=message_id,
            format="raw",
        ).execute()
    except Exception as exc:
        print(f"[Sentinel] messages.get failed: {exc}")
        return

    raw_bytes   = base64.urlsafe_b64decode(msg["raw"] + "==")
    raw_email   = raw_bytes.decode("utf-8", errors="replace")

    # Run the full analysis pipeline
    await analyze_and_save(
        raw_email=raw_email,
        user_id=user["id"],
        gmail_message_id=message_id,
    )


# ── Helper ────────────────────────────────────────────────────────────────────

def _creds_from_token(access_token: str) -> Credentials:
    return Credentials(token=access_token)