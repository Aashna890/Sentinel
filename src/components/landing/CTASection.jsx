import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

export default function CTASection() {
  return (
    <section className="py-24 px-6">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="max-w-5xl mx-auto relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950/40 p-10 md:p-16 text-center"
      >
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[30rem] h-[30rem] bg-cyan-500/20 rounded-full blur-[120px]" />
        <div className="relative">
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">Stop the attack. Trace the actor.</h2>
          <p className="mt-4 text-slate-400 max-w-xl mx-auto">
            Bring forensic-grade email threat intelligence to your security team today. No infrastructure to deploy.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link to="/register" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-medium transition shadow-lg shadow-cyan-500/25 hover:-translate-y-0.5">
              Create your account <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/login" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-slate-700 hover:border-slate-500 text-slate-200 font-medium transition">
              Sign in
            </Link>
          </div>
        </div>
      </motion.div>
    </section>
  );
}