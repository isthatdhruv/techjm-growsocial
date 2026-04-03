'use client';

import { createContext, useCallback, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth, googleProvider } from '@/lib/firebase';

const AUTH_HINT_COOKIE = 'techjm_auth_hint';
const ONBOARDING_HINT_COOKIE = 'techjm_onboarding_hint';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export interface AuthContextValue {
  user: User | null;
  loading: boolean;
  onboardingStep: string | null;
  setOnboardingStep: (step: string) => void;
  signIn: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

function setCookie(name: string, value: string, maxAge: number) {
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

function clearCookie(name: string) {
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

function persistAuthHints(user: User | null, onboardingStep: string | null) {
  if (!user) {
    clearCookie(AUTH_HINT_COOKIE);
    clearCookie(ONBOARDING_HINT_COOKIE);
    return;
  }

  setCookie(AUTH_HINT_COOKIE, '1', COOKIE_MAX_AGE);

  if (onboardingStep) {
    setCookie(ONBOARDING_HINT_COOKIE, onboardingStep, COOKIE_MAX_AGE);
  } else {
    clearCookie(ONBOARDING_HINT_COOKIE);
  }
}

async function syncUserToBackend(user: User): Promise<string> {
  const token = await user.getIdToken();
  const res = await fetch('/api/auth/sync', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to sync user');
  const data = await res.json();
  return data.onboardingStep;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboardingStep, setOnboardingStep] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        persistAuthHints(firebaseUser, null);
        try {
          const step = await syncUserToBackend(firebaseUser);
          setOnboardingStep(step);
          persistAuthHints(firebaseUser, step);
        } catch {
          setOnboardingStep(null);
          persistAuthHints(firebaseUser, null);
        }
      } else {
        setOnboardingStep(null);
        persistAuthHints(null, null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signIn = useCallback(async () => {
    const result = await signInWithPopup(getFirebaseAuth(), googleProvider);
    const step = await syncUserToBackend(result.user);
    setOnboardingStep(step);
    persistAuthHints(result.user, step);
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const result = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
    const step = await syncUserToBackend(result.user);
    setOnboardingStep(step);
    persistAuthHints(result.user, step);
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const result = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
    const step = await syncUserToBackend(result.user);
    setOnboardingStep(step);
    persistAuthHints(result.user, step);
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(getFirebaseAuth());
    setUser(null);
    setOnboardingStep(null);
    persistAuthHints(null, null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, onboardingStep, setOnboardingStep, signIn, signInWithEmail, signUp, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}
