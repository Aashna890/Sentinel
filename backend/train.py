"""
train.py  —  Sentinel ML Training Pipeline (CSV-aware)
=======================================================
Handles YOUR actual dataset files:
  datasets/ceas08/CEAS_08.csv          — columns: body, label (spam/ham)
  datasets/enron/enron emails.csv      — columns vary; auto-detected
  datasets/nazario/email_text.csv      — phishing emails
  datasets/nazario/Nazario_5.csv       — phishing emails (alternate)
  datasets/spamassassin/easy_ham/      — folder of raw email files
  datasets/spamassassin/hard_ham/      — folder of raw email files
  datasets/spamassassin/spam_2/        — folder of raw email files

Run from backend/:
    python train.py

Outputs to backend/ml_pipeline/models/:
  nlp_model.joblib
  structured_model.joblib
  anomaly_model.joblib
  label_encoder.joblib
"""

import os
import re
import glob
import email as email_lib
import warnings
from email import policy
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.svm import LinearSVC
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import LabelEncoder
from sklearn.pipeline import Pipeline
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import classification_report
import xgboost as xgb
import joblib

from feature_extractor import build_feature_vector, STRUCTURED_FEATURE_NAMES

warnings.filterwarnings("ignore")

# ── Paths ──────────────────────────────────────────────────────────────────────
BASE      = Path(__file__).parent          # backend/
DATASETS  = BASE / "datasets"
MODEL_DIR = BASE / "ml_pipeline" / "models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

# ── Label constants — these ARE the trained classes ───────────────────────────
LABEL_LEGIT         = "legitimate"
LABEL_SPAM          = "spam"
LABEL_PHISHING      = "phishing"
LABEL_BEC           = "bec"
LABEL_IMPERSONATION = "impersonation"

# All threat labels — used to build binary y for XGBoost / Isolation Forest
THREAT_LABELS = {LABEL_SPAM, LABEL_PHISHING, LABEL_BEC, LABEL_IMPERSONATION}


# ══════════════════════════════════════════════════════════════════════════════
# SYNTHETIC DATA GENERATOR
# Adds labelled BEC and Impersonation examples so the NLP model learns
# these as distinct classes rather than collapsing them into "spam".
# All templates are parameterised — no hardcoded company names.
# ══════════════════════════════════════════════════════════════════════════════

import os as _os
import random as _random

# Read synthetic counts from env so they can be tuned without code changes
_BEC_COUNT          = int(_os.environ.get("SYNTHETIC_BEC_COUNT",          "600"))
_IMPERSONATION_COUNT= int(_os.environ.get("SYNTHETIC_IMPERSONATION_COUNT","400"))

# Template placeholders — populated randomly at generation time
_EXEC_TITLES  = ["CEO", "CFO", "Managing Director", "Director", "VP Finance",
                 "COO", "Head of Finance", "Chief Executive"]
_AMOUNT_WORDS = ["immediately", "urgently", "as a matter of urgency",
                 "without delay", "right away"]
_CURRENCIES   = ["USD", "EUR", "GBP", "₹", "$", "€"]
_BANKS        = ["new bank account", "updated banking details",
                 "revised payment account", "new beneficiary account"]
_BRANDS       = ["Microsoft", "Google", "Apple", "Amazon", "PayPal",
                 "Netflix", "Dropbox", "LinkedIn", "Adobe", "Zoom",
                 "Your Bank", "State Tax Authority", "IRS", "HMRC",
                 "IT Support Team", "HR Department", "Security Team"]
_PORTALS      = ["secure portal", "account verification page",
                 "authentication portal", "login page", "account centre"]
_URGENCY      = ["24 hours", "48 hours", "immediately", "today",
                 "within the hour", "before end of day", "by 5 PM"]

def _rand(lst: list) -> str:
    return _random.choice(lst)

def _amount() -> str:
    n = _random.randint(10, 500) * 1000
    c = _rand(_CURRENCIES)
    return f"{c}{n:,}"

