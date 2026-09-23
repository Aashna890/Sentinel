<div align="center">

# 🛡️ Sentinel — AI-Powered Email Threat Detection & Forensic Intelligence Platform

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=flat&logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat&logo=react)](https://react.dev)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat&logo=python)](https://python.org)
[![XGBoost](https://img.shields.io/badge/XGBoost-ML-FF6600?style=flat)](https://xgboost.ai)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat)](LICENSE)

**Sentinel** is a full-stack AI-powered email forensics platform that detects phishing, spoofing, Business Email Compromise (BEC), impersonation, and fraud in real time. It combines NLP, Machine Learning, IP geolocation, WHOIS/DNS intelligence, and graph-based correlation to identify malicious emails and trace their probable origin.


</div>

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [ML Pipeline](#ml-pipeline)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Chrome Extension Setup](#chrome-extension-setup)
- [Google Cloud Setup](#google-cloud-setup)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Screenshots](#screenshots)

---

## Overview

Email remains one of the most exploited attack vectors for phishing, impersonation, BEC, financial fraud, and credential theft. Traditional spam filters using static rules and blacklists are insufficient against modern AI-generated attacks.

Sentinel addresses this gap by providing:

- **Real-time threat detection** using an ensemble of NLP + XGBoost + Isolation Forest models
- **Deep header forensics** — SPF/DKIM/DMARC validation, relay path reconstruction, spoofing detection
- **IP geolocation** with TOR exit node detection and infrastructure classification
- **WHOIS + DNS intelligence** — domain age, registrar, MX records, SPF policy, risk scoring
- **Graph-based correlation** — connects emails, domains, IPs, and URLs to identify campaigns
- **Explainable AI** — SHAP values show exactly why each email was flagged
- **Chrome Extension** — injects threat banners directly into Gmail and sends real-time desktop notifications

---

## Features

### 🔍 Fraudulent Email Detection
- NLP analysis of subject lines, body text, urgency cues, and social engineering patterns
- Detection of phishing, BEC, impersonation, credential harvesting, and malware delivery
- Ensemble ML scoring combining three independent models

### 📧 Email Header & Protocol Analysis
- Deep parsing of `Received`, `Return-Path`, `Reply-To`, `DKIM`, `SPF`, `DMARC` headers
- Detection of forged sender fields, relay manipulation, and spoofed transmission records
- Relay path reconstruction with hop-by-hop timestamps

### 🌍 Origin Traceability & Geolocation
- Extraction of originating IP from header chains
- IP geolocation with country, region, city, ISP, ASN, coordinates
- TOR exit node detection (official Tor Project exit list, refreshed hourly)
- Datacenter / hosting / proxy / residential ISP classification
- Interactive OpenStreetMap embed in case detail view

### 🌐 Domain Intelligence
- WHOIS lookup: registrar, creation date, expiry, domain age, registrant country
- DNS resolution: A records, MX records, NS records, TXT/SPF records, reverse DNS
- Risk signals: newly registered domains, suspicious TLDs, no MX, no SPF, brand impersonation, disposable providers
- Domain risk score (0–100) with detailed risk notes

### 🕸️ Graph Correlation & Campaign Detection
- NetworkX graph connecting emails ↔ domains ↔ IPs ↔ URLs
- DBSCAN clustering to discover phishing campaigns across multiple emails
- Interactive force-directed graph visualisation (pure SVG, no external libraries)
- Shared infrastructure detection across multiple sender domains

### 🧠 Explainable AI (SHAP)
- SHAP feature contribution values for every XGBoost prediction
- Visual bar chart showing which features pushed the score toward threat vs. legitimate
- 25 engineered features across NLP, header, and URL dimensions

### 🔔 Chrome Extension
- Real-time Gmail monitoring via Google Cloud Pub/Sub push notifications
- Threat banner injected directly into Gmail above the email body
- Desktop Chrome notifications for new high-risk detections
- Popup with live alert count, case count, and recent threat list
- Scan Now button for immediate manual poll

### 📊 Analytics & Reporting
- Analyst dashboard with KPI cards, recent cases, and threat distribution pie chart
- Case management with status tracking (new → investigating → escalated → resolved)
- ML Model Performance page with confusion matrices, per-class metrics, feature importances
- Forensic case detail with full investigation workflow

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Chrome Extension                         │
│  popup.js  ←→  background.js  ←→  content.js (Gmail DOM)   │
└──────────────────────┬──────────────────────────────────────┘
                       │ REST API
┌──────────────────────▼──────────────────────────────────────┐
│                   FastAPI Backend                            │
│                                                             │
│  /api/auth     /api/analyze    /api/cases    /api/alerts    │
│  /api/gmail    /api/graph      /api/metrics  /api/app       │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              ML Pipeline                            │   │
│  │  NLP (TF-IDF+SVC) + XGBoost + Isolation Forest     │   │
│  │  Feature Extractor (25 features) + SHAP             │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │ geo_service  │  │domain_intel  │  │  graph_service  │  │
│  │ (3-provider  │  │ (WHOIS+DNS)  │  │ (NetworkX+DBSCAN│  │
│  │  +TOR check) │  │              │  │  campaigns)     │  │
│  └──────────────┘  └──────────────┘  └─────────────────┘  │
│                                                             │
│  SQLite (via SQLAlchemy Core)   Gemini AI (summaries)      │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│              Google Cloud Platform                           │
│                                                             │
│  Gmail API  →  Cloud Pub/Sub  →  /api/gmail/webhook        │
│  OAuth 2.0 (Chrome Extension + Web App)                    │
└─────────────────────────────────────────────────────────────┘
```

---

## ML Pipeline

```
RAW EMAIL (.eml / pasted text)
         │
         ▼
┌─────────────────────┐
│   DATA INGESTION    │
│ Headers + Body      │
│ URLs + Attachments  │
└──────────┬──────────┘
           │
     ┌─────┴──────┐
     ▼            ▼
NLP Features   Header + URL Features
(keyword       (25-dim structured
 scores)        feature vector)
     │            │
     └─────┬──────┘
           ▼
┌─────────────────────┐     ┌───────────────────┐     ┌──────────────────┐
│  TF-IDF + LinearSVC │     │     XGBoost        │     │ Isolation Forest │
│   (NLP Classifier)  │     │ (Structured Model) │     │ (Anomaly Detect) │
│      40% weight     │     │    35% weight      │     │   15% weight     │
└──────────┬──────────┘     └─────────┬──────────┘     └────────┬─────────┘
           │                          │                          │
           └──────────────────────────┴──────────────────────────┘
                                      │
                             ┌────────▼─────────┐
                             │ Ensemble Scoring  │
                             │ + Header Bonus    │
                             │   (up to +21 pts) │
                             └────────┬──────────┘
                                      │
                             ┌────────▼──────────┐
                             │  FRAUD SCORE       │
                             │     0 – 100        │
                             │                   │
                             │  < 30  Legitimate  │
                             │  30-49 Suspicious  │
                             │  50-69 Phishing    │
                             │  70-84 Fraud       │
                             │  85+   Critical    │
                             └────────┬──────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                  ▼
             SHAP Values      Graph Correlation    Forensic Report
           (feature explain)  (NetworkX + DBSCAN)  (Case + Alert)
```

### ML Techniques Used

| Stage | Technique | Algorithm |
|---|---|---|
| Text analysis | NLP | TF-IDF + LinearSVC |
| Threat classification | Supervised ML | XGBoost (25 features) |
| Unknown threats | Anomaly Detection | Isolation Forest |
| Campaign discovery | Clustering | DBSCAN |
| Infrastructure correlation | Graph ML | NetworkX |
| Explainability | XAI | SHAP |

### Feature Vector (25 dimensions)

**NLP keyword scores (5):** urgency, financial, credential, impersonation, BEC

**Text statistics (3):** caps ratio, punctuation density, social engineering

**URL features (6):** URL count, HTTP-only, IP-based URL, avg URL length, suspicious keywords, subdomain depth

**Header features (11):** reply-to mismatch, return-path mismatch, display name impersonation, relay hops, SPF pass/fail, DKIM pass/fail, DMARC pass/fail, lookalike score

---

## Tech Stack

### Backend
- **FastAPI** — REST API framework
- **SQLite + SQLAlchemy Core** — persistent storage
- **scikit-learn** — TF-IDF, LinearSVC, Isolation Forest
- **XGBoost** — structured feature classifier
- **SHAP** — explainability
- **NetworkX** — graph correlation
- **httpx** — async HTTP client
- **python-whois** — WHOIS lookups
- **dnspython** — DNS resolution
- **google-api-python-client** — Gmail API
- **google-generativeai** — Gemini AI summaries
- **PyJWT** — authentication

### Frontend
- **React 18 + Vite** — web application
- **Tailwind CSS** — styling
- **Recharts** — charts and visualisations
- **Lucide React** — icons
- **React Router v6** — routing
- **TanStack Query** — data fetching

### Chrome Extension
- **Manifest V3** — extension framework
- **chrome.identity** — Google OAuth
- **chrome.alarms** — polling scheduler
- **chrome.notifications** — desktop alerts
- **Content Script** — Gmail DOM injection

### Google Cloud
- **Gmail API** — email access and labelling
- **Cloud Pub/Sub** — push notifications for new emails
- **OAuth 2.0** — authentication for both web app and extension

---

## Project Structure

```
ForensiMail AI/
│
├── backend/                          # FastAPI backend
│   ├── main.py                       # App entry point
│   ├── train.py                      # ML model training script
│   ├── requirements.txt
│   ├── sentinel.db                   # SQLite database (auto-created)
│   │
│   ├── routers/                      # API route handlers
│   │   ├── auth.py                   # Authentication (Google + email/password)
│   │   ├── analyze.py                # Email analysis pipeline
│   │   ├── cases.py                  # Case management
│   │   ├── alerts.py                 # Alert management
│   │   ├── gmail.py                  # Gmail watch + Pub/Sub webhook
│   │   ├── graph.py                  # Graph correlation endpoints
│   │   ├── metrics.py                # ML model metrics
│   │   └── app_settings.py           # Public settings
│   │
│   ├── services/                     # Business logic
│   │   ├── analysis_service.py       # Main analysis pipeline
│   │   ├── auth_service.py           # JWT + password hashing
│   │   ├── database.py               # SQLite via SQLAlchemy Core
│   │   ├── geo_service.py            # IP geolocation + TOR detection
│   │   ├── domain_intel_service.py   # WHOIS + DNS intelligence
│   │   └── graph_service.py          # NetworkX + DBSCAN campaigns
│   │
│   ├── ml_pipeline/                  # Machine learning
│   │   ├── feature_extractor.py      # 25-dim feature vector
│   │   ├── ml_models.py              # Model inference + SHAP
│   │   └── models/                   # Trained model files (generated by train.py)
│   │       ├── nlp_model.joblib
│   │       ├── structured_model.joblib
│   │       ├── anomaly_model.joblib
│   │       └── metrics.json
│   │
│   └── datasets/                     # Training data (git-ignored)
│       ├── ceas08/
│       ├── enron/
│       ├── nazario/
│       └── spamassassin/
│
├── src/                              # React frontend
│   ├── api/
│   │   ├── apiClient.js              # Authenticated API client + Gemini
│   │   └── authClient.js             # Auth helpers + token management
│   │
│   ├── components/                   # Reusable components
│   │   ├── AppLayout.jsx
│   │   ├── AuthLayout.jsx
│   │   ├── GraphView.jsx             # Force-directed graph (pure SVG)
│   │   ├── ProtectedRoute.jsx
│   │   └── landing/                  # Landing page sections
│   │
│   ├── pages/                        # Route pages
│   │   ├── Dashboard.jsx
│   │   ├── AnalyzeEmail.jsx
│   │   ├── CaseDetail.jsx
│   │   ├── Cases.jsx
│   │   ├── Alerts.jsx
│   │   ├── ModelMetrics.jsx
│   │   ├── Landing.jsx
│   │   ├── Login.jsx
│   │   ├── Register.jsx
│   │   └── OAuthCallback.jsx
│   │
│   └── lib/
│       ├── AuthContext.jsx
│       └── utils.js
│
├── extension/                        # Chrome Extension (Manifest V3)
│   ├── manifest.json
│   ├── background.js                 # Service worker: OAuth, polling, notifications
│   ├── content.js                    # Gmail DOM injection: threat banners
│   ├── content.css
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.js
│   │   └── popup.css
│   └── icons/
│       ├── icon16.png
│       ├── icon48.png
│       └── icon128.png
│
├── .env                              # Frontend environment variables
├── .gitignore
├── package.json
├── vite.config.js
└── tailwind.config.js
```

---

## Getting Started

### Prerequisites
- Python 3.10+
- Node.js 18+
- Google Cloud account
- ngrok (for local development)

### 1. Clone the repository

```bash
git clone https://github.com/Aashna890/sentinel.git
cd sentinel
```

### 2. Backend setup

```bash
cd backend
python -m venv venv

# Mac/Linux:
source venv/bin/activate
# Windows:
venv\Scripts\activate

pip install -r requirements.txt
```

Create `backend/.env`:

```env
JWT_SECRET=your-random-secret-minimum-32-characters
PASSWORD_SALT=another-random-string
GEMINI_API_KEY=AIza...your-gemini-key...
GMAIL_PUBSUB_TOPIC=projects/YOUR_PROJECT_ID/topics/sentinel-gmail-push
GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-client-secret
BACKEND_URL=http://localhost:8000
FRONTEND_URL=http://localhost:5173
IPINFO_TOKEN=                         # optional — improves geolocation
```

Train the ML models (required before first run):

```bash
python train.py
```

Start the backend:

```bash
uvicorn main:app --reload --port 8000
```

### 3. Frontend setup

```bash
# From project root
npm install
```

Create `.env` in project root:

```env
VITE_API_BASE_URL=/api
VITE_BACKEND_URL=http://localhost:8000
VITE_GEMINI_API_KEY=AIza...your-gemini-key...
```

Start the frontend:

```bash
npm run dev
```

Open `http://localhost:5173`

---

## Chrome Extension Setup

### 1. Load the extension

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `extension/` folder
4. Copy the **Extension ID** shown

### 2. Google Cloud OAuth credential

1. GCP → **APIs & Services → Credentials → Create Credentials → OAuth client ID**
2. Application type: **Chrome Extension**
3. Paste the Extension ID
4. Copy the **Client ID** → paste into `extension/manifest.json` → `oauth2.client_id`

### 3. Expose backend for Pub/Sub

```bash
ngrok http 8000
```

Copy the `https://xxxx.ngrok-free.app` URL.

### 4. Set up Pub/Sub

```bash
# In Google Cloud Shell or gcloud CLI:
gcloud pubsub topics create sentinel-gmail-push

gcloud pubsub topics add-iam-policy-binding sentinel-gmail-push \
  --member="serviceAccount:gmail-api-push@system.gserviceaccount.com" \
  --role="roles/pubsub.publisher"

gcloud pubsub subscriptions create sentinel-gmail-sub \
  --topic=sentinel-gmail-push \
  --push-endpoint=https://YOUR_NGROK_URL/api/gmail/webhook \
  --ack-deadline=30
```

### 5. Sign in

Click the Sentinel extension icon → **Continue with Google** → authorize Gmail permissions.

---

## Google Cloud Setup

| Step | What to do |
|---|---|
| Create project | console.cloud.google.com → New Project → "Sentinel" |
| Enable APIs | Gmail API, Cloud Pub/Sub API, Google People API |
| OAuth consent screen | External → add scopes → add test users |
| Web app credential | OAuth client ID → Web application → add redirect URI |
| Extension credential | OAuth client ID → Chrome Extension → add Extension ID |

**Required OAuth Scopes:**
```
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/gmail.labels
https://www.googleapis.com/auth/gmail.modify
openid email profile
```

**Authorized redirect URI** (Web app credential):
```
http://localhost:8000/api/auth/google/callback
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `JWT_SECRET` | ✅ | Secret key for JWT signing (min 32 chars) |
| `PASSWORD_SALT` | ✅ | Salt for PBKDF2 password hashing |
| `GEMINI_API_KEY` | ✅ | Google Gemini AI API key |
| `GMAIL_PUBSUB_TOPIC` | ✅ | Full Pub/Sub topic path |
| `GOOGLE_CLIENT_ID` | ✅ | Web app OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | ✅ | Web app OAuth client secret |
| `BACKEND_URL` | ✅ | Backend base URL |
| `FRONTEND_URL` | ✅ | Frontend base URL |
| `IPINFO_TOKEN` | ⬜ | ipinfo.io token for better geolocation |
| `DB_PATH` | ⬜ | Custom SQLite path (default: sentinel.db) |

### Frontend (`.env`)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_BASE_URL` | ✅ | API base path (use `/api`) |
| `VITE_BACKEND_URL` | ✅ | Backend URL for OAuth redirects |
| `VITE_GEMINI_API_KEY` | ✅ | Gemini key for client-side quick screen |

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/google` | Chrome extension: exchange Google token for JWT |
| `GET` | `/api/auth/google/redirect` | Web app: start Google OAuth flow |
| `GET` | `/api/auth/google/callback` | Web app: handle Google OAuth callback |
| `POST` | `/api/auth/login` | Email/password login |
| `POST` | `/api/auth/register` | Register new account |
| `GET` | `/api/auth/me` | Get current authenticated user |
| `POST` | `/api/analyze` | Full forensic analysis pipeline |
| `POST` | `/api/analyze/quick` | Fast ML-only analysis (extension) |
| `GET` | `/api/cases` | List all cases for current user |
| `GET` | `/api/cases/{id}` | Get single case detail |
| `PATCH` | `/api/cases/{id}` | Update case status |
| `GET` | `/api/alerts` | List alerts (filter: `?unacknowledged=true`) |
| `PATCH` | `/api/alerts/{id}/acknowledge` | Acknowledge an alert |
| `POST` | `/api/gmail/watch` | Register Gmail Pub/Sub watch |
| `POST` | `/api/gmail/webhook` | Receive Pub/Sub push notifications |
| `GET` | `/api/graph/{case_id}` | Full graph subgraph for a case |
| `GET` | `/api/graph/{case_id}/related` | Related cases report |
| `GET` | `/api/graph` | All campaigns across user's cases |
| `GET` | `/api/metrics` | ML model training metrics |
| `GET` | `/health` | Health check |

---

## Screenshots

| Feature | Description |
|---|---|
| **Dashboard** | KPI cards, recent cases, threat distribution pie chart |
| **Analyze Email** | Paste raw email → full forensic pipeline |
| **Case Detail** | Complete forensic report with map, domain intel, SHAP |
| **Graph View** | Interactive force-directed infrastructure correlation graph |
| **ML Metrics** | Confusion matrices, feature importances, ensemble weights |
| **Chrome Extension** | Popup with live stats + Gmail threat banner injection |

---

## Built With

- [FastAPI](https://fastapi.tiangolo.com) — Backend framework
- [React](https://react.dev) — Frontend framework
- [XGBoost](https://xgboost.ai) — Gradient boosted ML
- [SHAP](https://shap.readthedocs.io) — Explainable AI
- [NetworkX](https://networkx.org) — Graph analysis
- [Gemini AI](https://ai.google.dev) — Natural language summaries
- [Google Cloud Pub/Sub](https://cloud.google.com/pubsub) — Real-time push notifications

---


