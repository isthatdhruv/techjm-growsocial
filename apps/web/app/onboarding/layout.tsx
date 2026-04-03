'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { ProgressBar } from '@/app/components/onboarding/progress-bar';

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, onboardingStep, signOut } = useAuth();
  const { currentStep, setCurrentStep } = useOnboardingStore();
  const router = useRouter();
  const pathname = usePathname();
  const [initialized, setInitialized] = useState(false);

  // Determine step from URL
  const urlStep = getStepFromPath(pathname);

  // Initialize from server state
  useEffect(() => {
    if (loading) return;

    if (!user) {
      // Allow step 1 for unauthenticated users
      if (urlStep !== 1) {
        router.replace('/onboarding/step-1');
      }
      setCurrentStep(1);
      setInitialized(true);
      return;
    }

    if (onboardingStep === 'complete') {
      router.replace('/dashboard');
      return;
    }

    const serverStep = parseInt(onboardingStep || '1');
    const dbStep = isNaN(serverStep) ? 1 : serverStep;

    // Prevent skipping ahead
    if (urlStep > dbStep) {
      router.replace(`/onboarding/step-${dbStep}`);
      setCurrentStep(dbStep);
    } else {
      setCurrentStep(urlStep);
    }

    setInitialized(true);
  }, [loading, user, onboardingStep, urlStep, router, setCurrentStep]);

  // Update store when URL changes
  useEffect(() => {
    if (initialized) {
      setCurrentStep(urlStep);
    }
  }, [urlStep, initialized, setCurrentStep]);

  const completedSteps = [1, 2, 3, 4, 5].filter((s) => {
    if (!onboardingStep) return false;
    const serverStep = parseInt(onboardingStep);
    if (isNaN(serverStep)) return onboardingStep === 'complete';
    return s < serverStep;
  });

  if (loading || !initialized) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-grid">
      {/* Top bar */}
      <header className="glass-nav sticky top-0 z-50 flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-0.5">
          <span className="text-xl font-black tracking-tighter text-white">TechJM</span>
          <span className="mb-auto text-accent">.</span>
        </div>
        <span className="text-sm text-text-muted">Step {currentStep} of 5</span>
        {user && (
          <button
            onClick={() => signOut().then(() => router.replace('/'))}
            className="text-sm text-text-muted hover:text-white"
          >
            Logout
          </button>
        )}
        {!user && <div className="w-16" />}
      </header>

      {/* Progress bar */}
      <div className="border-b border-white/6 bg-surface-dim/50">
        <div className="mx-auto max-w-3xl">
          <ProgressBar currentStep={currentStep} completedSteps={completedSteps} />
        </div>
      </div>

      {/* Content */}
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </div>
  );
}

function getStepFromPath(pathname: string): number {
  const match = pathname.match(/step-(\d)/);
  return match ? parseInt(match[1]) : 1;
}