def _generate_bec_emails(n: int) -> list[dict]:
    """
    Generate n synthetic BEC email texts.
    Each uses a randomly selected template with randomised slot values
    so the model learns the pattern, not a fixed phrase.
    """
    templates = [
        # Payment diversion
        lambda: (
            f"Subject: Urgent Payment Request\n\n"
            f"Hi,\n\nI am currently in a meeting and cannot take calls. "
            f"Please process a wire transfer of {_amount()} {_rand(_AMOUNT_WORDS)} "
            f"to the {_rand(_BANKS)} I will send you shortly. "
            f"This is confidential — do not discuss with anyone. "
            f"I need confirmation once done.\n\nRegards,\n{_rand(_EXEC_TITLES)}"
        ),
        # Invoice fraud
        lambda: (
            f"Subject: Invoice for Immediate Processing\n\n"
            f"Team,\n\nPlease process the attached invoice of {_amount()} "
            f"{_rand(_AMOUNT_WORDS)}. I am unavailable to speak. "
            f"Do not delay — the vendor requires payment within {_rand(_URGENCY)}. "
            f"Wire to the account details in the attachment.\n\n{_rand(_EXEC_TITLES)}"
        ),
        # Bank account change
        lambda: (
            f"Subject: Updated Vendor Banking Details\n\n"
            f"Hi Finance Team,\n\nOur vendor has updated their banking details. "
            f"Please update your records and process the next payment of {_amount()} "
            f"to the new account. Details: {_rand(_BANKS)}. "
            f"Please confirm receipt of this email. Do not call me today.\n\n"
            f"Thanks,\n{_rand(_EXEC_TITLES)}"
        ),
        # Gift card scam
        lambda: (
            f"Subject: Quick Favour Needed\n\n"
            f"Hi,\n\nI need you to purchase {_random.randint(5,20)} gift cards "
            f"worth {_amount()} total {_rand(_AMOUNT_WORDS)}. "
            f"Send me the redemption codes via email. I am in a meeting and "
            f"cannot explain further right now. Keep this between us.\n\n"
            f"Best,\n{_rand(_EXEC_TITLES)}"
        ),
        # Payroll redirect
        lambda: (
            f"Subject: Salary Payment Update\n\n"
            f"Hello,\n\nI need to update my salary payment details. "
            f"Please change my direct deposit to the following {_rand(_BANKS)} "
            f"effective from the next pay cycle. "
            f"Process this {_rand(_AMOUNT_WORDS)} and confirm once done. "
            f"Do not contact me by phone.\n\n{_rand(_EXEC_TITLES)}"
        ),
    ]
    records = []
    for _ in range(n):
        text = _random.choice(templates)()
        records.append({"text": text, "label": LABEL_BEC})
    return records


def _generate_impersonation_emails(n: int) -> list[dict]:
    """
    Generate n synthetic brand/authority impersonation email texts.
    """
    templates = [
        # Account suspension
        lambda: (
            f"Subject: Your {_rand(_BRANDS)} Account Has Been Suspended\n\n"
            f"Dear Customer,\n\nYour account has been temporarily suspended "
            f"due to suspicious activity. Verify your identity within "
            f"{_rand(_URGENCY)} to avoid permanent closure.\n\n"
            f"Click here to verify: http://secure-{_rand(_BRANDS).lower().replace(' ','-')}.com/{_rand(_PORTALS)}\n\n"
            f"Failure to act will result in permanent account termination.\n\n"
            f"{_rand(_BRANDS)} Security Team"
        ),
        # Password reset phishing
        lambda: (
            f"Subject: Action Required — Verify Your {_rand(_BRANDS)} Account\n\n"
            f"Hello,\n\nWe detected unusual sign-in activity on your account. "
            f"Please verify your password and personal details within "
            f"{_rand(_URGENCY)} using the link below.\n\n"
            f"Verify now: http://login-{_rand(_BRANDS).lower().replace(' ','-')}.com\n\n"
            f"If you did not request this, ignore this message.\n\n"
            f"The {_rand(_BRANDS)} Team"
        ),
        # Prize/lottery scam
        lambda: (
            f"Subject: Congratulations! You Have Been Selected\n\n"
            f"Dear Winner,\n\nYou have been selected to receive a prize of "
            f"{_amount()} from {_rand(_BRANDS)}. "
            f"Claim your reward within {_rand(_URGENCY)} by providing your "
            f"bank account details for the transfer. "
            f"Reply with your full name, address, and account number.\n\n"
            f"{_rand(_BRANDS)} Rewards Team"
        ),
        # IT/helpdesk credential harvest
        lambda: (
            f"Subject: Mandatory Password Reset — {_rand(_BRANDS)}\n\n"
            f"Hi,\n\nAs part of our security upgrade, all users must reset "
            f"their passwords within {_rand(_URGENCY)}. "
            f"Please log in using the link below and enter your current "
            f"credentials to complete the process.\n\n"
            f"Reset link: http://{_rand(_BRANDS).lower().replace(' ','-')}-helpdesk.com/reset\n\n"
            f"Failure to comply will result in account lockout.\n\n"
            f"{_rand(_BRANDS)} IT Security"
        ),
        # Tax/government authority
        lambda: (
            f"Subject: Urgent Tax Refund Notification\n\n"
            f"Dear Taxpayer,\n\nOur records indicate you are eligible for a "
            f"tax refund of {_amount()}. To process this refund "
            f"{_rand(_AMOUNT_WORDS)}, please verify your bank account details "
            f"by visiting the link below within {_rand(_URGENCY)}.\n\n"
            f"Claim refund: http://tax-refund-portal.com/claim\n\n"
            f"This is an automated notification from {_rand(_BRANDS)}."
        ),
    ]
    records = []
    for _ in range(n):
        text = _random.choice(templates)()
        records.append({"text": text, "label": LABEL_IMPERSONATION})
    return records


