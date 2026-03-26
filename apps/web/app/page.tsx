import Link from 'next/link';
import { Navbar } from './components/navbar';
import { Footer } from './components/footer';
import { GlassCard } from './components/glass-card';

const features = [
  {
    title: '4-LLM Discovery',
    description:
      'GPT-4o, Claude, Gemini, and Grok compete to find the best trending topics for your niche.',
    icon: (
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
      </svg>
    ),
  },
  {
    title: 'MBA-Grade Analysis',
    description:
      '7 specialized sub-agents score every topic on virality, brand fit, audience engagement, and more.',
    icon: (
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
      </svg>
    ),
  },
  {
    title: 'Auto-Publish',
    description:
      'Generate platform-optimized content and schedule it across LinkedIn, X, and more — hands-free.',
    icon: (
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.631 8.41m5.96 5.96a14.926 14.926 0 0 1-5.841 2.58m-.119-8.54a6 6 0 0 0-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 0 0-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 0 1-2.448-2.448 14.9 14.9 0 0 1 .06-.312m-2.24 2.39a4.493 4.493 0 0 0-1.757 4.306 4.493 4.493 0 0 0 4.306-1.758M16.5 9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" />
      </svg>
    ),
  },
  {
    title: 'Learn & Improve',
    description:
      'Adaptive feedback loop learns from your engagement data to continuously improve content quality.',
    icon: (
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
      </svg>
    ),
  },
];

export default function Home() {
  return (
    <>
      <Navbar />

      <main className="min-h-screen">
        {/* Hero */}
        <section className="relative flex flex-col items-center justify-center px-6 pt-40 pb-24 text-center">
          <div className="absolute inset-0 bg-grid opacity-50" />

          <div className="relative z-10 flex flex-col items-center">
            {/* Pill badge */}
            <div className="glass mb-8 flex items-center gap-2 rounded-full px-4 py-2">
              <span className="h-2 w-2 rounded-full bg-accent" />
              <span className="text-[13px] font-medium text-text-muted">Powered by 4 LLMs</span>
            </div>

            <h1 className="max-w-4xl text-5xl font-bold leading-[1.1] tracking-tight text-white md:text-7xl">
              AI-Powered Social Media{' '}
              <span className="text-accent">Automation</span>
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-text-muted">
              4-LLM discovery, 7 sub-agent analysis, adaptive feedback. Your content, automated.
            </p>

            <div className="mt-10 flex flex-col items-center gap-4">
              <Link
                href="/onboarding"
                className="rounded-xl bg-accent px-10 py-4 text-lg font-semibold text-white transition-all hover:bg-accent-hover glow-accent"
              >
                Get Started
              </Link>
              <Link
                href="#features"
                className="text-sm text-text-muted transition-colors hover:text-white"
              >
                See how it works &rarr;
              </Link>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-6xl px-6 pb-32">
          <div className="mb-16 text-center">
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-accent">
              Features
            </p>
            <h2 className="text-3xl font-bold text-white md:text-4xl">
              Everything you need to dominate social
            </h2>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <GlassCard key={feature.title} hover className="p-8">
                <div className="text-accent">{feature.icon}</div>
                <h3 className="mt-5 text-lg font-semibold text-white">{feature.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-text-muted">
                  {feature.description}
                </p>
              </GlassCard>
            ))}
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
