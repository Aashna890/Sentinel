import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Menu, X, ArrowRight } from 'lucide-react';

const links = [
  { href: '#features', label: 'Platform' },
  { href: '#how', label: 'Workflow' },
  { href: '#threats', label: 'Threats' },
];

export default function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className="fixed top-0 inset-x-0 z-50 px-4 pt-3">
      <nav className={`max-w-6xl mx-auto px-4 h-14 flex items-center justify-between rounded-2xl transition-all duration-300 ${scrolled ? 'bg-slate-950/70 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/40' : 'bg-transparent border border-transparent'}`}>
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 via-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/30 group-hover:scale-105 transition">
            <ShieldCheck className="w-5 h-5 text-white" />
            <div className="absolute inset-0 rounded-xl ring-1 ring-white/20" />
          </div>
          <span className="font-semibold tracking-tight text-lg">Sentinel</span>
        </Link>

        <div className="hidden md:flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
          {links.map(l => (
            <a key={l.href} href={l.href} className="px-4 py-2 text-sm text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition">{l.label}</a>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-2">
          <Link to="/login" className="text-sm text-slate-300 hover:text-white px-4 py-2 transition">Sign in</Link>
          <Link to="/register" className="group inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-xl bg-white text-slate-950 hover:bg-cyan-300 transition">
            Get started <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition" />
          </Link>
        </div>

        <button className="md:hidden text-slate-300 p-1" onClick={() => setOpen(!open)}>
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </nav>

      {open && (
        <div className="md:hidden max-w-6xl mx-auto mt-2 rounded-2xl border border-white/10 bg-slate-950/95 backdrop-blur-xl px-4 py-4 space-y-1">
          {links.map(l => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block px-3 py-2.5 text-sm text-slate-300 hover:text-white hover:bg-white/5 rounded-lg">{l.label}</a>
          ))}
          <div className="flex gap-2 pt-3 border-t border-white/10">
            <Link to="/login" onClick={() => setOpen(false)} className="flex-1 text-center text-sm px-4 py-2.5 rounded-xl border border-white/10 text-slate-200">Sign in</Link>
            <Link to="/register" onClick={() => setOpen(false)} className="flex-1 text-center text-sm font-medium px-4 py-2.5 rounded-xl bg-white text-slate-950">Get started</Link>
          </div>
        </div>
      )}
    </header>
  );
}