# ══════════════════════════════════════════════════════════════════════════════
# FEATURE HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def _empty_parsed() -> dict:
    """
    Minimal parsed email dict for training rows that come from CSVs
    and therefore have no real headers. Header-based features will be
    zero/neutral — that's correct since the training data doesn't have them.
    If you later enrich your CSVs with header columns, update this function.
    """
    return {
        "sender_email":           "",
        "sender_display_name":    "",
        "reply_to":               "",
        "return_path":            "",
        "received_headers":       [],
        "authentication_results": "",
    }


def _build_matrix(df: pd.DataFrame) -> np.ndarray:
    """
    Build the full feature matrix using the canonical feature_extractor.
    This is the single call site — feature vector shape is always driven
    by STRUCTURED_FEATURE_NAMES from feature_extractor.py.
    """
    parsed = _empty_parsed()
    return np.array(
        [build_feature_vector(row["text"], parsed) for _, row in df.iterrows()],
        dtype=np.float32,
    )


# ══════════════════════════════════════════════════════════════════════════════
# DATASET LOADERS — handles your actual CSV + folder structure
# ══════════════════════════════════════════════════════════════════════════════

def _text_from_raw_email(raw: str) -> str:
    """Parse a raw .eml string and return subject + body text."""
    try:
        msg = email_lib.message_from_string(raw, policy=policy.compat32)
        subject = msg.get("Subject", "") or ""
        body = ""
        if msg.is_multipart():
            for part in msg.walk():
                if part.get_content_type() == "text/plain":
                    try:
                        body = part.get_payload(decode=True).decode("utf-8", errors="replace")
                        break
                    except Exception:
                        pass
        else:
            try:
                payload = msg.get_payload(decode=True)
                body = payload.decode("utf-8", errors="replace") if payload else str(msg.get_payload() or "")
            except Exception:
                body = str(msg.get_payload() or "")
        return f"{subject} {body}".strip()
    except Exception:
        return raw[:2000]  # fallback: use first 2000 chars of raw


