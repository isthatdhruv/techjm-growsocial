'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { GlassCard } from '@/app/components/glass-card';

export default function Step1Signup() {
  const { user, loading, signIn, signInWithEmail, signUp } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSignIn, setIsSignIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Auto-advance if already signed in
  useEffect(() => {
    if (!loading && user) {
      router.replace('/onboarding/step-2');
    }
  }, [loading, user, router]);

  async function handleGoogle() {
    setError('');
    setSubmitting(true);
    try {
      await signIn();
      router.push('/onboarding/step-2');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Google sign-in failed';
      if (msg.includes('popup')) {
        setError('Popup was blocked. Please allow popups and try again.');
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (isSignIn) {
        await signInWithEmail(email, password);
      } else {
        await signUp(email, password);
      }
      router.push('/onboarding/step-2');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed';
      if (msg.includes('email-already-in-use')) {
        setError('Email already in use. Try signing in instead.');
      } else if (msg.includes('weak-password')) {
        setError('Password should be at least 6 characters.');
      } else if (msg.includes('invalid-credential') || msg.includes('wrong-password')) {
        setError('Invalid email or password.');
      } else if (msg.includes('user-not-found')) {
        setError('No account found. Try signing up instead.');
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || user) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex justify-center">
      <GlassCard className="w-full max-w-md p-8">
        <h1 className="mb-2 text-center text-2xl font-bold text-white">Create your account</h1>
        <p className="mb-8 text-center text-sm text-text-muted">
          Start automating your social media with AI
        </p>

        {/* Google button */}
        <button
          onClick={handleGoogle}
          disabled={submitting}
          className="mb-4 flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white transition-all hover:bg-white/10 disabled:opacity-50"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Continue with Google
        </button>

        {/* Divider */}
        <div className="mb-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-xs text-text-muted">or</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        {/* Email form */}
        <form onSubmit={handleEmailAuth} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            required
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-text-muted/40 focus:border-accent/40 focus:outline-none"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            minLength={6}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-text-muted/40 focus:border-accent/40 focus:outline-none"
          />
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-accent-hover glow-accent-sm disabled:opacity-50"
          >
            {submitting ? 'Please wait...' : isSignIn ? 'Sign In' : 'Sign Up'}
          </button>
        </form>

        {/* Toggle sign in / sign up */}
        <p className="mt-4 text-center text-sm text-text-muted">
          {isSignIn ? "Don't have an account? " : 'Already have an account? '}
          <button
            type="button"
            onClick={() => { setIsSignIn(!isSignIn); setError(''); }}
            className="text-accent hover:underline"
          >
            {isSignIn ? 'Sign up' : 'Sign in'}
          </button>
        </p>

        {/* Error */}
        {error && (
          <div className="mt-4 rounded-lg bg-error/10 px-4 py-2.5 text-sm text-error">
            {error}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
