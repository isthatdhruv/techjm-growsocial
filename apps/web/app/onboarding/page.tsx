'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';

export default function OnboardingIndex() {
  const { loading, onboardingStep } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (onboardingStep === 'complete') {
      router.replace('/dashboard');
      return;
    }

    const step = parseInt(onboardingStep || '1');
    router.replace(`/onboarding/step-${isNaN(step) ? 1 : step}`);
  }, [loading, onboardingStep, router]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
    </div>
  );
}