def _load_csv(path: Path, text_cols: list, label_col: str,
              positive_label: str, positive_values: list,
              max_rows: int = 8000) -> list[dict]:
    """
    Generic CSV loader.
    text_cols: ordered list of column names to try for text content
    label_col: column containing the label
    positive_label: what to store when the row is positive class
    positive_values: which values in label_col map to positive class
    """
    records = []
    try:
        import csv, sys
        csv.field_size_limit(min(sys.maxsize, 10_000_000))  # allow large email bodies
        try:
            df = pd.read_csv(path, encoding="utf-8", nrows=max_rows,
                             on_bad_lines="skip", engine="python")
        except TypeError:
            # pandas < 1.3 fallback
            df = pd.read_csv(path, encoding="utf-8", nrows=max_rows,
                             error_bad_lines=False, engine="python")
        df.columns = [c.strip().lower() for c in df.columns]

        # Find text column
        text_col = None
        for candidate in [c.lower() for c in text_cols]:
            if candidate in df.columns:
                text_col = candidate
                break
        if text_col is None:
            # Try first column that looks like text
            for col in df.columns:
                sample = str(df[col].iloc[0]) if len(df) > 0 else ""
                if len(sample) > 30:
                    text_col = col
                    break

        # Find label column
        lbl_col = None
        for candidate in [label_col.lower(), "label", "class", "type", "category", "spam"]:
            if candidate in df.columns:
                lbl_col = candidate
                break

        if text_col is None:
            print(f"    [warn] Could not find text column in {path.name}. Columns: {list(df.columns)}")
            return []

        for _, row in df.iterrows():
            text = str(row.get(text_col, "") or "").strip()
            if not text or len(text) < 10:
                continue

            if lbl_col:
                val = str(row.get(lbl_col, "")).strip().lower()
                lbl = positive_label if val in [v.lower() for v in positive_values] else LABEL_LEGIT
            else:
                lbl = positive_label  # if no label column, assume all positive

            records.append({"text": text, "label": lbl})

    except Exception as e:
        print(f"    [warn] CSV load failed {path}: {e}")
    return records


def _load_folder(folder: Path, label: str, max_count: int = 3000) -> list[dict]:
    """Load raw email files from a folder."""
    records = []
    files = []
    for ext in ["*.eml", "*.txt", "*"]:
        found = glob.glob(str(folder / "**" / ext), recursive=True)
        files.extend(f for f in found if os.path.isfile(f))
    files = list(set(files))[:max_count]

    for fpath in files:
        try:
            raw = open(fpath, encoding="utf-8", errors="replace").read()
            text = _text_from_raw_email(raw)
            if text and len(text) > 20:
                records.append({"text": text, "label": label})
        except Exception:
            pass
    return records


