import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';

export default function PageNotFound() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-100 gap-6">
      <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center">
        <ShieldAlert className="w-8 h-8 text-cyan-400" />
      </div>
      <div className="text-center">
        <h1 className="text-5xl font-bold mb-2">404</h1>
        <p className="text-slate-400">This page doesn't exist or you don't have access to it.</p>
      </div>
      <Link
        to="/dashboard"
        className="px-5 py-2.5 rounded-lg bg-cyan-500/10 text-cyan-300 ring-1 ring-cyan-500/30 hover:bg-cyan-500/20 transition text-sm"
      >
        Back to Dashboard
      </Link>
    </div>
  );
}