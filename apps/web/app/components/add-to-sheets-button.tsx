'use client';

import { useEffect, useState } from 'react';

export interface AddToSheetsPayload {
  platform: string;
  content: string;
  timestamp: string;
  imageUrl?: string | null;
}

interface AddToSheetsButtonProps {
  payload: AddToSheetsPayload;
  getToken: () => Promise<string>;
  endpoint?: string;
  className?: string;
}

type RequestState = 'idle' | 'loading' | 'success' | 'error';

export function AddToSheetsButton({
  payload,
  getToken,
  endpoint = '/api/integrations/google-sheets',
  className,
}: AddToSheetsButtonProps) {
  const [requestState, setRequestState] = useState<RequestState>('idle');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (requestState !== 'success' && requestState !== 'error') {
      return;
    }

    const timer = window.setTimeout(() => {
      setRequestState('idle');
      setMessage(null);
    }, 4000);

    return () => window.clearTimeout(timer);
  }, [requestState]);

  const handleClick = async () => {
    try {
      setRequestState('loading');
      setMessage(null);

      const token = await getToken();
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to add this post to Google Sheets.');
      }

      setRequestState('success');
      setMessage('Added to Google Sheets.');
    } catch (error) {
      console.error('Failed to add post to Google Sheets:', error);
      setRequestState('error');
      setMessage(
        error instanceof Error ? error.message : 'Failed to add this post to Google Sheets.',
      );
    }
  };

  const disabled = requestState === 'loading';
  const statusClassName =
    requestState === 'error'
      ? 'text-red-400'
      : requestState === 'success'
        ? 'text-green-400'
        : 'text-text-muted/60';

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => {
          void handleClick();
        }}
        disabled={disabled}
        className={
          className ||
          'flex items-center gap-1.5 rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60'
        }
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.75 4.5h16.5M3.75 9.75h16.5M9 15h11.25M9 19.5h11.25M3.75 15h.008v.008H3.75V15Zm0 4.5h.008v.008H3.75V19.5Z"
          />
        </svg>
        {disabled ? 'Sending...' : 'Add to Sheets'}
      </button>

      {message && <p className={`text-xs ${statusClassName}`}>{message}</p>}
    </div>
  );
}
