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
        className="max-w-5xl mx-auto relative overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900/60 backdrop-blur p-10 md:p-16 text-center"
      >
        <img src="https://images.unsplash.com/photo-1614064548567-61a9e0c7b3e2?auto=format&fit=crop&w=1200&q=80" alt="" className="absolute inset-0 w-full h-full object-cover opacity-20" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-slate-950/60" />
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[34rem] h-[34rem] bg-cyan-500/20 rounded-full blur-[130px]" />
        <div className="relative">
          <h2 className="text-4xl md:text-5xl font-semibold tracking-tight">Stop the attack. <span className="bg-gradient-to-r from-cyan-300 to-fuchsia-400 bg-clip-text text-transparent">Trace the actor.</span></h2>
          <p className="mt-5 text-slate-300 max-w-xl mx-auto text-lg">
            Bring forensic-grade email threat intelligence to your security team today. No infrastructure to deploy.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link to="/register" className="group inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-semibold transition shadow-xl shadow-cyan-500/25 hover:-translate-y-0.5">
              Create your account <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition" />
            </Link>
            <Link to="/login" className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl border border-white/15 hover:border-white/30 bg-white/5 hover:bg-white/10 text-slate-100 font-medium transition backdrop-blur">
              Sign in
            </Link>
          </div>
        </div>
      </motion.div>
    </section>
  );
}