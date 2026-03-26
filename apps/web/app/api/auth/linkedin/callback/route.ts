import { NextRequest, NextResponse } from 'next/server';
import { db, users, platformConnections } from '@techjm/db';
import { encryptApiKey } from '@techjm/db/encryption';
import { eq, and } from 'drizzle-orm';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get('code');
    const state = request.nextUrl.searchParams.get('state');
    const error = request.nextUrl.searchParams.get('error');

    if (error) {
      return NextResponse.redirect(
        new URL(`/onboarding/step-4?error=${encodeURIComponent(error)}`, request.url),
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        new URL('/onboarding/step-4?error=missing_params', request.url),
      );
    }

    // Verify CSRF state
    const cookieStore = await cookies();
    const storedState = cookieStore.get('linkedin_oauth_state')?.value;
    if (state !== storedState) {
      return NextResponse.redirect(
        new URL('/onboarding/step-4?error=invalid_state', request.url),
      );
    }

    // Exchange code for tokens
    const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.LINKEDIN_REDIRECT_URI!,
        client_id: process.env.LINKEDIN_CLIENT_ID!,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error('LinkedIn token exchange failed:', err);
      return NextResponse.redirect(
        new URL('/onboarding/step-4?error=token_exchange_failed', request.url),
      );
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;

    // Fetch user profile
    const profileRes = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!profileRes.ok) {
      return NextResponse.redirect(
        new URL('/onboarding/step-4?error=profile_fetch_failed', request.url),
      );
    }

    const profile = await profileRes.json();
    const accountName = profile.name || `${profile.given_name} ${profile.family_name}`;
    const accountId = profile.sub;

    // Get firebase UID from state cookie
    const firebaseUid = cookieStore.get('linkedin_oauth_uid')?.value;
    if (!firebaseUid) {
      return NextResponse.redirect(
        new URL('/onboarding/step-4?error=session_expired', request.url),
      );
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.firebaseUid, firebaseUid))
      .limit(1);

    if (!user) {
      return NextResponse.redirect(
        new URL('/onboarding/step-4?error=user_not_found', request.url),
      );
    }

    // Encrypt tokens and save
    const encAccessToken = encryptApiKey(accessToken);
    const encRefreshToken = refreshToken ? encryptApiKey(refreshToken) : null;
    const tokenExpiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : null;

    const existing = await db
      .select()
      .from(platformConnections)
      .where(
        and(
          eq(platformConnections.userId, user.id),
          eq(platformConnections.platform, 'linkedin'),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(platformConnections)
        .set({
          accessTokenEnc: encAccessToken,
          refreshTokenEnc: encRefreshToken,
          tokenExpiresAt,
          accountName,
          accountId,
          connectionHealth: 'healthy',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(platformConnections.userId, user.id),
            eq(platformConnections.platform, 'linkedin'),
          ),
        );
    } else {
      await db.insert(platformConnections).values({
        userId: user.id,
        platform: 'linkedin',
        accessTokenEnc: encAccessToken,
        refreshTokenEnc: encRefreshToken,
        tokenExpiresAt,
        accountName,
        accountId,
        connectionHealth: 'healthy',
      });
    }

    // Clean up OAuth cookies
    const response = NextResponse.redirect(
      new URL('/onboarding/step-4?linkedin=connected', request.url),
    );
    response.cookies.delete('linkedin_oauth_state');
    response.cookies.delete('linkedin_oauth_uid');
    return response;
  } catch (err) {
    console.error('LinkedIn callback error:', err);
    return NextResponse.redirect(
      new URL('/onboarding/step-4?error=internal_error', request.url),
    );
  }
}
