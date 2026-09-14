// ─────────────────────────────────────────────────────────────────────────────
// Register.jsx
// Account creation page.
//
// Flow (email/password):
//   Fill form → POST /auth/register → backend creates user + returns JWT
//   immediately → store JWT → redirect to app.
//   (No OTP step — the backend does not send a verification email.)
//
// Flow (Google):
//   Click "Continue with Google" → redirects to Google sign-in → Google
//   redirects to backend → backend creates/upserts user → JWT returned.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { auth } from '@/api/authClient';
import { Button } from '@/components/ui/button';
import { Input }  from '@/components/ui/input';
import { Label }  from '@/components/ui/label';
import { UserPlus, Mail, Lock, User, Loader2 } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import GoogleIcon from '@/components/GoogleIcon';

// Same safe returnTo helper as Login.jsx
function safeReturnTo() {
  try {
    const raw = new URLSearchParams(window.location.search).get('returnTo') ?? '/dashboard';
    const url = new URL(raw, window.location.origin);
    return url.origin === window.location.origin ? url.pathname + url.search : '/';
  } catch {
    return '/';
  }
}

export default function Register() {
  const [fullName, setFullName]               = useState('');
  const [email, setEmail]                     = useState('');
  const [password, setPassword]               = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError]                     = useState('');
  const [loading, setLoading]                 = useState(false);

  const returnTo = safeReturnTo();

  // ── Email + password registration ─────────────────────────────────────────

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Client-side validation before hitting the network
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      // POST /auth/register → { token, user }
      // auth.register() stores the JWT automatically on success
      await auth.register({ email, password, full_name: fullName });
      // Redirect into the app — user is now fully authenticated
      window.location.href = returnTo;
    } catch (err) {
      // Server errors like "Email already registered" (409) show here
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Google OAuth ──────────────────────────────────────────────────────────

  const handleGoogle = () => {
    auth.startGoogleOAuth(returnTo);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AuthLayout
      icon={UserPlus}
      title="Create your account"
      subtitle="Sign up to get started"
      footer={
        <>
          Already have an account?{' '}
          <Link
            to={'/login' + (returnTo !== '/dashboard' ? '?returnTo=' + encodeURIComponent(returnTo) : '')}
            className="text-primary font-medium hover:underline"
          >
            Log in
          </Link>
        </>
      }
    >
      {/* Google OAuth */}
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

      {/* Error from register() or client-side validation */}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Full name (optional but stored on the user record) */}
        <div className="space-y-2">
          <Label htmlFor="fullName">Full name</Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden />
            <Input
              id="fullName" type="text" autoComplete="name" autoFocus
              placeholder="Jane Smith"
              value={fullName} onChange={e => setFullName(e.target.value)}
              className="pl-10 h-12"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden />
            <Input
              id="email" type="email" autoComplete="email"
              placeholder="you@example.com"
              value={email} onChange={e => setEmail(e.target.value)}
              className="pl-10 h-12" required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden />
            <Input
              id="password" type="password" autoComplete="new-password"
              placeholder="Min. 8 characters"
              value={password} onChange={e => setPassword(e.target.value)}
              className="pl-10 h-12" required minLength={8}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden />
            <Input
              id="confirm" type="password" autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
              className="pl-10 h-12" required
            />
          </div>
        </div>

        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading
            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating account...</>
            : 'Create account'}
        </Button>
      </form>
    </AuthLayout>
  );
}