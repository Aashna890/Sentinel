// ─────────────────────────────────────────────────────────────────────────────
// OAuthCallback.jsx
// Landing page for the Google OAuth redirect.
//
// Full flow:
//   1. User clicks "Continue with Google" → auth.startGoogleOAuth()
//   2. Browser goes to Google sign-in
//   3. Google redirects to: GET /auth/google/callback?code=<code> (backend)
//   4. Backend exchanges code → gets user info → creates JWT →
//      redirects to: /auth/callback?token=<JWT>&returnTo=<path>
//   5. THIS PAGE reads token + returnTo, stores the JWT, redirects into app
//
// Add this route in your router:
//   <Route path="/auth/callback" element={<OAuthCallback />} />
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { auth } from '@/api/authClient';
import { Loader2, AlertTriangle } from 'lucide-react';

export default function OAuthCallback() {
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      // Reads ?token= and ?returnTo= from the URL, stores the JWT, returns path
      const returnTo = auth.handleOAuthCallback();
      window.location.href = returnTo;
    } catch (err) {
      setError(err.message || 'Google sign-in failed. Please try again.');
    }
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-slate-950">
        <div className="text-center max-w-sm">
          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-4" />
          <h1 className="text-lg font-semibold text-slate-100 mb-2">Sign-in failed</h1>
          <p className="text-sm text-slate-400 mb-6">{error}</p>
          <a
            href="/login"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm text-slate-200 transition"
          >
            ← Back to login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="text-center">
        <Loader2 className="w-8 h-8 text-cyan-400 animate-spin mx-auto mb-3" />
        <p className="text-sm text-slate-400">Completing sign-in…</p>
      </div>
    </div>
  );
}