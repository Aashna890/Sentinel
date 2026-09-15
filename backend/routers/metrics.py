"""
Metrics router
--------------
GET /api/metrics   — Return saved ML model training metrics
                     (accuracy, F1, confusion matrix, feature importances)

The metrics JSON is written by train.py to:
  backend/ml_pipeline/models/metrics.json

This endpoint just reads and returns that file so the frontend
can display a Model Performance page without re-running training.
"""

import json
from pathlib import Path
from fastapi import APIRouter, HTTPException
from services.auth_service import get_current_user
from fastapi import Depends

router = APIRouter()

_METRICS_PATH = Path(__file__).parent.parent / "ml_pipeline" / "models" / "metrics.json"


@router.get("")
def get_metrics(user=Depends(get_current_user)):
    """
    Return model training metrics from the last training run.
    Requires authentication so only logged-in analysts can see them.
    """
    if not _METRICS_PATH.exists():
        raise HTTPException(
            status_code=404,
            detail="Metrics not found. Run: python train.py to generate them.",
        )
    try:
        return json.loads(_METRICS_PATH.read_text())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not read metrics: {e}")