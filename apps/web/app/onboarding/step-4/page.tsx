'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { GlassCard } from '@/app/components/glass-card';

interface SocialConnection {
  platform: string;
  accountName: string | null;
  accountId: string | null;
  orgUrn: string | null;
  connectionHealth: string | null;
}

export default function Step4Socials() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setSocialData } = useOnboardingStore();

  const [connections, setConnections] = useState<SocialConnection[]>([]);
  const [, setLoadingConnections] = useState(true);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Show success/error from OAuth redirect
  const linkedinStatus = searchParams.get('linkedin');
  const xStatus = searchParams.get('x');
  const oauthError = searchParams.get('error');

  // Fetch existing connections
  useEffect(() => {
    if (!user) return;
    async function fetchConnections() {
      try {
        const token = await user!.getIdToken();
        const res = await fetch('/api/onboarding/socials', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setConnections(data.connections);
        }
      } catch { /* silent */ }
      setLoadingConnections(false);
    }
    fetchConnections();
  }, [user, linkedinStatus, xStatus]);

  const linkedinConn = connections.find((c) => c.platform === 'linkedin');
  const xConn = connections.find((c) => c.platform === 'x');
  const hasAnyConnection = connections.length > 0;

  async function handleConnect(platform: 'linkedin' | 'x') {
    if (!user) return;
    // Redirect to OAuth initiation route
    window.location.href = `/api/auth/${platform}?uid=${user.uid}`;
  }

  async function handleDisconnect(platform: 'linkedin' | 'x') {
    if (!user) return;
    setDisconnecting(platform);
    try {
      const token = await user.getIdToken();
      await fetch('/api/onboarding/social-disconnect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ platform }),
      });
      setConnections(connections.filter((c) => c.platform !== platform));
    } catch {
      setError('Failed to disconnect');
    } finally {
      setDisconnecting(null);
    }
  }

  async function handleContinue() {
    if (!user) return;
    setSaving(true);
    setError('');
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/onboarding/social-complete', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to save');

      setSocialData({
        connections: connections.map((c) => ({
          platform: c.platform as 'linkedin' | 'x',
          accountName: c.accountName || '',
          accountId: c.accountId || '',
          orgUrn: c.orgUrn || undefined,
        })),
      });
      router.push('/onboarding/step-5');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (loading || !user) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="mb-1 text-2xl font-bold text-white">Connect your social platforms</h1>
        <p className="text-sm text-text-muted">
          We&apos;ll publish your AI-generated content directly to these platforms
        </p>
      </div>

      {/* OAuth status messages */}
      {linkedinStatus === 'connected' && (
        <div className="rounded-lg bg-tertiary/10 px-4 py-2.5 text-sm text-tertiary">
          LinkedIn connected successfully!
        </div>
      )}
      {xStatus === 'connected' && (
        <div className="rounded-lg bg-tertiary/10 px-4 py-2.5 text-sm text-tertiary">
          X (Twitter) connected successfully!
        </div>
      )}
      {oauthError && (
        <div className="rounded-lg bg-error/10 px-4 py-2.5 text-sm text-error">
          Connection failed: {oauthError.replace(/_/g, ' ')}
        </div>
      )}

      {/* LinkedIn */}
      <GlassCard className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0A66C2]/20">
              <svg className="h-5 w-5 text-[#0A66C2]" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-white">LinkedIn</p>
              <p className="text-xs text-text-muted">Post to your personal profile or company page</p>
            </div>
          </div>

          {linkedinConn ? (
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-sm text-tertiary">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                {linkedinConn.accountName}
              </span>
              <button
                onClick={() => handleDisconnect('linkedin')}
                disabled={disconnecting === 'linkedin'}
                className="text-xs text-text-muted hover:text-error"
              >
                {disconnecting === 'linkedin' ? 'Disconnecting...' : 'Disconnect'}
              </button>
            </div>
          ) : (
            <button
              onClick={() => handleConnect('linkedin')}
              className="rounded-lg bg-[#0A66C2] px-4 py-2 text-sm font-medium text-white transition-all hover:bg-[#004182]"
            >
              Connect LinkedIn
            </button>
          )}
        </div>
      </GlassCard>

      {/* X (Twitter) */}
      <GlassCard className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10">
              <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-white">X (Twitter)</p>
              <p className="text-xs text-text-muted">Free tier supports 1,500 posts/month</p>
            </div>
          </div>

          {xConn ? (
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-sm text-tertiary">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                {xConn.accountName}
              </span>
              <button
                onClick={() => handleDisconnect('x')}
                disabled={disconnecting === 'x'}
                className="text-xs text-text-muted hover:text-error"
              >
                {disconnecting === 'x' ? 'Disconnecting...' : 'Disconnect'}
              </button>
            </div>
          ) : (
            <button
              onClick={() => handleConnect('x')}
              className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-white/15"
            >
              Connect X
            </button>
          )}
        </div>
      </GlassCard>

      {/* Minimum requirement */}
      {!hasAnyConnection && (
        <div className="rounded-xl border border-white/10 bg-white/3 px-4 py-3 text-center text-sm text-text-muted">
          Connect at least 1 platform to continue, or skip for now.
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push('/onboarding/step-3')}
          className="rounded-xl border border-white/10 px-6 py-3 text-sm font-medium text-text-muted hover:border-white/20 hover:text-white"
        >
          Back
        </button>
        <div className="flex items-center gap-3">
          {!hasAnyConnection && (
            <button
              onClick={handleContinue}
              disabled={saving}
              className="text-sm text-text-muted hover:text-white"
            >
              Skip for now
            </button>
          )}
          <button
            onClick={handleContinue}
            disabled={saving}
            className="rounded-xl bg-accent px-8 py-3 text-sm font-semibold text-white transition-all hover:bg-accent-hover glow-accent-sm disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save & Continue'}
          </button>
        </div>
      </div>

      {!hasAnyConnection && (
        <p className="text-center text-xs text-text-muted/50">
          You won&apos;t be able to publish until you connect a platform.
        </p>
      )}

      {error && (
        <div className="rounded-lg bg-error/10 px-4 py-2.5 text-sm text-error">{error}</div>
      )}
    </div>
  );
}
