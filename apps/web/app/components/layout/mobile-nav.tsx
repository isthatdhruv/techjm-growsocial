'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { user, signOut } = useAuth();

  const items = [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Topics', href: '/dashboard/topics' },
    { label: 'Content', href: '/dashboard/content' },
    { label: 'Queue', href: '/dashboard/queue' },
    { label: 'Analytics', href: '/dashboard/analytics' },
    { label: 'Settings', href: '/settings' },
  ];

  return (
    <div className="lg:hidden">
      <header className="glass-nav fixed left-0 right-0 top-0 z-50 flex items-center justify-between border-b border-white/6 px-4 py-3">
        <Link href="/" className="flex items-center gap-0.5">
          <span className="text-xl font-black tracking-tighter text-white">TechJM</span>
          <span className="mb-auto text-accent">.</span>
        </Link>
        <button onClick={() => setOpen(!open)} className="text-text-muted">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            {open ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            )}
          </svg>
        </button>
      </header>

      {open && (
        <div className="glass-nav fixed inset-0 top-14 z-40 p-4">
          <nav className="space-y-1">
            {items.map((item) => {
              const isActive = item.href !== '#' && pathname.startsWith(item.href);
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`block rounded-lg px-4 py-3 text-sm ${
                    isActive ? 'bg-white/5 font-medium text-white' : 'text-text-muted'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-4 border-t border-white/6 pt-4">
            <p className="px-4 text-sm text-white">{user?.displayName || user?.email}</p>
            <button
              onClick={() => { signOut(); setOpen(false); }}
              className="mt-2 px-4 text-sm text-text-muted hover:text-accent"
            >
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
