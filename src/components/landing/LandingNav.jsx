import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Menu, X } from 'lucide-react';

const links = [
  { href: '#features', label: 'Capabilities' },
  { href: '#how', label: 'How it works' },
  { href: '#threats', label: 'Threat coverage' },
];

export default function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? 'bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/60' : 'bg-transparent'}`}>
      <nav className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/30 group-hover:scale-105 transition">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <span className="font-semibold tracking-tight text-lg">Sentinel</span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {links.map(l => (
            <a key={l.href} href={l.href} className="text-sm text-slate-400 hover:text-slate-100 transition">{l.label}</a>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <Link to="/login" className="text-sm text-slate-300 hover:text-white px-4 py-2 transition">Sign in</Link>
          <Link to="/register" className="text-sm font-medium px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition">Get started</Link>
        </div>

        <button className="md:hidden text-slate-300" onClick={() => setOpen(!open)}>
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </nav>

      {open && (
        <div className="md:hidden border-t border-slate-800/60 bg-slate-950/95 backdrop-blur-xl px-6 py-4 space-y-3">
          {links.map(l => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block text-sm text-slate-400 hover:text-slate-100">{l.label}</a>
          ))}
          <div className="flex gap-3 pt-2">
            <Link to="/login" className="flex-1 text-center text-sm px-4 py-2 rounded-lg border border-slate-700 text-slate-200">Sign in</Link>
            <Link to="/register" className="flex-1 text-center text-sm font-medium px-4 py-2 rounded-lg bg-cyan-500 text-slate-950">Get started</Link>
          </div>
        </div>
      )}
    </header>
  );
}