import React, { createContext, useState, useContext, useEffect } from 'react';
import { sentinel } from '@/api/authClient';
import { getAccessToken, clearAccessToken } from '@/api/authClient';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser]                           = useState(null);
  const [isAuthenticated, setIsAuthenticated]     = useState(false);
  const [isLoadingAuth, setIsLoadingAuth]         = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError]                 = useState(null);
  const [authChecked, setAuthChecked]             = useState(false);
  const [appPublicSettings, setAppPublicSettings] = useState(null);

  useEffect(() => { checkAppState(); }, []);

  const checkAppState = async () => {
    setIsLoadingPublicSettings(true);
    setAuthError(null);

    // ── 1. Fetch public settings ─────────────────────────────────────────────
    try {
      const publicSettings = await sentinel.app.getPublicSettings();
      setAppPublicSettings(publicSettings);
    } catch (err) {
      // Public settings failing is non-fatal — backend may not implement it yet.
      // Log and continue; don't block the whole app.
      console.warn('[Sentinel] getPublicSettings failed (non-fatal):', err.message);
    }
    setIsLoadingPublicSettings(false);

    // ── 2. Check user auth only if a token exists ────────────────────────────
    const token = getAccessToken();
    if (!token) {
      // No token — user is simply logged out, not an error
      setIsAuthenticated(false);
      setIsLoadingAuth(false);
      setAuthChecked(true);
      return;
    }

    await checkUserAuth();
  };

  const checkUserAuth = async () => {
    setIsLoadingAuth(true);
    try {
      const currentUser = await sentinel.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
      setAuthError(null);
    } catch (error) {
      console.error('[Sentinel] /auth/me failed:', error.status, error.message);

      // 401 / 403 = token expired or invalid — clear it and treat as logged out
      // This must NOT set authError type 'auth_required' because App.jsx would
      // then call navigateToLogin() which triggers the redirect loop.
      if (error.status === 401 || error.status === 403) {
        clearAccessToken();           // remove the bad token
        setUser(null);
        setIsAuthenticated(false);
        // Don't set authError — just let the ProtectedRoute redirect to /login cleanly
      } else {
        // Network error or unexpected server error — still don't hard-crash
        setIsAuthenticated(false);
        console.warn('[Sentinel] Auth check failed with non-auth error:', error.message);
      }
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  };

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    setAuthError(null);
    sentinel.auth.logout(shouldRedirect ? '/login' : null);
  };

  const navigateToLogin = () => {
    // Only called when authError.type === 'auth_required' from App.jsx
    // Our new logic never sets that, so this is a safety fallback only
    sentinel.auth.redirectToLogin();
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      authChecked,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};