import { Toaster } from '@/components/ui/toaster';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from '@/components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/AppLayout';
import OAuthCallback  from '@/pages/OAuthCallback';
// Pages
import Landing      from '@/pages/Landing';
import Dashboard    from '@/pages/Dashboard';
import AnalyzeEmail from '@/pages/AnalyzeEmail';
import Cases        from '@/pages/Cases';
import CaseDetail   from '@/pages/CaseDetail';
import Alerts       from '@/pages/Alerts';
import ModelMetrics from '@/pages/ModelMetrics';
import Login        from '@/pages/Login';
import Register     from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword  from '@/pages/ResetPassword';
import PageNotFound   from '@/pages/PageNotFound';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-950">
        <div className="w-8 h-8 border-4 border-slate-700 border-t-cyan-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') return <UserNotRegisteredError />;
    if (authError.type === 'auth_required') { navigateToLogin(); return null; }
  }

  return (
    <Routes>
      {/* Public */}
      <Route path="/"                element={<Landing />} />
      <Route path="/login"           element={<Login />} />
      <Route path="/register"        element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password"  element={<ResetPassword />} />
      <Route path="/auth/callback"  element={<OAuthCallback />} />  {/* ← ADD THIS */}
      {/* Protected */}
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard"   element={<Dashboard />} />
          <Route path="/analyze"     element={<AnalyzeEmail />} />
          <Route path="/cases"       element={<Cases />} />
          <Route path="/cases/:id"   element={<CaseDetail />} />
          <Route path="/alerts"      element={<Alerts />} />
          <Route path="/metrics"     element={<ModelMetrics />} />
        </Route>
      </Route>

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}