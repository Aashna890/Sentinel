// ─────────────────────────────────────────────────────────────────────────────
// Login.jsx
// Sign-in page. Supports:
//   • Email + password  → POST /auth/login → JWT stored → redirect
//   • Google OAuth 2.0  → redirects to Google → Google redirects to
//                         /auth/google/callback on your backend →
//                         backend redirects to /auth/callback?token=<JWT>
//
// After login the user lands on `returnTo` (same-origin path from ?returnTo=)
// so deep links work correctly.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { auth } from '@/api/authClient';
import { Button } from '@/components/ui/button';
import { Input }  from '@/components/ui/input';
import { Label }  from '@/components/ui/label';
import { LogIn, Mail, Lock, Loader2 } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import GoogleIcon from '@/components/GoogleIcon';

// ── Safe returnTo helper ──────────────────────────────────────────────────────
// Only follow same-origin paths to prevent open-redirect attacks
function safeReturnTo() {
  try {
    const raw = new URLSearchParams(window.location.search).get('returnTo') ?? '/dashboard';
    const url = new URL(raw, window.location.origin);
    return url.origin === window.location.origin ? url.pathname + url.search : '/';
  } catch {
    return '/';
  }
}

export default function Login() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const returnTo = safeReturnTo();

  // ── Email + password ──────────────────────────────────────────────────────

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // POST /auth/login → { token, user }
      // auth.login() stores the JWT automatically
      await auth.login({ email, password });
      window.location.href = returnTo;
    } catch (err) {
      // The improved apiFetch gives us the server's detail field,
      // e.g. "Invalid email or password" instead of a generic "Unauthorized"
      setError(err.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  // ── Google OAuth 2.0 ──────────────────────────────────────────────────────

  const handleGoogle = () => {
    // Redirects browser to Google's sign-in page.
    // Requires VITE_GOOGLE_CLIENT_ID in .env.
    // After sign-in: Google → backend /auth/google/callback → /auth/callback?token=<JWT>
    auth.startGoogleOAuth(returnTo);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AuthLayout
      icon={LogIn}
      title="Welcome back"
      subtitle="Log in to your account"
      footer={
        <>
          Don't have an account?{' '}
          <Link
            to={'/register' + (returnTo !== '/dashboard' ? '?returnTo=' + encodeURIComponent(returnTo) : '')}
            className="text-primary font-medium hover:underline"
          >
            Create one
          </Link>
        </>
      }
    >
      {/* Google OAuth button */}
      <Button
        type="button"
        variant="outline"
        className="w-full h-12 text-sm font-medium mb-6"
        onClick={handleGoogle}
      >
        <GoogleIcon className="w-5 h-5 mr-2" />
        Continue with Google
      </Button>

      {/* Divider */}
      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-3 text-muted-foreground">or</span>
        </div>
      </div>

      {/* Error message from login() */}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden />
            <Input
              id="email" type="email" autoComplete="email" autoFocus
              placeholder="you@example.com"
              value={email} onChange={e => setEmail(e.target.value)}
              className="pl-10 h-12" required
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/forgot-password" className="text-xs text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden />
            <Input
              id="password" type="password" autoComplete="current-password"
              placeholder="••••••••"
              value={password} onChange={e => setPassword(e.target.value)}
              className="pl-10 h-12" required
            />
          </div>
        </div>

        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading
            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Logging in...</>
            : 'Log in'}
        </Button>
      </form>
    </AuthLayout>
  );
}