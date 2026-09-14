import { motion } from 'framer-motion';
import { ScanSearch, Server, MapPin, Network, ShieldCheck, FileWarning, BellRing, Lock } from 'lucide-react';

const features = [
  { icon: ScanSearch, title: 'Fraudulent Email Detection', desc: 'NLP analysis of subject lines, body text, urgency cues, and impersonation language to classify emails as legitimate, suspicious, phishing, impersonation, or fraud.', color: 'from-cyan-400 to-blue-500' },
  { icon: Server, title: 'Header & Protocol Analysis', desc: 'Deep parsing of Return-Path, Received chains, DKIM signatures, SPF alignment, and DMARC status — detecting forged fields, relay manipulation, and spoofed transmission.', color: 'from-blue-400 to-indigo-500' },
  { icon: MapPin, title: 'Origin Traceability & Geolocation', desc: 'Extract the earliest sending node, map the originating IP to country, city, ISP, and ASN, and flag VPN, TOR, proxy, and cloud-hosted infrastructure.', color: 'from-purple-400 to-fuchsia-500' },
  { icon: Network, title: 'Identity Correlation & Attribution', desc: 'Graph-based correlation of domains, IPs, aliases, and reply chains into a confidence-based assessment of probable sender identity and campaign patterns.', color: 'from-fuchsia-400 to-pink-500' },
  { icon: FileWarning, title: 'BEC Pattern Recognition', desc: 'Detect payment diversion, fake invoice requests, credential harvesting, and executive impersonation before a transaction is ever authorized.', color: 'from-amber-400 to-orange-500' },
  { icon: BellRing, title: 'Real-time Alerting', desc: 'Automatic high-risk alerts generated before user interaction, with severity tiers and direct links into the full forensic case record.', color: 'from-orange-400 to-red-500' },
  { icon: ShieldCheck, title: 'Forensic Reporting', desc: 'Structured reports for institutional action, legal review, cyber incident response, and law enforcement support — with raw source preserved as evidence.', color: 'from-emerald-400 to-teal-500' },
  { icon: Lock, title: 'Privacy & Chain-of-Custody', desc: 'Controlled handling of metadata, evidence preservation, and configurable retention and masking — built for evidentiary standards.', color: 'from-teal-400 to-cyan-500' },
];

export default function FeatureGrid() {
  return (
    <section id="features" className="py-24 px-6 relative">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <motion.span initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="text-xs font-medium uppercase tracking-wider text-cyan-400">Capabilities</motion.span>
          <motion.h2 initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.05 }}
            className="mt-3 text-3xl md:text-4xl font-semibold tracking-tight">A complete forensic intelligence stack</motion.h2>
          <motion.p initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }}
            className="mt-4 text-slate-400 max-w-2xl mx-auto">
            Detection, tracing, attribution, and reporting — unified into a single investigation workflow.
          </motion.p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: (i % 4) * 0.08 }}
              whileHover={{ y: -6 }}
              className="group rounded-2xl border border-slate-800 bg-slate-900/40 p-6 hover:border-slate-700 hover:bg-slate-900/70 transition-all"
            >
              <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform`}>
                <f.icon className="w-5 h-5 text-white" />
              </div>
              <h3 className="font-medium text-slate-100 mb-2">{f.title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}