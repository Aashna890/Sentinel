import { motion } from 'framer-motion';
import { ShieldAlert, MailWarning, UserCog, FileWarning, Link2, KeyRound } from 'lucide-react';

const threats = [
  { icon: ShieldAlert, label: 'Phishing', desc: 'Deceptive sender identities & malicious links' },
  { icon: MailWarning, label: 'Spoofing', desc: 'Forged sender fields & display-name manipulation' },
  { icon: UserCog, label: 'Impersonation', desc: 'Executive & brand identity spoofing' },
  { icon: FileWarning, label: 'BEC / Wire Fraud', desc: 'Payment diversion & fake invoices' },
  { icon: Link2, label: 'Obfuscated URLs', desc: 'Hidden redirection & relay chains' },
  { icon: KeyRound, label: 'Credential Theft', desc: 'Harvesting via lookalike login pages' },
];

export default function ThreatCoverage() {
  return (
    <section id="threats" className="py-24 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-14">
          <span className="text-xs font-medium uppercase tracking-wider text-cyan-400">Threat coverage</span>
          <h2 className="mt-3 text-3xl md:text-4xl font-semibold tracking-tight">Built for the attacks that evade filters</h2>
          <p className="mt-4 text-slate-400 max-w-2xl mx-auto">
            Static blacklists and signature rules miss what AI-generated language and lookalike domains slip through.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {threats.map((t, i) => (
            <motion.div
              key={t.label}
              initial={{ opacity: 0, scale: 0.96 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: (i % 3) * 0.08 }}
              className="flex items-center gap-4 rounded-xl border border-slate-800 bg-slate-900/40 p-5 hover:bg-slate-900/70 hover:border-red-500/30 transition group"
            >
              <div className="w-11 h-11 rounded-lg bg-red-500/10 flex items-center justify-center group-hover:bg-red-500/20 transition">
                <t.icon className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <div className="font-medium text-slate-100">{t.label}</div>
                <div className="text-sm text-slate-500">{t.desc}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}