// ─────────────────────────────────────────────────────────────────────────────
// OAuthConsent.jsx
// MCP OAuth consent page — shown when an AI client (e.g. Claude, Cursor)
// wants to access this app on behalf of the signed-in user.
//
// Flow overview:
//  1. The MCP server redirects the AI client here with an opaque `ctx` handle.
//     The handle encodes the authorization request server-side; only the server
//     knows what it contains.
//  2. We fetch /consent-info?handle=<ctx> to:
//     a) Verify the handle is still valid.
//     b) Check whether the current user is authenticated (via cookie/session).
//     c) Get the list of tools the client is requesting access to.
//  3. If the user is not authenticated, we redirect them to login, passing
//     `returnTo` so they land back here after signing in.
//  4. Once authenticated, we show them the tool list and Approve / Deny buttons.
//  5. Clicking either sends a POST to /authorize-grant and we follow the
//     redirect_url the server returns (which closes the OAuth loop).
//
// Do NOT change the fetch calls, headers, or `ctx` handle logic.
// Styling and copy are safe to edit.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { appParams } from '@/lib/app-params';
import { Button }    from '@/components/ui/button';
import { ShieldCheck, Loader2 } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';

export default function OAuthConsent() {
  // The opaque authorization handle sent by the MCP server in the URL
  const ctx = new URLSearchParams(window.location.search).get('ctx');

  // Consent info returned by /consent-info (client name, app name, tool list)
  const [info, setInfo]           = useState(null);
  // True while we're waiting for /consent-info to respond
  const [checking, setChecking]   = useState(true);
  // True while an Approve or Deny request is in-flight
  const [submitting, setSubmitting] = useState(false);
  // Set to 'approve' or 'deny' after the server redirects (custom-scheme clients)
  const [decided, setDecided]     = useState('');
  // Generic error message shown to the user
  const [error, setError]         = useState('');
  // Terminal reconnect message — shown when the handle is permanently consumed
  const [reconnect, setReconnect] = useState('');

  // ── Step 1: resolve the handle and check session ──────────────────────────

  useEffect(() => {
    (async () => {
      let redirecting = false;
      try {
        if (!ctx) {
          setError('This authorization link is invalid or has expired.');
          return;
        }

        // Build headers — include the Bearer token if we have one,
        // so the server can list the already-granted tools for signed-in users.
        // Cookie-backed sessions don't need it, but sending it when available
        // makes the response richer.
        const infoHeaders = {};
        if (appParams.token) infoHeaders.Authorization = 'Bearer ' + appParams.token;

        const res = await fetch(
          `/api/apps/${appParams.appId}/mcp/consent-info?handle=${encodeURIComponent(ctx)}`,
          { credentials: 'include', headers: infoHeaders },
        );

        if (!res.ok) {
          setError('This authorization link is invalid or has expired.');
          return;
        }

        const data = await res.json();

        // Trust the server's authentication verdict, not a local token check.
        // A cookie-only session would appear logged-out to a client-side check,
        // but the server correctly authenticated it above via the cookie fallback.
        if (!data.authenticated) {
          // Rebuild the return URL from `ctx` only — never forward the full
          // window.location.search because crafted extras (access_token, etc.)
          // would persist through the login round-trip.
          const returnTo  = window.location.pathname + '?ctx=' + encodeURIComponent(ctx);
          const encoded   = encodeURIComponent(returnTo);
          redirecting     = true; // keep the spinner while the browser navigates
          window.location.href =
            (data.login_path || '/login') + '?returnTo=' + encoded + '&from_url=' + encoded;
          return;
        }

        setInfo(data);
      } catch {
        setError('Could not load this authorization request. Please try again.');
      } finally {
        if (!redirecting) setChecking(false);
      }
    })();
  }, [ctx]);

  // ── Step 2: send Approve or Deny to the server ────────────────────────────

  const respond = async (action) => {
    setSubmitting(true);
    setError('');
    try {
      const headers = { 'Content-Type': 'application/json' };
      // Only add Authorization when a token exists — "Bearer null" would
      // shadow a valid cookie, breaking cookie-only sessions.
      if (appParams.token) headers.Authorization = 'Bearer ' + appParams.token;

      const res = await fetch(`/api/apps/${appParams.appId}/mcp/authorize-grant`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ ctx, action }),
      });

      if (!res.ok) {
        if (res.status === 401) {
          // Session expired before the handle was spent — send the user back
          // through login so they can try again with a fresh session.
          const returnTo = window.location.pathname + '?ctx=' + encodeURIComponent(ctx);
          const encoded  = encodeURIComponent(returnTo);
          window.location.href =
            ((info && info.login_path) || '/login') + '?returnTo=' + encoded + '&from_url=' + encoded;
          return;
        }

        if ([400, 403, 404, 409].includes(res.status)) {
          // These codes all mean the handle was atomically consumed and can't be
          // retried. Tell the user to reconnect from their AI client.
          let detail = '';
          try { detail = (await res.json()).detail; } catch { /* keep default */ }
          setReconnect(
            detail || 'This authorization can no longer be completed. Reconnect from your AI client to try again.',
          );
          setSubmitting(false);
          return;
        }

        throw new Error('Could not complete authorization. Please try again.');
      }

      const data = await res.json();
      window.location.href = data.redirect_url;

      // Some AI clients use a custom URL scheme (e.g. cursor://).
      // Browsers may not visibly navigate those, so we show a terminal state
      // instead of leaving the user on an eternal spinner.
      if (!/^https?:/i.test(data.redirect_url)) {
        setDecided(action);
        setSubmitting(false);
      }
    } catch (e) {
      setError(e.message);
      setSubmitting(false);
    }
  };

  // ── Render states ─────────────────────────────────────────────────────────

  // Still loading consent info
  if (checking) {
    return (
      <AuthLayout icon={ShieldCheck} title="Authorize access">
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <Loader2 className="w-5 h-5 mr-2 animate-spin" aria-hidden="true" />
          Loading…
        </div>
      </AuthLayout>
    );
  }

  const client  = (info && info.client_name) || 'An AI client';
  const appName = (info && info.app_name)    || 'this app';

  // Decision completed (Approve or Deny was accepted by the server)
  if (decided) {
    return (
      <AuthLayout
        icon={ShieldCheck}
        title={decided === 'approve' ? 'Access granted' : 'Access denied'}
        subtitle={`You can return to ${client} and close this window.`}
      />
    );
  }

  // Terminal error — handle consumed, can't retry, must reconnect
  if (reconnect) {
    return (
      <AuthLayout icon={ShieldCheck} title="Reconnect required">
        <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {reconnect}
        </div>
      </AuthLayout>
    );
  }

  // Hard error before we have any consent info — show only the error, no buttons
  if (error && !info) {
    return (
      <AuthLayout icon={ShieldCheck} title="Authorize access">
        <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      </AuthLayout>
    );
  }

  const tools = Array.isArray(info?.tools) ? info.tools : [];

  // Main consent screen — lists the requested tools and shows Approve / Deny
  return (
    <AuthLayout
      icon={ShieldCheck}
      title="Authorize access"
      subtitle={`${client} wants to access ${appName} on your behalf`}
    >
      {/* Soft error (e.g. a retry after a transient failure) — still show buttons */}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Tool list the AI client is requesting access to */}
      <p className="text-sm font-medium text-foreground mb-2">
        {tools.length ? `It will be able to use these tools in ${appName}:` : 'No tools requested'}
      </p>
      {tools.length > 0 && (
        <ul className="space-y-2 text-sm mb-6">
          {tools.map(tool => (
            <li key={tool.name} className="flex flex-col">
              <span className="text-foreground font-medium">
                {tool.title || tool.name}
              </span>
              {tool.description && (
                <span className="text-muted-foreground">{tool.description}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Approve / Deny action buttons */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          className="flex-1 h-12 font-medium"
          disabled={submitting}
          onClick={() => respond('deny')}
        >
          Deny
        </Button>
        <Button
          className="flex-1 h-12 font-medium"
          disabled={submitting}
          onClick={() => respond('approve')}
        >
          {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Approve
        </Button>
      </div>
    </AuthLayout>
  );
}