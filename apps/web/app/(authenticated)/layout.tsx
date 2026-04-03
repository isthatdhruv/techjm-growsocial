import { cookies } from 'next/headers';
import { AuthenticatedLayoutClient } from '@/app/components/auth/authenticated-layout-client';

const AUTH_HINT_COOKIE = 'techjm_auth_hint';
const ONBOARDING_HINT_COOKIE = 'techjm_onboarding_hint';

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const hasSessionHint = cookieStore.get(AUTH_HINT_COOKIE)?.value === '1';
  const onboardingStepHint = cookieStore.get(ONBOARDING_HINT_COOKIE)?.value ?? null;

  return (
    <AuthenticatedLayoutClient
      hasSessionHint={hasSessionHint}
      onboardingStepHint={onboardingStepHint}
    >
      {children}
    </AuthenticatedLayoutClient>
  );
}
