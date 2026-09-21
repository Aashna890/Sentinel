import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ScanSearch, ArrowRight, ShieldAlert, MapPin, Server, Sparkles, Activity, Globe2 } from 'lucide-react';

const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] },
});

export default function Hero() {
  return (
    <section className="relative overflow-hidden pt-36 pb-28 px-6">
      {/* aurora mesh background */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[40rem] h-[40rem] bg-cyan-500/20 rounded-full blur-[140px] animate-pulse" />
        <div className="absolute top-20 right-0 w-[36rem] h-[36rem] bg-indigo-600/20 rounded-full blur-[150px] animate-pulse" style={{ animationDelay: '1.2s' }} />
        <div className="absolute bottom-0 left-1/3 w-[28rem] h-[28rem] bg-fuchsia-600/15 rounded-full blur-[130px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.04)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_at_top,black,transparent_75%)]" />
      </div>

      <div className="max-w-7xl mx-auto grid lg:grid-cols-[1.05fr_1fr] gap-14 items-center">
        <div>
          <motion.div {...fade(0)} className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/5 ring-1 ring-white/15 backdrop-blur text-cyan-300 text-xs font-medium mb-7">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            AI forensic intelligence · 2026
            <span className="w-1 h-1 rounded-full bg-cyan-400" />
          </motion.div>

          <motion.h1 {...fade(0.08)} className="text-5xl md:text-7xl font-semibold tracking-tight leading-[1.02]">
            Trace every threat.
            <br />
            <span className="bg-gradient-to-r from-cyan-300 via-blue-400 to-fuchsia-400 bg-clip-text text-transparent">Unmask every sender.</span>
          </motion.h1>

          <motion.p {...fade(0.16)} className="mt-7 text-lg text-slate-400 max-w-xl leading-relaxed">
            Detect phishing, spoofing, and business email compromise in real time — then reconstruct the relay path, geolocate the origin, and generate forensic intelligence that leads back to the actor.
          </motion.p>

          <motion.div {...fade(0.24)} className="mt-9 flex flex-wrap items-center gap-3">
            <Link to="/register" className="group inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-semibold transition shadow-xl shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:-translate-y-0.5">
              <ScanSearch className="w-4 h-4" /> Start analyzing
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition" />
            </Link>
            <a href="#how" className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl border border-white/15 hover:border-white/30 bg-white/5 hover:bg-white/10 text-slate-100 font-medium transition backdrop-blur">
              See how it works
            </a>
          </motion.div>

          <motion.div {...fade(0.32)} className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><ShieldAlert className="w-3.5 h-3.5 text-cyan-400" /> SPF / DKIM / DMARC</span>
            <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-cyan-400" /> IP Geolocation</span>
            <span className="flex items-center gap-1.5"><Server className="w-3.5 h-3.5 text-cyan-400" /> Relay tracing</span>
            <span className="flex items-center gap-1.5"><Globe2 className="w-3.5 h-3.5 text-cyan-400" /> Attribution</span>
          </motion.div>
        </div>

        {/* forensic terminal mock with imagery backdrop */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="relative"
        >
          <div className="absolute -inset-6 bg-gradient-to-br from-cyan-500/20 via-blue-500/10 to-fuchsia-500/20 rounded-[2rem] blur-3xl" />
          <div className="relative rounded-3xl border border-white/10 bg-slate-900/70 backdrop-blur-2xl overflow-hidden shadow-2xl shadow-black/50">
            {/* terminal header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-amber-400/80" />
                <div className="w-3 h-3 rounded-full bg-emerald-400/80" />
              </div>
              <span className="text-[11px] text-slate-500 font-mono flex items-center gap-1.5"><Activity className="w-3 h-3 text-cyan-400" /> forensic-scan.live</span>
            </div>

            {/* imagery strip */}
            <div className="relative h-28 overflow-hidden border-b border-white/10">
              <img src="https://images.unsplash.com/photo-1550751827-4bd374c318a2?auto=format&fit=crop&w=900&q=80" alt="Cyber threat visualization" className="w-full h-full object-cover opacity-60" />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent" />
              <div className="absolute bottom-3 left-5 right-5 flex items-end justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-cyan-400/80">Live analysis</div>
                  <div className="text-sm font-medium text-white">BEC · Wire fraud</div>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-500/20 ring-1 ring-red-500/40 text-red-300 text-[10px] font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" /> critical
                </div>
              </div>
            </div>

            {/* scan body */}
            <div className="p-5">
              <div className="flex items-center gap-4 mb-5">
                <div className="relative w-20 h-20">
                  <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="34" fill="none" stroke="#1e293b" strokeWidth="6" />
                    <motion.circle cx="40" cy="40" r="34" fill="none" stroke="#ef4444" strokeWidth="6" strokeLinecap="round"
                      strokeDasharray={213.6} initial={{ strokeDashoffset: 213.6 }} animate={{ strokeDashoffset: 213.6 - (213.6 * 0.94) }}
                      transition={{ duration: 1.4, delay: 0.7, ease: 'easeOut' }} />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center text-xl font-semibold text-red-400">94</div>
                </div>
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/15 text-red-400 text-xs font-medium ring-1 ring-red-500/30">
                    <ShieldAlert className="w-3 h-3" /> Fraud
                  </div>
                  <p className="text-sm text-slate-300 mt-2">Business Email Compromise detected</p>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                {[
                  ['Lookalike domain', 'financiaI-dept.com', 'text-red-400'],
                  ['Reply-To redirect', 'secure-payportal.xyz', 'text-amber-400'],
                  ['Origin IP', '198.51.100.7', 'text-cyan-400'],
                  ['Geolocation', 'Moscow, RU', 'text-slate-300'],
                  ['Relay hops', '3 (spoofed)', 'text-amber-400'],
                ].map(([k, v, c], i) => (
                  <motion.div key={k} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.9 + i * 0.1 }}
                    className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/[0.03] border border-white/5">
                    <span className="text-slate-500">{k}</span>
                    <span className={`font-mono ${c}`}>{v}</span>
                  </motion.div>
                ))}
              </div>

              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.6 }}
                className="mt-4 flex items-center gap-2 text-xs text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Forensic report generated
              </motion.div>
            </div>
          </div>

          {/* floating chips */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.1 }}
            className="absolute -left-6 top-1/3 hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900/90 backdrop-blur border border-white/10 shadow-xl text-xs">
            <MapPin className="w-3.5 h-3.5 text-cyan-400" /> Geolocated
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.3 }}
            className="absolute -right-5 bottom-12 hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900/90 backdrop-blur border border-white/10 shadow-xl text-xs">
            <Server className="w-3.5 h-3.5 text-fuchsia-400" /> Relay traced
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}