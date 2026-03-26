import Link from 'next/link';

export function Navbar({ rightAction }: { rightAction?: React.ReactNode }) {
  return (
    <nav className="fixed top-0 z-50 w-full glass-nav">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-4">
        <Link href="/" className="flex items-center gap-0.5">
          <span className="text-2xl font-black tracking-tighter text-white">
            TechJM
          </span>
          <span className="mb-auto text-accent">.</span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          <Link href="/#features" className="text-sm font-medium text-text-muted transition-colors hover:text-white">
            Features
          </Link>
          <Link href="/#how-it-works" className="text-sm font-medium text-text-muted transition-colors hover:text-white">
            How it Works
          </Link>
          <Link href="/#pricing" className="text-sm font-medium text-text-muted transition-colors hover:text-white">
            Pricing
          </Link>
        </div>

        <div className="flex items-center gap-6">
          {rightAction ?? (
            <Link
              href="/onboarding"
              className="rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-white transition-all hover:bg-accent-hover glow-accent-sm"
            >
              Get Started
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
