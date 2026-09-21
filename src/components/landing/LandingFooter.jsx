import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';

export default function LandingFooter() {
  return (
    <footer className="border-t border-white/10 px-6 py-12">
      <div className="max-w-7xl mx-auto grid md:grid-cols-[1.5fr_1fr_1fr] gap-10">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 via-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/30">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-semibold tracking-tight text-lg leading-none">Sentinel</div>
              <div className="text-[11px] text-slate-500 mt-1">Email Forensics Platform</div>
            </div>
          </div>
          <p className="mt-5 text-sm text-slate-500 max-w-sm leading-relaxed">AI-powered email threat detection, geolocation, and forensic intelligence for security teams and investigators.</p>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-500 mb-4">Platform</div>
          <div className="space-y-2.5 text-sm">
            <a href="#features" className="block text-slate-400 hover:text-white transition">Capabilities</a>
            <a href="#how" className="block text-slate-400 hover:text-white transition">Workflow</a>
            <a href="#threats" className="block text-slate-400 hover:text-white transition">Threat coverage</a>
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-500 mb-4">Account</div>
          <div className="space-y-2.5 text-sm">
            <Link to="/login" className="block text-slate-400 hover:text-white transition">Sign in</Link>
            <Link to="/register" className="block text-slate-400 hover:text-white transition">Get started</Link>
          </div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto mt-10 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="text-xs text-slate-600">© {new Date().getFullYear()} Sentinel. Built for forensic investigators.</p>
        <p className="text-xs text-slate-600">Designed for evidentiary standards.</p>
      </div>
    </footer>
  );
}