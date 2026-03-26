import { NextRequest, NextResponse } from 'next/server';
import { db, users, platformConnections } from '@techjm/db';
import { encryptApiKey } from '@techjm/db/encryption';
import { eq, and } from 'drizzle-orm';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get('code');
    const error = request.nextUrl.searchParams.get('error');

    if (error) {
      return NextResponse.redirect(
        new URL(`/onboarding/step-4?error=${encodeURIComponent(error)}`, request.url),
      );
    }

    if (!code) {
      return NextResponse.redirect(
        new URL('/onboarding/step-4?error=missing_code', request.url),
      );
    }

    const cookieStore = await cookies();
    const codeVerifier = cookieStore.get('x_oauth_code_verifier')?.value;
    const firebaseUid = cookieStore.get('x_oauth_uid')?.value;

    if (!codeVerifier || !firebaseUid) {
      return NextResponse.redirect(
        new URL('/onboarding/step-4?error=session_expired', request.url),
      );
    }

    // Exchange code for tokens (PKCE flow)
    const tokenRes = await fetch('https://api.x.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.X_REDIRECT_URI!,
        client_id: process.env.X_CLIENT_ID!,
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error('X token exchange failed:', err);
      return NextResponse.redirect(
        new URL('/onboarding/step-4?error=token_exchange_failed', request.url),
      );
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;

    // Fetch user profile
    const userRes = await fetch('https://api.x.com/2/users/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userRes.ok) {
      return NextResponse.redirect(
        new URL('/onboarding/step-4?error=profile_fetch_failed', request.url),
      );
    }

    const userData = await userRes.json();
    const accountName = `@${userData.data.username}`;
    const accountId = userData.data.id;

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
          eq(platformConnections.platform, 'x'),
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
            eq(platformConnections.platform, 'x'),
          ),
        );
    } else {
      await db.insert(platformConnections).values({
        userId: user.id,
        platform: 'x',
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
      new URL('/onboarding/step-4?x=connected', request.url),
    );
    response.cookies.delete('x_oauth_code_verifier');
    response.cookies.delete('x_oauth_state');
    response.cookies.delete('x_oauth_uid');
    return response;
  } catch (err) {
    console.error('X callback error:', err);
    return NextResponse.redirect(
      new URL('/onboarding/step-4?error=internal_error', request.url),
    );
  }
}
