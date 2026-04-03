import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import https from 'node:https';
import { getLinkedInConfigStatus, getLinkedInConfig } from '@/lib/social-config';
import {
  SOCIAL_COOKIE_NAMES,
  SOCIAL_SCOPES,
  appendOAuthResultToReturnTo,
  validateOAuthCallback,
} from '@/lib/social-oauth';
import { findUserByFirebaseUid, upsertPlatformConnection } from '@/lib/social-connections';
import { logSocialCallbackResult } from '@/lib/social-logger';

export const dynamic = 'force-dynamic';

function getErrorDetail(err: unknown) {
  if (err instanceof Error) {
    const cause =
      typeof err.cause === 'object' &&
      err.cause &&
      'message' in err.cause &&
      typeof err.cause.message === 'string'
        ? ` | cause: ${err.cause.message}`
        : '';
    return `${err.message}${cause}`;
  }

  return String(err);
}

async function fetchWithLinkedInDiagnostics(
  input: string,
  init: RequestInit,
  label: string,
) {
  try {
    return await fetch(input, init);
  } catch (err) {
    throw new Error(`${label} request failed: ${getErrorDetail(err)}`);
  }
}

async function fetchLinkedInUserInfo(accessToken: string) {
  return await new Promise<{
    status: number;
    ok: boolean;
    json: () => Promise<unknown>;
    text: () => Promise<string>;
  }>((resolve, reject) => {
    const req = https.request(
      'https://api.linkedin.com/v2/userinfo',
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];

        res.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          resolve({
            status: res.statusCode ?? 500,
            ok: (res.statusCode ?? 500) >= 200 && (res.statusCode ?? 500) < 300,
            json: async () => JSON.parse(body),
            text: async () => body,
          });
        });
      },
    );

    req.on('error', (err) => {
      reject(new Error(`LinkedIn userinfo request failed: ${getErrorDetail(err)}`));
    });

    req.end();
  });
}

function decodeJwtPayload(token: string) {
  const [, payload] = token.split('.');
  if (!payload) {
    throw new Error('LinkedIn id_token is malformed');
  }

  const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as {
    sub?: string;
    given_name?: string;
    family_name?: string;
    name?: string;
    email?: string;
    email_verified?: boolean;
  };
}

async function fetchLinkedInProfile(accessToken: string, idToken?: string) {
  if (idToken) {
    const profile = decodeJwtPayload(idToken);
    if (profile.sub) {
      return {
        ok: true as const,
        profile: {
          id: profile.sub,
          localizedFirstName: profile.given_name,
          localizedLastName: profile.family_name,
          name: profile.name,
          email: profile.email ?? null,
          emailVerified: profile.email_verified ?? null,
        },
        email: profile.email ?? null,
        source: 'id_token' as const,
      };
    }
  }

  const userInfoRes = await fetchLinkedInUserInfo(accessToken);

  if (userInfoRes.ok) {
    const profile = (await userInfoRes.json()) as {
      sub?: string;
      given_name?: string;
      family_name?: string;
      name?: string;
      email?: string;
      email_verified?: boolean;
    };

    return {
      ok: true as const,
      profile: {
        id: profile.sub,
        localizedFirstName: profile.given_name,
        localizedLastName: profile.family_name,
        name: profile.name,
        email: profile.email ?? null,
        emailVerified: profile.email_verified ?? null,
      },
      email: profile.email ?? null,
      source: 'userinfo' as const,
    };
  }

  const userInfoText = await userInfoRes.text().catch(() => '');

  const [profileRes, emailRes] = await Promise.all([
    fetchWithLinkedInDiagnostics(
      'https://api.linkedin.com/v2/me',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
        },
      },
      'LinkedIn v2/me',
    ),
    fetchWithLinkedInDiagnostics(
      'https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
        },
      },
      'LinkedIn emailAddress',
    ).catch(() => null),
  ]);

  if (!profileRes.ok) {
    const profileText = await profileRes.text().catch(() => '');
    return {
      ok: false as const,
      status: profileRes.status,
      detail: `userinfo_status=${userInfoRes.status} userinfo_body=${userInfoText || 'empty'} | v2_me_body=${profileText || 'empty'}`,
    };
  }

  const profile = (await profileRes.json()) as {
    id?: string;
    localizedFirstName?: string;
    localizedLastName?: string;
  };

  let email: string | null = null;
  if (emailRes?.ok) {
    const emailPayload = (await emailRes.json()) as {
      elements?: Array<{ ['handle~']?: { emailAddress?: string } }>;
    };
    email = emailPayload.elements?.[0]?.['handle~']?.emailAddress || null;
  }

  return {
    ok: true as const,
    profile,
    email,
    source: 'legacy' as const,
  };
}

