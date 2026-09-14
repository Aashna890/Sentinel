import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';

export default function LandingFooter() {
  return (
    <footer className="border-t border-slate-800/60 px-6 py-10">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center">
            <ShieldCheck className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold tracking-tight">Sentinel</span>
          <span className="text-xs text-slate-600 ml-2">Email Forensics Platform</span>
        </div>
        <div className="flex items-center gap-6 text-sm text-slate-500">
          <a href="#features" className="hover:text-slate-300 transition">Capabilities</a>
          <a href="#how" className="hover:text-slate-300 transition">How it works</a>
          <Link to="/login" className="hover:text-slate-300 transition">Sign in</Link>
        </div>
        <p className="text-xs text-slate-600">© {new Date().getFullYear()} Sentinel. Built for forensic investigators.</p>
      </div>
    </footer>
  );
}