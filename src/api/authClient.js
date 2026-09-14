// authClient.js — fixed redirectToLogin to prevent infinite returnTo encoding

const TOKEN_KEY = 'sentinel_access_token';
const API_BASE  = import.meta.env.VITE_API_BASE_URL ?? '/api';

export function getAccessToken()       { return localStorage.getItem(TOKEN_KEY) ?? null; }
export function setAccessToken(token)  { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY); }
export function clearAccessToken()     { localStorage.removeItem(TOKEN_KEY); }

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
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (data?.token) setAccessToken(data.token);
    return data;
  },

  async register({ email, password, full_name = '' }) {
    const data = await apiFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, full_name }),
    });
    if (data?.token) setAccessToken(data.token);
    return data;
  },

  async verifyOtp({ email, otpCode }) {
    const data = await apiFetch('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ email, otp: otpCode }),
    });
    if (data?.token) setAccessToken(data.token);
    return data;
  },

  async resendOtp(email) {
    return apiFetch('/auth/resend-otp', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  loginWithProvider(provider, returnTo = '/dashboard') {
    const base = API_BASE.startsWith('http')
      ? new URL(`/auth/${provider}`, API_BASE)
      : new URL(`${API_BASE}/auth/${provider}`, window.location.origin);
    if (returnTo) base.searchParams.set('returnTo', returnTo);
    window.location.href = base.toString();
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

  async me() { return apiFetch('/auth/me'); },

  async forgotPassword({ email }) {
    return apiFetch('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  async resetPassword({ token, password }) {
    return apiFetch('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    });
  },

  logout(redirectTo = '/login') {
    clearAccessToken();
    if (redirectTo) window.location.href = redirectTo;
  },

  /**
   * Redirect to /login with a safe returnTo param.
   * Strips any existing returnTo from the current URL first so
   * the param never gets double-encoded (which caused HTTP 431).
   */
  redirectToLogin(returnTo) {
    if (!returnTo) {
      // Strip returnTo from the current URL to avoid re-encoding it
      const current = new URL(window.location.href);
      current.searchParams.delete('returnTo');
      // If already on /login, go to /dashboard after auth — not /login again
      returnTo = current.pathname === '/login'
        ? '/dashboard'
        : current.pathname + current.search;
    }

    // Hard-stop: never use a login URL as the returnTo destination
    if (returnTo.includes('/login')) returnTo = '/dashboard';

    const loginUrl = new URL('/login', window.location.origin);
    loginUrl.searchParams.set('returnTo', returnTo);
    window.location.href = loginUrl.toString();
  },
};

export const app = {
  async getPublicSettings() {
    return apiFetch('/app/public-settings');
  },
};

export const sentinel = { auth, app };