import LandingNav from '@/components/landing/LandingNav';
import AnimatedBackground from '@/components/landing/AnimatedBackground';
import HeaderRain from '@/components/landing/HeaderRain';
import Hero from '@/components/landing/Hero';
import StatsBand from '@/components/landing/StatsBand';
import FeatureGrid from '@/components/landing/FeatureGrid';
import HowItWorks from '@/components/landing/HowItWorks';
import ThreatCoverage from '@/components/landing/ThreatCoverage';
import CTASection from '@/components/landing/CTASection';
import LandingFooter from '@/components/landing/LandingFooter';

export default function Landing() {
  return (
    <div className="min-h-screen bg-transparent text-slate-100 overflow-x-hidden selection:bg-cyan-500/30">
      <AnimatedBackground />
      <HeaderRain />
      <LandingNav />
      <Hero />
      <StatsBand />
      <FeatureGrid />
      <HowItWorks />
      <ThreatCoverage />
      <CTASection />
      <LandingFooter />
    </div>
  );
}