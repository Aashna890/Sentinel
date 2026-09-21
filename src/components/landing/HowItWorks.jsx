import { motion } from 'framer-motion';
import { ClipboardPaste, Cpu, FileSearch } from 'lucide-react';

const steps = [
  { icon: ClipboardPaste, n: '01', title: 'Ingest the raw email', desc: 'Paste the full message source — headers and body. No plugins, no mail-server integration required.' },
  { icon: Cpu, n: '02', title: 'AI forensic analysis', desc: 'NLP threat detection, authentication validation, relay-path reconstruction, and origin-IP extraction run in seconds.' },
  { icon: FileSearch, n: '03', title: 'Investigate & report', desc: 'Review the fraud score, trace map, and attribution, then save it as a case with a structured forensic report.' },
];

export default function HowItWorks() {
  return (
    <section id="how" className="py-24 px-6 relative overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-1/2 left-0 w-[30rem] h-[30rem] bg-blue-600/10 rounded-full blur-[140px]" />
      </div>
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 ring-1 ring-cyan-500/20 text-cyan-300 text-xs font-medium uppercase tracking-wider">Workflow</span>
          <h2 className="mt-4 text-4xl md:text-5xl font-semibold tracking-tight">From raw email to attribution</h2>
          <p className="mt-4 text-slate-400 max-w-2xl mx-auto text-lg">A staged forensic pipeline that turns an opaque message into actionable intelligence.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 relative">
          <div className="hidden md:block absolute top-14 left-[16%] right-[16%] h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.12 }}
              className="relative text-center"
            >
              <div className="relative inline-flex w-24 h-24 rounded-3xl bg-slate-900/80 border border-white/10 backdrop-blur items-center justify-center mb-6 group hover:border-cyan-500/40 transition">
                <s.icon className="w-9 h-9 text-cyan-400 group-hover:scale-110 transition-transform" />
                <span className="absolute -top-2 -right-2 w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 text-slate-950 text-xs font-bold flex items-center justify-center shadow-lg shadow-cyan-500/30">{s.n}</span>
              </div>
              <h3 className="font-semibold text-lg mb-2">{s.title}</h3>
              <p className="text-sm text-slate-400 max-w-xs mx-auto leading-relaxed">{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}