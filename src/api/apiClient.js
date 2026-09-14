// ─────────────────────────────────────────────────────────────────────────────
// src/api/apiClient.js  —  Sentinel Frontend API Client
// ─────────────────────────────────────────────────────────────────────────────

import { getAccessToken } from '@/api/authClient';

const API_BASE     = import.meta.env.VITE_API_BASE_URL ?? '/api';
const GEMINI_KEY   = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-3.5-flash';
const GEMINI_URL   = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;

// ── Authenticated fetch ───────────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  const token = getAccessToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    let data = {};
    try { data = await res.json(); } catch { /* no JSON body */ }
    const err = new Error(data.detail ?? data.message ?? res.statusText);
    err.status = res.status;
    err.data   = data;
    throw err;
  }

  if (res.status === 204) return null;
  return res.json();
}

// ── Gemini 3.5 Flash helper ───────────────────────────────────────────────────

async function geminiGenerate(prompt, systemInstruction = '') {
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
  };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `Gemini error: ${res.status}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// ── Entity factory ────────────────────────────────────────────────────────────

function makeEntity(resourcePath) {
  return {
    async list(sort = '-created_date', limit = 100) {
      const params = new URLSearchParams();
      if (sort)  params.set('sort',  sort);
      if (limit) params.set('limit', String(limit));
      return apiFetch(`${resourcePath}?${params}`);
    },
    async get(id)          { return apiFetch(`${resourcePath}/${id}`); },
    async create(data)     { return apiFetch(resourcePath, { method: 'POST',  body: JSON.stringify(data) }); },
    async update(id, data) { return apiFetch(`${resourcePath}/${id}`, { method: 'PATCH', body: JSON.stringify(data) }); },
    async delete(id)       { return apiFetch(`${resourcePath}/${id}`, { method: 'DELETE' }); },
  };
}

// ── Entities ──────────────────────────────────────────────────────────────────

const entities = {
  EmailCase: makeEntity('/cases'),
  Alert:     makeEntity('/alerts'),
};

// ── Functions ─────────────────────────────────────────────────────────────────

const functions = {
  /**
   * Full forensic analysis pipeline (web app).
   * ML models → Gemini summary → saves Case + Alert to DB.
   * @param {{ raw_email: string }} payload
   */
  async analyzeEmail(payload) {
    const result = await apiFetch('/analyze', {
      method: 'POST',
      body:   JSON.stringify(payload),
    });
    // Backend returns { case, geolocation, analysis }
    // We expose all three so the frontend can read case.id for graph correlation
    return {
      data: {
        case:        result.case       ?? null,
        analysis:    result.analysis   ?? result.case ?? result,
        geolocation: result.geolocation ?? {},
      },
    };
  },

  /**
   * Fast ML-only analysis for the Chrome extension (<300ms).
   * No Gemini, no DB save — returns threat_level + fraud_score instantly.
   * @param {{ raw_email: string }} payload
   */
  async analyzeQuick(payload) {
    return apiFetch('/analyze/quick', {
      method: 'POST',
      body:   JSON.stringify(payload),
    });
  },

  /**
   * Quick Gemini NLP pre-screen directly from the browser.
   * Useful for instant feedback before the full backend pipeline.
   * @param {string} emailText
   * @returns {{ verdict: string, confidence: number, indicators: string[], summary: string }}
   */
  async quickThreatScreen(emailText) {
    const system = `You are an email security analyst. Analyze the provided email text for phishing, 
spoofing, social engineering, BEC, and fraud indicators. 
Respond ONLY with valid JSON in this exact shape:
{
  "verdict": "legitimate|suspicious|phishing|fraud",
  "confidence": 0.0-1.0,
  "indicators": ["list", "of", "red", "flags"],
  "summary": "one sentence explanation"
}`;
    const raw   = await geminiGenerate(emailText, system);
    const clean = raw.replace(/```json|```/g, '').trim();
    try {
      return JSON.parse(clean);
    } catch {
      return { verdict: 'unknown', confidence: 0, indicators: [], summary: raw };
    }
  },

  /**
   * Get graph correlation data for a saved case.
   * Returns nodes, edges, related cases, and campaign membership.
   * @param {string} caseId
   */
  async getGraphData(caseId) {
    return apiFetch(`/graph/${caseId}`);
  },

  /**
   * Get lightweight related-cases report for a case (no full graph).
   * Used by CaseDetail sidebar.
   * @param {string} caseId
   */
  async getRelatedCases(caseId) {
    return apiFetch(`/graph/${caseId}/related`);
  },

  /**
   * Get all detected campaigns across the user's case history.
   * Used by the Dashboard and a future Campaigns page.
   */
  async getAllCampaigns() {
    return apiFetch('/graph');
  },

  /**
   * Ask Gemini to summarise a forensic report in plain language.
   * @param {object} reportData
   * @returns {string}
   */
  async summariseReport(reportData) {
    const reportPrompt = `Summarise this email forensic report for a non-technical stakeholder in 3-4 sentences. 
Highlight the key threat, confidence level, and recommended action.

Report data:
${JSON.stringify(reportData, null, 2)}`;
    return geminiGenerate(reportPrompt);
  },
};

// ── Export ────────────────────────────────────────────────────────────────────

export const api = { entities, functions, geminiGenerate };