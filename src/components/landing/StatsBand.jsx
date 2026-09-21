import { motion } from 'framer-motion';

const stats = [
  { value: '9', label: 'Forensic pipeline stages' },
  { value: '6', label: 'Threat classes detected' },
  { value: '3', label: 'Auth protocols validated' },
  { value: '∞', label: 'Cases & evidence stored' },
];

export default function StatsBand() {
  return (
    <section className="px-6 py-10">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-px rounded-2xl overflow-hidden border border-white/10 bg-white/5 backdrop-blur"
        >
          {stats.map((s, i) => (
            <div key={i} className="bg-slate-950/40 px-6 py-7 text-center">
              <div className="text-3xl md:text-4xl font-semibold tracking-tight bg-gradient-to-b from-white to-slate-400 bg-clip-text text-transparent">{s.value}</div>
              <div className="mt-1.5 text-xs text-slate-500">{s.label}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}