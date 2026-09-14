"""
ml_pipeline package bridge
==========================
feature_extractor.py, ml_models.py, and train.py live in backend/ root
(visible in your project structure). This __init__.py re-exports them
so that `from ml_pipeline.ml_models import ...` works correctly from
analysis_service.py without moving any files.
"""
import sys
import os

# Add backend/ root to sys.path so the sibling .py files are importable
_backend_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _backend_root not in sys.path:
    sys.path.insert(0, _backend_root)