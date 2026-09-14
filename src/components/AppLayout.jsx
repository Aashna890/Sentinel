import { Outlet, NavLink } from 'react-router-dom';
import { ShieldCheck, LayoutDashboard, ScanSearch, FolderSearch, BellRing, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { sentinel } from '@/api/authClient';

const nav = [
  { to: '/dashboard', label: 'Dashboard',     icon: LayoutDashboard, end: true },
  { to: '/analyze',   label: 'Analyze Email', icon: ScanSearch },
  { to: '/cases',     label: 'Cases',         icon: FolderSearch },
  { to: '/alerts',    label: 'Alerts',        icon: BellRing },
];

export default function AppLayout() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside className="w-64 shrink-0 border-r border-slate-800/80 bg-slate-900/60 backdrop-blur flex flex-col">
        {/* Logo */}
        <div className="px-6 py-6 flex items-center gap-3 border-b border-slate-800/80">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-semibold tracking-tight leading-none">Sentinel</div>
            <div className="text-[11px] text-slate-400 mt-1">Email Forensics</div>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-5 space-y-1">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                  isActive
                    ? 'bg-cyan-500/10 text-cyan-300 ring-1 ring-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                }`
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div className="p-3 border-t border-slate-800/80">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg">
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-medium">
              {(user?.full_name || user?.email || 'A').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium truncate">{user?.full_name || 'Analyst'}</div>
              <div className="text-[11px] text-slate-500 truncate">{user?.email}</div>
            </div>
            <button
              onClick={() => sentinel.auth.logout('/login')}
              className="text-slate-500 hover:text-slate-200 transition"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <main className="flex-1 min-w-0 overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}