function createCleanupResponse(response: NextResponse) {
  response.cookies.delete(SOCIAL_COOKIE_NAMES.linkedin.state);
  response.cookies.delete(SOCIAL_COOKIE_NAMES.linkedin.uid);
  response.cookies.delete(SOCIAL_COOKIE_NAMES.linkedin.returnTo);
  return response;
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const returnTo =
    cookieStore.get(SOCIAL_COOKIE_NAMES.linkedin.returnTo)?.value ?? '/onboarding/step-4';

  try {
    const configStatus = getLinkedInConfigStatus();
    if (!configStatus.configured) {
      logSocialCallbackResult('linkedin', 'failure', {
        error: 'linkedin_env_missing',
        detail: configStatus.missing.join(', '),
      });
      return createCleanupResponse(
        NextResponse.redirect(
          appendOAuthResultToReturnTo({
            baseUrl: request.url,
            returnTo,
            error: 'linkedin_env_missing',
            errorDescription: `Missing ${configStatus.missing.join(', ')}`,
          }),
        ),
      );
    }
    const oauthConfig = getLinkedInConfig();

    const code = request.nextUrl.searchParams.get('code');
    const state = request.nextUrl.searchParams.get('state');
    const error = request.nextUrl.searchParams.get('error');
    const errorDescription = request.nextUrl.searchParams.get('error_description');

    if (error) {
      logSocialCallbackResult('linkedin', 'failure', {
        error,
        detail: errorDescription,
      });
      return createCleanupResponse(
        NextResponse.redirect(
          appendOAuthResultToReturnTo({
            baseUrl: request.url,
            returnTo,
            error,
            errorDescription: errorDescription ?? 'LinkedIn authorization was cancelled or rejected.',
          }),
        ),
      );
    }

    const storedState = cookieStore.get(SOCIAL_COOKIE_NAMES.linkedin.state)?.value;
    const callbackValidation = validateOAuthCallback({ code, state, storedState });
    if (!callbackValidation.ok) {
      logSocialCallbackResult('linkedin', 'failure', { error: 'invalid_state' });
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

    const tokenRes = await fetchWithLinkedInDiagnostics(
      'https://www.linkedin.com/oauth/v2/accessToken',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: code!,
          redirect_uri: oauthConfig.redirectUri,
          client_id: oauthConfig.clientId,
          client_secret: oauthConfig.clientSecret,
        }),
      },
      'LinkedIn accessToken exchange',
    );

    if (!tokenRes.ok) {
      logSocialCallbackResult('linkedin', 'failure', {
        error: 'token_exchange_failed',
        detail: `status:${tokenRes.status}`,
      });
      return createCleanupResponse(
        NextResponse.redirect(
          appendOAuthResultToReturnTo({
            baseUrl: request.url,
            returnTo,
            error: 'token_exchange_failed',
            errorDescription: 'LinkedIn did not accept the authorization code exchange.',
          }),
        ),
      );
    }

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      id_token?: string;
      expires_in?: number;
      scope?: string;
    };
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;

    if (!accessToken) {
      logSocialCallbackResult('linkedin', 'failure', {
        error: 'missing_access_token',
      });
      return createCleanupResponse(
        NextResponse.redirect(
          appendOAuthResultToReturnTo({
            baseUrl: request.url,
            returnTo,
            error: 'missing_access_token',
            errorDescription: 'LinkedIn did not return an access token.',
          }),
        ),
      );
    }

    const profileResult = await fetchLinkedInProfile(accessToken, tokenData.id_token);

    if (!profileResult.ok) {
      logSocialCallbackResult('linkedin', 'failure', {
        error: 'profile_fetch_failed',
        detail: `status:${profileResult.status}${'detail' in profileResult && profileResult.detail ? ` ${profileResult.detail}` : ''}`,
      });
      return createCleanupResponse(
        NextResponse.redirect(
          appendOAuthResultToReturnTo({
            baseUrl: request.url,
            returnTo,
            error: 'profile_fetch_failed',
            errorDescription:
              process.env.NODE_ENV === 'development'
                ? `LinkedIn profile fetch failed: status ${profileResult.status}${'detail' in profileResult && profileResult.detail ? ` | ${profileResult.detail}` : ''}`
                : 'LinkedIn connected, but the app could not load the account profile.',
          }),
        ),
      );
    }

    const profile = profileResult.profile;
    const accountName = [profile.localizedFirstName, profile.localizedLastName]
      .filter(Boolean)
      .join(' ') || ('name' in profile ? profile.name || '' : '');
    const accountId = profile.id;

    if (!accountId) {
      logSocialCallbackResult('linkedin', 'failure', {
        error: 'missing_account_id',
      });
      return createCleanupResponse(
        NextResponse.redirect(
          appendOAuthResultToReturnTo({
            baseUrl: request.url,
            returnTo,
            error: 'missing_account_id',
            errorDescription: 'LinkedIn did not return a stable account identifier.',
          }),
        ),
      );
    }

    const firebaseUid = cookieStore.get(SOCIAL_COOKIE_NAMES.linkedin.uid)?.value;
    if (!firebaseUid) {
      logSocialCallbackResult('linkedin', 'failure', { error: 'session_expired' });
      return createCleanupResponse(
        NextResponse.redirect(
          appendOAuthResultToReturnTo({
            baseUrl: request.url,
            returnTo,
            error: 'session_expired',
            errorDescription: 'The LinkedIn connection session expired before the callback completed.',
          }),
        ),
      );
    }

    const user = await findUserByFirebaseUid(firebaseUid);
    if (!user) {
      logSocialCallbackResult('linkedin', 'failure', {
        error: 'user_not_found',
        detail: firebaseUid,
      });
      return createCleanupResponse(
        NextResponse.redirect(
          appendOAuthResultToReturnTo({
            baseUrl: request.url,
            returnTo,
            error: 'user_not_found',
            errorDescription: 'The authenticated app user could not be found for this LinkedIn connection.',
          }),
        ),
      );
    }

    const tokenExpiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : null;

    await upsertPlatformConnection(user.id, 'linkedin', {
      accountName: accountName || null,
      accountId,
      accessToken,
      refreshToken,
      tokenExpiresAt,
      scopes: tokenData.scope?.split(' ').filter(Boolean) ?? [...SOCIAL_SCOPES.linkedin],
      metadata: {
        profileSource: profileResult.source,
        idToken: tokenData.id_token ?? null,
        profile: {
          id: profile.id,
          localizedFirstName: profile.localizedFirstName,
          localizedLastName: profile.localizedLastName,
          name: 'name' in profile ? profile.name ?? null : null,
          email: profileResult.email,
          emailVerified: 'emailVerified' in profile ? profile.emailVerified ?? null : null,
        },
      },
    });

    logSocialCallbackResult('linkedin', 'success', {
      userId: user.id,
      returnTo,
    });

    return createCleanupResponse(
      NextResponse.redirect(
        appendOAuthResultToReturnTo({
          baseUrl: request.url,
          returnTo,
          provider: 'linkedin',
          status: 'connected',
        }),
      ),
    );
  } catch (err) {
    const detail = getErrorDetail(err);
    logSocialCallbackResult('linkedin', 'failure', {
      error: 'internal_error',
      detail,
    });
    return createCleanupResponse(
      NextResponse.redirect(
        appendOAuthResultToReturnTo({
          baseUrl: request.url,
          returnTo,
          error: 'internal_error',
          errorDescription:
            process.env.NODE_ENV === 'development'
              ? `LinkedIn server error: ${detail}`
              : 'LinkedIn connection failed unexpectedly on the server.',
        }),
      ),
    );
  }
}