def load_all_datasets() -> pd.DataFrame:
    print("\n[1/5] Loading datasets...")
    all_records = []

    # ── CEAS-08: datasets/ceas08/CEAS_08.csv ──────────────────────────────────
    ceas_dir = DATASETS / "ceas08"
    if ceas_dir.exists():
        csv_files = list(ceas_dir.glob("*.csv"))
        if csv_files:
            path = csv_files[0]
            print(f"  Loading CEAS-08 from {path.name}")
            recs = _load_csv(
                path,
                text_cols=["body", "text", "message", "email", "content"],
                label_col="label",
                positive_label=LABEL_SPAM,
                positive_values=["1", "1.0", "spam", "Spam", "SPAM"],
                max_rows=20000,
            )
            all_records.extend(recs)
            spam_n = sum(1 for r in recs if r["label"] == LABEL_SPAM)
            ham_n  = len(recs) - spam_n
            print(f"    CEAS-08: {spam_n} spam, {ham_n} ham  (total {len(recs)})")
        else:
            print(f"  [skip] No CSV found in {ceas_dir}")
    else:
        print(f"  [skip] datasets/ceas08/ not found")

    # ── Enron: datasets/enron/enron emails.csv ─────────────────────────────────
    enron_dir = DATASETS / "enron"
    if enron_dir.exists():
        csv_files = list(enron_dir.glob("*.csv"))
        if csv_files:
            path = csv_files[0]
            print(f"  Loading Enron from {path.name}")
            recs = _load_csv(
                path,
                text_cols=["message", "body", "text", "content", "email"],
                label_col="category",
                positive_label=LABEL_SPAM,
                positive_values=["spam"],
                max_rows=10000,
            )
            # Enron is a ham corpus — ensure all rows are legitimate
            for r in recs:
                r["label"] = LABEL_LEGIT
            all_records.extend(recs)
            print(f"    Enron: {len(recs)} legitimate emails")
        else:
            print(f"  [skip] No CSV found in {enron_dir}")
    else:
        print(f"  [skip] datasets/enron/ not found")

    # ── Nazario: datasets/nazario/email_text.csv + Nazario_5.csv ──────────────
    naz_dir = DATASETS / "nazario"
    if naz_dir.exists():
        for csv_name in ["email_text.csv", "Nazario_5.csv"]:
            path = naz_dir / csv_name
            if path.exists():
                print(f"  Loading Nazario from {csv_name}")
                recs = _load_csv(
                    path,
                    # email_text.csv → columns: label, text
                    # Nazario_5.csv  → columns: sender, receiver, date, subject, body, label, urls
                    text_cols=["text", "body", "email_text", "message", "content"],
                    label_col="label",
                    positive_label=LABEL_PHISHING,
                    positive_values=["1", "1.0", "phishing", "Phishing", "spam"],
                    max_rows=5000,
                )
                all_records.extend(recs)
                phish_n = sum(1 for r in recs if r["label"] == LABEL_PHISHING)
                print(f"    Nazario/{csv_name}: {phish_n} phishing, {len(recs)-phish_n} legitimate")
    else:
        print(f"  [skip] datasets/nazario/ not found")

    # ── SpamAssassin: folder of raw email files ─────────────────────────────────
    sa_dir = DATASETS / "spamassassin"
    if sa_dir.exists():
        for subdir in sa_dir.iterdir():
            if not subdir.is_dir():
                continue
            lbl = LABEL_SPAM if "spam" in subdir.name.lower() else LABEL_LEGIT
            recs = _load_folder(subdir, lbl, max_count=3000)
            all_records.extend(recs)
            print(f"    SpamAssassin/{subdir.name}: {len(recs)} ({lbl})")
    else:
        print(f"  [skip] datasets/spamassassin/ not found")

    if not all_records:
        raise RuntimeError(
            "No data loaded. Check backend/datasets/ folder. "
            "Expected: datasets/ceas08/CEAS_08.csv, datasets/enron/enron emails.csv, "
            "datasets/nazario/email_text.csv"
        )

    # ── Inject synthetic BEC and Impersonation examples ───────────────────────
    # These are generated from templates so the NLP model learns the distinct
    # linguistic patterns of BEC and impersonation attacks, not just "spam".
    print(f"\n  Generating synthetic BEC examples ({_BEC_COUNT})...")
    all_records.extend(_generate_bec_emails(_BEC_COUNT))

    print(f"  Generating synthetic Impersonation examples ({_IMPERSONATION_COUNT})...")
    all_records.extend(_generate_impersonation_emails(_IMPERSONATION_COUNT))

    df = pd.DataFrame(all_records)
    df["text"] = df["text"].fillna("").astype(str)
    df["label"] = df["label"].fillna(LABEL_LEGIT)

    print(f"\n  Total loaded: {len(df)} emails")
    print(f"  Label distribution (before balancing):\n{df['label'].value_counts().to_string()}")

    # Balance classes — cap dominant classes, ensure each class has at least
    # min_floor examples so small classes aren't diluted out
    counts       = df["label"].value_counts()
    min_floor    = int(_os.environ.get("MIN_CLASS_FLOOR", "400"))
    max_cap      = int(_os.environ.get("MAX_CLASS_CAP",  "4000"))

    balanced_parts = []
    for label, grp in df.groupby("label", group_keys=False):
        target = max(min(len(grp), max_cap), min_floor)
        if len(grp) >= target:
            balanced_parts.append(grp.sample(target, random_state=42))
        else:
            # Oversample with replacement if class is tiny
            balanced_parts.append(grp.sample(target, replace=True, random_state=42))

    df = pd.concat(balanced_parts, ignore_index=True).sample(frac=1, random_state=42)

    print(f"\n  After balancing: {len(df)} emails")
    print(f"  Label distribution:\n{df['label'].value_counts().to_string()}")
    return df


# ══════════════════════════════════════════════════════════════════════════════
# MODEL TRAINING
# ══════════════════════════════════════════════════════════════════════════════

