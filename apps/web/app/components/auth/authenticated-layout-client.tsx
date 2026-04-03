'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Sidebar } from '@/app/components/layout/sidebar';
import { MobileNav } from '@/app/components/layout/mobile-nav';

interface AuthenticatedLayoutClientProps {
  children: React.ReactNode;
  hasSessionHint: boolean;
  onboardingStepHint: string | null;
}

function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-grid">
      <Sidebar />
      <MobileNav />
      <main className="min-h-screen pt-14 lg:ml-60 lg:pt-0">{children}</main>
    </div>
  );
}

export function AuthenticatedLayoutClient({
  children,
  hasSessionHint,
  onboardingStepHint,
}: AuthenticatedLayoutClientProps) {
  const { user, loading, onboardingStep } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace('/');
      return;
    }

    if (onboardingStep && onboardingStep !== 'complete') {
      router.replace('/onboarding');
    }
  }, [user, loading, onboardingStep, router]);

  const shouldHoldAuthenticatedShell =
    loading && hasSessionHint && (!onboardingStepHint || onboardingStepHint === 'complete');

  if (shouldHoldAuthenticatedShell) {
    return <AppShell>{children}</AppShell>;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;
  if (onboardingStep && onboardingStep !== 'complete') return null;

  return <AppShell>{children}</AppShell>;
}
