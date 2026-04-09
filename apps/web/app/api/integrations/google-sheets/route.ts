import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';

interface SheetsPayload {
  platform?: string;
  content?: string;
  timestamp?: string;
  imageUrl?: string | null;
}

interface SheetsUpstreamResponse {
  status?: string;
  message?: string;
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const googleSheetsWebAppUrl = process.env.GOOGLE_SHEETS_WEB_APP_URL?.trim();
  if (!googleSheetsWebAppUrl) {
    return NextResponse.json(
      { error: 'GOOGLE_SHEETS_WEB_APP_URL is not configured.' },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => null)) as SheetsPayload | null;
  const platform = body?.platform?.trim();
  const content = body?.content?.trim();
  const timestamp = body?.timestamp?.trim();
  const imageUrl = body?.imageUrl?.trim() || '';

  if (!platform || !content || !timestamp) {
    return NextResponse.json(
      { error: 'platform, content, and timestamp are required.' },
      { status: 400 },
    );
  }

  const parsedTimestamp = new Date(timestamp);
  if (Number.isNaN(parsedTimestamp.getTime())) {
    return NextResponse.json(
      { error: 'timestamp must be a valid ISO date string.' },
      { status: 400 },
    );
  }

  try {
    // Keep the browser decoupled from the Apps Script URL and forward a minimal payload.
    const upstreamResponse = await fetch(googleSheetsWebAppUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        timestamp: parsedTimestamp.toISOString(),
        platform,
        content,
        imageUrl,
      }),
      cache: 'no-store',
    });

    const upstreamText = await upstreamResponse.text();
    let upstreamBody: unknown = null;
    if (upstreamText) {
      try {
        upstreamBody = JSON.parse(upstreamText);
      } catch {
        upstreamBody = upstreamText;
      }
    }

    if (!upstreamResponse.ok) {
      return NextResponse.json(
        {
          error: 'Google Sheets integration request failed.',
          details: upstreamBody,
        },
        { status: 502 },
      );
    }

    const typedUpstreamBody =
      upstreamBody && typeof upstreamBody === 'object'
        ? (upstreamBody as SheetsUpstreamResponse)
        : null;

    if (typedUpstreamBody?.status && typedUpstreamBody.status !== 'success') {
      return NextResponse.json(
        {
          error:
            typedUpstreamBody.message || 'Google Sheets integration did not complete successfully.',
          details: upstreamBody,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      status: 'success',
      forwardedAt: new Date().toISOString(),
      upstream: upstreamBody,
    });
  } catch (error) {
    console.error('Failed to reach Google Sheets web app:', error);
    return NextResponse.json(
      { error: 'Unable to reach the Google Sheets web app.' },
      { status: 502 },
    );
  }
}
