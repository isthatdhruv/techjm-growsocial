import Link from 'next/link';

export function Footer() {
  return (
    <footer className="w-full border-t border-white/5 bg-surface-dim py-12">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-8 px-8 md:flex-row">
        <div className="flex flex-col items-center gap-2 md:items-start">
          <span className="text-lg font-bold text-white">
            TechJM<span className="text-accent">.</span>
          </span>
          <p className="text-sm tracking-wide text-text-muted/60">
            &copy; 2025 TechJM. All rights reserved.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-8">
          {['Privacy', 'Terms', 'Contact', 'Documentation'].map((item) => (
            <Link
              key={item}
              href="#"
              className="text-sm tracking-wide text-text-muted/60 transition-colors hover:text-accent"
            >
              {item}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
