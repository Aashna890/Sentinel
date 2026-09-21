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
    <section id="threats" className="py-24 px-6 relative overflow-hidden">
      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-[1fr_1.3fr] gap-12 items-start mb-14">
          <div>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 ring-1 ring-red-500/20 text-red-300 text-xs font-medium uppercase tracking-wider">Threat coverage</span>
            <h2 className="mt-4 text-4xl md:text-5xl font-semibold tracking-tight leading-tight">Built for the attacks that evade filters</h2>
            <p className="mt-5 text-slate-400 text-lg leading-relaxed">
              Static blacklists and signature rules miss what AI-generated language and lookalike domains slip through. Sentinel catches the human-engineered deception in between.
            </p>
          </div>
          <div className="relative rounded-3xl overflow-hidden border border-white/10 h-64 lg:h-full min-h-[16rem]">
            <img src="https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=1000&q=80" alt="Threat intelligence" className="w-full h-full object-cover opacity-70" />
            <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/50 to-transparent" />
            <div className="absolute bottom-5 left-5 right-5">
              <div className="text-xs uppercase tracking-wider text-red-400/80">Adversarial landscape</div>
              <div className="text-lg font-medium text-white mt-1">AI-crafted social engineering at scale</div>
            </div>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {threats.map((t, i) => (
            <motion.div
              key={t.label}
              initial={{ opacity: 0, scale: 0.96 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: (i % 3) * 0.08 }}
              whileHover={{ y: -4 }}
              className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur p-5 hover:bg-white/[0.06] hover:border-red-500/30 transition group"
            >
              <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center group-hover:bg-red-500/20 transition">
                <t.icon className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <div className="font-semibold text-slate-100">{t.label}</div>
                <div className="text-sm text-slate-500">{t.desc}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}