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

export interface AuthContextValue {
  user: User | null;
  loading: boolean;
  onboardingStep: string | null;
  signIn: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

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
        try {
          const step = await syncUserToBackend(firebaseUser);
          setOnboardingStep(step);
        } catch {
          setOnboardingStep(null);
        }
      } else {
        setOnboardingStep(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signIn = useCallback(async () => {
    const result = await signInWithPopup(getFirebaseAuth(), googleProvider);
    const step = await syncUserToBackend(result.user);
    setOnboardingStep(step);
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const result = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
    const step = await syncUserToBackend(result.user);
    setOnboardingStep(step);
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const result = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
    const step = await syncUserToBackend(result.user);
    setOnboardingStep(step);
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(getFirebaseAuth());
    setUser(null);
    setOnboardingStep(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, onboardingStep, signIn, signInWithEmail, signUp, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}