def train_nlp_model(df: pd.DataFrame):
    print("\n[2/5] Training NLP model (TF-IDF + LinearSVC)...")
    X = df["text"].tolist()
    y = df["label"].tolist()

    le = LabelEncoder()
    y_enc = le.fit_transform(y)
    print(f"  Classes: {list(le.classes_)}")

    X_train, X_test, y_train, y_test = train_test_split(
        X, y_enc, test_size=0.2, random_state=42, stratify=y_enc
    )

    pipeline = Pipeline([
        ("tfidf", TfidfVectorizer(
            max_features=50000,
            ngram_range=(1, 2),
            sublinear_tf=True,
            min_df=2,
            strip_accents="unicode",
            analyzer="word",
            token_pattern=r"\b[a-zA-Z0-9]{2,}\b",
        )),
        ("clf", LinearSVC(C=1.0, max_iter=3000, class_weight="balanced")),
    ])

    pipeline.fit(X_train, y_train)
    y_pred = pipeline.predict(X_test)

    print(f"\n  NLP Model — Classification Report:")
    print(classification_report(y_test, y_pred, target_names=le.classes_))

    cv = cross_val_score(pipeline, X, y_enc, cv=5, scoring="f1_weighted", n_jobs=-1)
    print(f"  Cross-val F1 (5-fold): {cv.mean():.3f} ± {cv.std():.3f}")

    joblib.dump(pipeline, MODEL_DIR / "nlp_model.joblib")
    joblib.dump(le,       MODEL_DIR / "label_encoder.joblib")
    print(f"  ✓ Saved nlp_model.joblib + label_encoder.joblib")
    return pipeline, le


def train_structured_model(df: pd.DataFrame):
    print("\n[3/5] Training structured model (XGBoost)...")
    print(f"  Feature vector size: {len(STRUCTURED_FEATURE_NAMES)}")

    X = _build_matrix(df)
    y = np.array([0 if lbl == LABEL_LEGIT else 1 for lbl in df["label"]])

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    model = xgb.XGBClassifier(
        n_estimators=200,
        max_depth=6,
        learning_rate=0.1,
        subsample=0.8,
        colsample_bytree=0.8,
        eval_metric="logloss",
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)

    y_pred = model.predict(X_test)
    print(f"\n  Structured Model — Classification Report:")
    print(classification_report(y_test, y_pred, target_names=["legitimate", "threat"]))

    print("\n  Feature Importances (XGBoost):")
    for name, imp in sorted(
        zip(STRUCTURED_FEATURE_NAMES, model.feature_importances_),
        key=lambda x: -x[1],
    ):
        bar = "█" * int(imp * 40)
        print(f"    {name:<25} {bar} {imp:.3f}")

    joblib.dump(model, MODEL_DIR / "structured_model.joblib")
    print(f"  ✓ Saved structured_model.joblib")
    return model


def train_anomaly_model(df: pd.DataFrame):
    print("\n[4/5] Training anomaly detector (Isolation Forest)...")

    legit_df = df[df["label"] == LABEL_LEGIT]
    print(f"  Training on {len(legit_df)} legitimate emails as normal baseline")

    X_legit = _build_matrix(legit_df)
    model = IsolationForest(
        n_estimators=200, contamination=0.05, random_state=42, n_jobs=-1
    )
    model.fit(X_legit)

    X_all  = _build_matrix(df)
    scores = model.score_samples(X_all)
    legit_mean  = scores[df["label"].values == LABEL_LEGIT].mean()
    threat_mean = scores[df["label"].values != LABEL_LEGIT].mean()
    print(f"  Anomaly scores (higher = more normal):")
    print(f"    Legitimate mean: {legit_mean:.3f}")
    print(f"    Threat mean:     {threat_mean:.3f}")
    print(f"  Separation gap:  {legit_mean - threat_mean:.3f} (larger = better)")

    joblib.dump(model, MODEL_DIR / "anomaly_model.joblib")
    print(f"  ✓ Saved anomaly_model.joblib")
    return model


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("=" * 60)
    print("Sentinel ML Training Pipeline")
    print("=" * 60)

    df = load_all_datasets()
    train_nlp_model(df)
    train_structured_model(df)
    train_anomaly_model(df)

    print("\n[5/5] All models trained ✓")
    print(f"  Saved to: {MODEL_DIR}")
    print("\nNext: restart uvicorn — models load automatically on startup.")
    print("=" * 60)