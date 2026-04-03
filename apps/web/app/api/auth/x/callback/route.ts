import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getXConfig, getXConfigStatus } from '@/lib/social-config';
import {
  SOCIAL_COOKIE_NAMES,
  SOCIAL_SCOPES,
  appendOAuthResultToReturnTo,
  validateOAuthCallback,
} from '@/lib/social-oauth';
import { findUserByFirebaseUid, upsertPlatformConnection } from '@/lib/social-connections';
import { logSocialCallbackResult } from '@/lib/social-logger';

export const dynamic = 'force-dynamic';

function createCleanupResponse(response: NextResponse) {
  response.cookies.delete(SOCIAL_COOKIE_NAMES.x.codeVerifier);
  response.cookies.delete(SOCIAL_COOKIE_NAMES.x.state);
  response.cookies.delete(SOCIAL_COOKIE_NAMES.x.uid);
  response.cookies.delete(SOCIAL_COOKIE_NAMES.x.returnTo);
  return response;
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const returnTo =
    cookieStore.get(SOCIAL_COOKIE_NAMES.x.returnTo)?.value ?? '/onboarding/step-4';

  try {
    const configStatus = getXConfigStatus();
    if (!configStatus.configured) {
      logSocialCallbackResult('x', 'failure', {
        error: 'x_env_missing',
        detail: configStatus.missing.join(', '),
      });
      return createCleanupResponse(
        NextResponse.redirect(
          appendOAuthResultToReturnTo({
            baseUrl: request.url,
            returnTo,
            error: 'x_env_missing',
            errorDescription: `Missing ${configStatus.missing.join(', ')}`,
          }),
        ),
      );
    }
    const oauthConfig = getXConfig();

    const code = request.nextUrl.searchParams.get('code');
    const state = request.nextUrl.searchParams.get('state');
    const error = request.nextUrl.searchParams.get('error');
    const errorDescription = request.nextUrl.searchParams.get('error_description');

    if (error) {
      logSocialCallbackResult('x', 'failure', {
        error,
        detail: errorDescription,
      });
      return createCleanupResponse(
        NextResponse.redirect(
          appendOAuthResultToReturnTo({
            baseUrl: request.url,
            returnTo,
            error,
            errorDescription: errorDescription ?? 'X authorization was cancelled or rejected.',
          }),
        ),
      );
    }

    const storedState = cookieStore.get(SOCIAL_COOKIE_NAMES.x.state)?.value;
    const callbackValidation = validateOAuthCallback({ code, state, storedState });
    if (!callbackValidation.ok) {
      logSocialCallbackResult('x', 'failure', { error: callbackValidation.error });
      return createCleanupResponse(
        NextResponse.redirect(
          appendOAuthResultToReturnTo({
            baseUrl: request.url,
            returnTo,
            error: callbackValidation.error,
            errorDescription: callbackValidation.message,
          }),
        ),
      );
    }

    const codeVerifier = cookieStore.get(SOCIAL_COOKIE_NAMES.x.codeVerifier)?.value;
    const firebaseUid = cookieStore.get(SOCIAL_COOKIE_NAMES.x.uid)?.value;

    if (!codeVerifier || !firebaseUid) {
      logSocialCallbackResult('x', 'failure', { error: 'session_expired' });
      return createCleanupResponse(
        NextResponse.redirect(
          appendOAuthResultToReturnTo({
            baseUrl: request.url,
            returnTo,
            error: 'session_expired',
            errorDescription: 'The X connection session expired before the callback completed.',
          }),
        ),
      );
    }

    const tokenRes = await fetch('https://api.x.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${oauthConfig.clientId}:${oauthConfig.clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code!,
        redirect_uri: oauthConfig.redirectUri,
        client_id: oauthConfig.clientId,
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenRes.ok) {
      logSocialCallbackResult('x', 'failure', {
        error: 'token_exchange_failed',
        detail: `status:${tokenRes.status}`,
      });
      return createCleanupResponse(
        NextResponse.redirect(
          appendOAuthResultToReturnTo({
            baseUrl: request.url,
            returnTo,
            error: 'token_exchange_failed',
            errorDescription: 'X did not accept the authorization code exchange.',
          }),
        ),
      );
    }

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;

    if (!accessToken) {
      logSocialCallbackResult('x', 'failure', {
        error: 'missing_access_token',
      });
      return createCleanupResponse(
        NextResponse.redirect(
          appendOAuthResultToReturnTo({
            baseUrl: request.url,
            returnTo,
            error: 'missing_access_token',
            errorDescription: 'X did not return an access token.',
          }),
        ),
      );
    }

    const userRes = await fetch('https://api.x.com/2/users/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userRes.ok) {
      logSocialCallbackResult('x', 'failure', {
        error: 'profile_fetch_failed',
        detail: `status:${userRes.status}`,
      });
      return createCleanupResponse(
        NextResponse.redirect(
          appendOAuthResultToReturnTo({
            baseUrl: request.url,
            returnTo,
            error: 'profile_fetch_failed',
            errorDescription: 'X connected, but the app could not load the account profile.',
          }),
        ),
      );
    }

    const userData = (await userRes.json()) as {
      data?: {
        id?: string;
        username?: string;
        name?: string;
      };
    };
    const accountName = userData.data?.username ? `@${userData.data.username}` : null;
    const accountId = userData.data?.id;

    if (!accountId) {
      logSocialCallbackResult('x', 'failure', {
        error: 'missing_account_id',
      });
      return createCleanupResponse(
        NextResponse.redirect(
          appendOAuthResultToReturnTo({
            baseUrl: request.url,
            returnTo,
            error: 'missing_account_id',
            errorDescription: 'X did not return a stable account identifier.',
          }),
        ),
      );
    }

    const user = await findUserByFirebaseUid(firebaseUid);
    if (!user) {
      logSocialCallbackResult('x', 'failure', {
        error: 'user_not_found',
        detail: firebaseUid,
      });
      return createCleanupResponse(
        NextResponse.redirect(
          appendOAuthResultToReturnTo({
            baseUrl: request.url,
            returnTo,
            error: 'user_not_found',
            errorDescription: 'The authenticated app user could not be found for this X connection.',
          }),
        ),
      );
    }

    const tokenExpiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : null;

    await upsertPlatformConnection(user.id, 'x', {
      accountName,
      accountId,
      accessToken,
      refreshToken,
      tokenExpiresAt,
      scopes: tokenData.scope?.split(' ').filter(Boolean) ?? [...SOCIAL_SCOPES.x],
      metadata: {
        profile: {
          id: userData.data?.id,
          username: userData.data?.username,
          name: userData.data?.name,
        },
      },
    });

    logSocialCallbackResult('x', 'success', {
      userId: user.id,
      returnTo,
    });

    return createCleanupResponse(
      NextResponse.redirect(
        appendOAuthResultToReturnTo({
          baseUrl: request.url,
          returnTo,
          provider: 'x',
          status: 'connected',
        }),
      ),
    );
  } catch (err) {
    logSocialCallbackResult('x', 'failure', {
      error: 'internal_error',
      detail: err instanceof Error ? err.message : 'unknown',
    });
    return createCleanupResponse(
      NextResponse.redirect(
        appendOAuthResultToReturnTo({
          baseUrl: request.url,
          returnTo,
          error: 'internal_error',
          errorDescription: 'X connection failed unexpectedly on the server.',
        }),
      ),
    );
  }
}
