import { motion } from 'framer-motion';
import { ScanSearch, Server, MapPin, Network, ShieldCheck, FileWarning, BellRing, Lock } from 'lucide-react';

const features = [
  { icon: ScanSearch, title: 'Fraudulent Email Detection', desc: 'NLP analysis of subject lines, body text, urgency cues, and impersonation language to classify emails as legitimate, suspicious, phishing, impersonation, or fraud.', color: 'from-cyan-400 to-blue-500', span: 'lg:col-span-2' },
  { icon: Server, title: 'Header & Protocol Analysis', desc: 'Deep parsing of Return-Path, Received chains, DKIM, SPF alignment, and DMARC — detecting forged fields and relay manipulation.', color: 'from-blue-400 to-indigo-500', span: '' },
  { icon: MapPin, title: 'Origin Geolocation', desc: 'Extract the earliest sending node and map the originating IP to country, city, ISP, and ASN — flagging VPN, TOR, proxy, and cloud infrastructure.', color: 'from-purple-400 to-fuchsia-500', span: '' },
  { icon: Network, title: 'Identity Correlation & Attribution', desc: 'Graph-based correlation of domains, IPs, aliases, and reply chains into a confidence-based assessment of probable sender identity and campaign patterns.', color: 'from-fuchsia-400 to-pink-500', span: 'lg:col-span-2' },
  { icon: FileWarning, title: 'BEC Pattern Recognition', desc: 'Detect payment diversion, fake invoices, credential harvesting, and executive impersonation before a transaction is authorized.', color: 'from-amber-400 to-orange-500', span: '' },
  { icon: BellRing, title: 'Real-time Alerting', desc: 'Automatic high-risk alerts with severity tiers and direct links into the full forensic case record.', color: 'from-orange-400 to-red-500', span: '' },
  { icon: ShieldCheck, title: 'Forensic Reporting', desc: 'Structured reports for institutional action, legal review, incident response, and law enforcement — raw source preserved as evidence.', color: 'from-emerald-400 to-teal-500', span: '' },
  { icon: Lock, title: 'Privacy & Chain-of-Custody', desc: 'Controlled handling of metadata, evidence preservation, and configurable retention and masking — built for evidentiary standards.', color: 'from-teal-400 to-cyan-500', span: '' },
];

export default function FeatureGrid() {
  return (
    <section id="features" className="py-24 px-6 relative">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <motion.span initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 ring-1 ring-cyan-500/20 text-cyan-300 text-xs font-medium uppercase tracking-wider">The platform</motion.span>
          <motion.h2 initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.05 }}
            className="mt-4 text-4xl md:text-5xl font-semibold tracking-tight">A complete forensic intelligence stack</motion.h2>
          <motion.p initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }}
            className="mt-4 text-slate-400 max-w-2xl mx-auto text-lg">
            Detection, tracing, attribution, and reporting — unified into a single investigation workflow.
          </motion.p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: (i % 4) * 0.07 }}
              whileHover={{ y: -6 }}
              className={`group relative rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur p-6 hover:bg-white/[0.06] hover:border-white/20 transition-all overflow-hidden ${f.span}`}
            >
              <div className="absolute -top-px left-6 right-6 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition" />
              <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-5 shadow-lg group-hover:scale-110 transition-transform`}>
                <f.icon className="w-5 h-5 text-white" />
              </div>
              <h3 className="font-semibold text-lg text-slate-50 mb-2">{f.title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}