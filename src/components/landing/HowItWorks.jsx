import { motion } from 'framer-motion';
import { ClipboardPaste, Cpu, FileSearch } from 'lucide-react';

const steps = [
  { icon: ClipboardPaste, n: '01', title: 'Ingest the raw email', desc: 'Paste the full message source — headers and body. No plugins, no mail-server integration required.' },
  { icon: Cpu, n: '02', title: 'AI forensic analysis', desc: 'NLP threat detection, authentication validation, relay-path reconstruction, and origin-IP extraction run in seconds.' },
  { icon: FileSearch, n: '03', title: 'Investigate & report', desc: 'Review the fraud score, trace map, and attribution, then save it as a case with a structured forensic report.' },
];

export default function HowItWorks() {
  return (
    <section id="how" className="py-24 px-6 bg-slate-900/30 border-y border-slate-800/60">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <span className="text-xs font-medium uppercase tracking-wider text-cyan-400">How it works</span>
          <h2 className="mt-3 text-3xl md:text-4xl font-semibold tracking-tight">From raw email to attribution in three steps</h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6 relative">
          <div className="hidden md:block absolute top-12 left-[16%] right-[16%] h-px bg-gradient-to-r from-transparent via-slate-700 to-transparent" />
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.12 }}
              className="relative text-center"
            >
              <div className="relative inline-flex w-24 h-24 rounded-full bg-slate-900 border border-slate-700 items-center justify-center mb-5 group hover:border-cyan-500/50 transition">
                <s.icon className="w-9 h-9 text-cyan-400 group-hover:scale-110 transition-transform" />
                <span className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-cyan-500 text-slate-950 text-xs font-bold flex items-center justify-center">{s.n}</span>
              </div>
              <h3 className="font-medium text-lg mb-2">{s.title}</h3>
              <p className="text-sm text-slate-400 max-w-xs mx-auto leading-relaxed">{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}