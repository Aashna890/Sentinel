"""
ml_pipeline/feature_extractor.py — import shim
===============================================
Your feature_extractor.py lives in backend/ root.
Re-exports everything so ml_models.py can use:
    from ml_pipeline.feature_extractor import build_feature_vector, ...
"""
from feature_extractor import (   # noqa: F401
    build_feature_vector,
    extract_header_features,
    extract_url_features,
    STRUCTURED_FEATURE_NAMES,
    lookalike_score,
    KNOWN_BRANDS,
)