"""
Sentinel Backend  —  FastAPI
Run:  uvicorn main:app --reload --port 8000
"""

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import auth, gmail, analyze, cases, alerts, app_settings, graph, metrics
from routers.scan import router as scan_router

app = FastAPI(title="Sentinel Email Forensics API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,         prefix="/api/auth",    tags=["Auth"])
app.include_router(gmail.router,        prefix="/api/gmail",   tags=["Gmail"])
app.include_router(analyze.router,      prefix="/api/analyze", tags=["Analyze"])
app.include_router(cases.router,        prefix="/api/cases",   tags=["Cases"])
app.include_router(alerts.router,       prefix="/api/alerts",  tags=["Alerts"])
app.include_router(app_settings.router, prefix="/api/app",     tags=["App"])
app.include_router(graph.router,        prefix="/api/graph",   tags=["Graph"])
app.include_router(metrics.router,      prefix="/api/metrics", tags=["Metrics"])
app.include_router(scan_router)

@app.get("/health")
def health():
    import os
    from pathlib import Path
    key    = os.environ.get("VITE_GEMINI_API_KEY") or os.environ.get("GEMINI_API_KEY", "")
    models = (Path("ml_pipeline") / "models" / "nlp_model.joblib").exists()
    db_ok  = (Path("sentinel.db")).exists()
    return {
        "status":            "ok",
        "gemini_key_loaded": bool(key),
        "models_trained":    models,
        "database":          "sqlite" if db_ok else "not yet created (will create on first request)",
    }