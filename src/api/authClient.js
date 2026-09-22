// authClient.js — Sentinel Frontend Auth Client

const TOKEN_KEY  = 'sentinel_access_token';
const API_BASE   = import.meta.env.VITE_API_BASE_URL ?? '/api';
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8000';

export function getAccessToken()      { return localStorage.getItem(TOKEN_KEY) ?? null; }
export function setAccessToken(token) { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY); }
export function clearAccessToken()    { localStorage.removeItem(TOKEN_KEY); }

// ── Internal fetch — path should NOT include /api prefix (API_BASE has it) ──
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
    const err = new Error(data.detail ?? data.message ?? data.error ?? res.statusText);
    err.status = res.status;
    err.data   = data;
    throw err;
  }

  if (res.status === 204) return null;
  return res.json();
}

export const auth = {

  async login({ email, password }) {
    const data = await apiFetch('/auth/login', {       // ← no /api prefix
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (data?.token) setAccessToken(data.token);
    return data;
  },

  async register({ email, password, full_name = '' }) {
    const data = await apiFetch('/auth/register', {    // ← no /api prefix
      method: 'POST',
      body: JSON.stringify({ email, password, full_name }),
    });
    if (data?.token) setAccessToken(data.token);
    return data;
  },

  // Google OAuth — must go directly to backend (not through Vite proxy)
  // because it's a browser redirect, not a fetch() call
  loginWithProvider(provider, returnTo = '/dashboard') {
    const url = new URL(`/api/auth/${provider}/redirect`, BACKEND_URL);
    if (returnTo) url.searchParams.set('returnTo', returnTo);
    window.location.href = url.toString();
  },

  startGoogleOAuth(returnTo = '/dashboard') {
    this.loginWithProvider('google', returnTo);
  },

  handleOAuthCallback() {
    const params   = new URLSearchParams(window.location.search);
    const token    = params.get('token');
    const returnTo = params.get('returnTo') ?? '/dashboard';

    if (!token) {
      throw new Error('No authentication token received from Google. Please try again.');
    }

    setAccessToken(token);

    try {
      const url = new URL(returnTo, window.location.origin);
      return url.origin === window.location.origin
        ? url.pathname + url.search
        : '/dashboard';
    } catch {
      return '/dashboard';
    }
  },

  setToken(token) { setAccessToken(token); },

  async me() { return apiFetch('/auth/me'); },           // ← no /api prefix

  async forgotPassword({ email }) {
    return apiFetch('/auth/forgot-password', {           // ← no /api prefix
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  async resetPassword({ token, password }) {
    return apiFetch('/auth/reset-password', {            // ← no /api prefix
      method: 'POST',
      body: JSON.stringify({ token, password }),
    });
  },

  logout(redirectTo = '/login') {
    clearAccessToken();
    if (redirectTo) window.location.href = redirectTo;
  },

  redirectToLogin(returnTo) {
    if (!returnTo) {
      const current = new URL(window.location.href);
      current.searchParams.delete('returnTo');
      returnTo = current.pathname === '/login'
        ? '/dashboard'
        : current.pathname + current.search;
    }
    if (returnTo.includes('/login')) returnTo = '/dashboard';
    const loginUrl = new URL('/login', window.location.origin);
    loginUrl.searchParams.set('returnTo', returnTo);
    window.location.href = loginUrl.toString();
  },
};

export const app = {
  async getPublicSettings() {
    return apiFetch('/app/public-settings');             // ← no /api prefix
  },
};

export const sentinel = { auth, app };