import Link from 'next/link';

const features = [
  {
    title: '4-LLM Discovery',
    description:
      'GPT-4o, Claude, Gemini, and Grok compete to find the best trending topics for your niche.',
    icon: '🔍',
  },
  {
    title: 'MBA-Grade Analysis',
    description:
      '7 specialized sub-agents score every topic on virality, brand fit, audience engagement, and more.',
    icon: '📊',
  },
  {
    title: 'Auto-Publish',
    description:
      'Generate platform-optimized content and schedule it across LinkedIn, X, and more — hands-free.',
    icon: '🚀',
  },
  {
    title: 'Learn & Improve',
    description:
      'Adaptive feedback loop learns from your engagement data to continuously improve content quality.',
    icon: '🧠',
  },
];

export default function Home() {
  return (
    <main className="min-h-screen">
      {/* Hero */}
      <section className="flex flex-col items-center justify-center px-6 pt-32 pb-20 text-center">
        <h1 className="max-w-4xl text-5xl font-bold leading-tight tracking-tight text-white md:text-6xl">
          AI-Powered Social Media{' '}
          <span className="text-accent">Automation</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-text-muted">
          4-LLM discovery, 7 sub-agent analysis, adaptive feedback. Your content, automated.
        </p>
        <Link
          href="/onboarding"
          className="mt-10 rounded-lg bg-accent px-8 py-3 text-lg font-semibold text-white transition-colors hover:bg-accent-hover"
        >
          Get Started
        </Link>
      </section>

      {/* Features */}
      <section className="mx-auto grid max-w-6xl gap-8 px-6 pb-32 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((feature) => (
          <div
            key={feature.title}
            className="rounded-xl border border-white/10 bg-surface-light p-6 transition-colors hover:border-accent/40"
          >
            <div className="text-3xl">{feature.icon}</div>
            <h3 className="mt-4 text-lg font-semibold text-white">{feature.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">{feature.description}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
