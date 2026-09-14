import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ScanSearch, ArrowRight, ShieldAlert, MapPin, Server } from 'lucide-react';

const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] },
});

export default function Hero() {
  return (
    <section className="relative overflow-hidden pt-32 pb-24 px-6">
      {/* animated background orbs */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-10 -left-20 w-[28rem] h-[28rem] bg-cyan-500/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-40 right-0 w-[32rem] h-[32rem] bg-blue-600/20 rounded-full blur-[140px] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute bottom-0 left-1/3 w-[24rem] h-[24rem] bg-purple-600/10 rounded-full blur-[120px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b33_1px,transparent_1px),linear-gradient(to_bottom,#1e293b33_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
      </div>

      <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <motion.div {...fade(0)} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/10 ring-1 ring-cyan-500/30 text-cyan-300 text-xs font-medium mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            AI-Powered Forensic Intelligence
          </motion.div>

          <motion.h1 {...fade(0.08)} className="text-4xl md:text-6xl font-semibold tracking-tight leading-[1.05]">
            Trace every threat.
            <br />
            <span className="bg-gradient-to-r from-cyan-300 via-blue-400 to-purple-400 bg-clip-text text-transparent">Unmask every sender.</span>
          </motion.h1>

          <motion.p {...fade(0.16)} className="mt-6 text-lg text-slate-400 max-w-xl leading-relaxed">
            Detect phishing, spoofing, and business email compromise in real time — then reconstruct the relay path, geolocate the origin, and generate forensic intelligence that leads back to the actor.
          </motion.p>

          <motion.div {...fade(0.24)} className="mt-8 flex flex-wrap items-center gap-4">
            <Link to="/register" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-medium transition shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:-translate-y-0.5">
              <ScanSearch className="w-4 h-4" /> Start analyzing
            </Link>
            <a href="#how" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-slate-700 hover:border-slate-500 text-slate-200 font-medium transition">
              See how it works <ArrowRight className="w-4 h-4" />
            </a>
          </motion.div>

          <motion.div {...fade(0.32)} className="mt-10 flex items-center gap-6 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><ShieldAlert className="w-3.5 h-3.5 text-cyan-400" /> SPF / DKIM / DMARC</span>
            <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-cyan-400" /> IP Geolocation</span>
            <span className="flex items-center gap-1.5"><Server className="w-3.5 h-3.5 text-cyan-400" /> Relay tracing</span>
          </motion.div>
        </div>

        {/* mock scan card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="relative"
        >
          <div className="absolute -inset-4 bg-gradient-to-br from-cyan-500/20 to-purple-500/20 rounded-3xl blur-2xl" />
          <div className="relative rounded-2xl border border-slate-800 bg-slate-900/80 backdrop-blur-xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                <div className="w-2.5 h-2.5 rounded-full bg-amber-400/80" />
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400/80" />
              </div>
              <span className="text-xs text-slate-500 font-mono">forensic-scan.log</span>
            </div>

            <div className="flex items-center gap-4 mb-5">
              <div className="relative w-20 h-20">
                <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="34" fill="none" stroke="#1e293b" strokeWidth="6" />
                  <motion.circle cx="40" cy="40" r="34" fill="none" stroke="#ef4444" strokeWidth="6" strokeLinecap="round"
                    strokeDasharray={213.6} initial={{ strokeDashoffset: 213.6 }} animate={{ strokeDashoffset: 213.6 - (213.6 * 0.94) }}
                    transition={{ duration: 1.4, delay: 0.6, ease: 'easeOut' }} />
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

            <div className="space-y-2.5 text-xs">
              {[
                ['Lookalike domain', 'financiaI-dept.com', 'text-red-400'],
                ['Reply-To redirect', 'secure-payportal.xyz', 'text-amber-400'],
                ['Origin IP', '198.51.100.7', 'text-cyan-400'],
                ['Geolocation', 'Moscow, RU', 'text-slate-300'],
                ['Relay hops', '3 (spoofed)', 'text-amber-400'],
              ].map(([k, v, c], i) => (
                <motion.div key={k} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.8 + i * 0.12 }}
                  className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-950/50">
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
        </motion.div>
      </div>
    </section>
  );
}