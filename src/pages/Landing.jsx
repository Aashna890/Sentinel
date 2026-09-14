// ─────────────────────────────────────────────────────────────────────────────
// Landing.jsx
// Public marketing / home page — shown to unauthenticated visitors.
// Composed entirely of smaller section components so each part can be edited
// or reordered independently.
//
// Section breakdown:
//  LandingNav      — top navigation bar (logo, links, login/signup CTA)
//  Hero            — headline, sub-copy, and primary call-to-action
//  FeatureGrid     — grid of key product features with icons
//  HowItWorks      — step-by-step explanation of the analysis pipeline
//  ThreatCoverage  — list / graphic of supported threat types
//  CTASection      — secondary call-to-action block (e.g. "Start for free")
//  LandingFooter   — links, legal, and copyright
// ─────────────────────────────────────────────────────────────────────────────

import LandingNav     from '@/components/landing/LandingNav';
import Hero           from '@/components/landing/Hero';
import FeatureGrid    from '@/components/landing/FeatureGrid';
import HowItWorks     from '@/components/landing/HowItWorks';
import ThreatCoverage from '@/components/landing/ThreatCoverage';
import CTASection     from '@/components/landing/CTASection';
import LandingFooter  from '@/components/landing/LandingFooter';

export default function Landing() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 overflow-x-hidden">
      <LandingNav />
      <Hero />
      <FeatureGrid />
      <HowItWorks />
      <ThreatCoverage />
      <CTASection />
      <LandingFooter />
    </div>
  );
}