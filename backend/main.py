"""
Sentinel Backend  —  FastAPI
Run:  uvicorn main:app --reload --port 8000

.env is loaded here, at the top of the entry point, BEFORE any service
module is imported.  This guarantees os.environ.get("GEMINI_API_KEY")
in analysis_service.py sees the value from your .env file.
"""

# ── Load .env first — must be before any local imports ───────────────────────
from dotenv import load_dotenv
load_dotenv()   # reads backend/.env (or .env in CWD) into os.environ

# ── Now safe to import routers (which import services that read env vars) ─────
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import auth, gmail, analyze, cases, alerts, app_settings, graph

app = FastAPI(title="Sentinel Email Forensics API", version="1.0.0")

# ── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Vite dev server
        "chrome-extension://*",   # Chrome extension (any ID)
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router,         prefix="/api/auth",  tags=["Auth"])
app.include_router(gmail.router,        prefix="/api/gmail", tags=["Gmail"])
app.include_router(analyze.router,      prefix="/api/analyze", tags=["Analyze"])
app.include_router(cases.router,        prefix="/api/cases", tags=["Cases"])
app.include_router(alerts.router,       prefix="/api/alerts", tags=["Alerts"])
app.include_router(app_settings.router, prefix="/api/app",   tags=["App"])
app.include_router(graph.router,        prefix="/api/graph",  tags=["Graph"])

@app.get("/health")
def health():
    import os
    # Shows whether the key actually loaded — safe to remove in production
    key = os.environ.get("VITE_GEMINI_API_KEY") or os.environ.get("GEMINI_API_KEY", "")
    return {"status": "ok", "gemini_key_loaded": bool(key)}