import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { findUserByFirebaseUid } from '@/lib/social-connections';
import { getXConfig, getXConfigStatus } from '@/lib/social-config';
import {
  SOCIAL_COOKIE_NAMES,
  buildXAuthorizeUrl,
  createOAuthContext,
  createPkceCodeChallenge,
} from '@/lib/social-oauth';
import { logSocialConnectStart } from '@/lib/social-logger';

export const dynamic = 'force-dynamic';

async function resolveFirebaseUid(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request).catch(() => null);
  if (authUser?.firebaseUid) {
    return authUser.firebaseUid;
  }

  const firebaseUid = request.nextUrl.searchParams.get('uid');
  if (!firebaseUid) {
    return null;
  }

  const user = await findUserByFirebaseUid(firebaseUid);
  return user?.firebaseUid ?? null;
}

function applyOAuthCookies(response: NextResponse, context: ReturnType<typeof createOAuthContext>) {
  response.cookies.set(SOCIAL_COOKIE_NAMES.x.state, context.state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });

  response.cookies.set(SOCIAL_COOKIE_NAMES.x.uid, context.firebaseUid, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });

  response.cookies.set(SOCIAL_COOKIE_NAMES.x.returnTo, context.returnTo, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });

  if (context.codeVerifier) {
    response.cookies.set(SOCIAL_COOKIE_NAMES.x.codeVerifier, context.codeVerifier, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600,
      path: '/',
    });
  }
}

async function startXOAuth(request: NextRequest) {
  const configStatus = getXConfigStatus();
  if (!configStatus.configured) {
    return NextResponse.json(
      {
        error: 'x_not_configured',
        missing: configStatus.missing,
      },
      { status: 500 },
    );
  }

  const firebaseUid = await resolveFirebaseUid(request);
  if (!firebaseUid) {
    return NextResponse.json({ error: 'Missing authenticated user' }, { status: 400 });
  }

  const oauthConfig = getXConfig();
  const context = createOAuthContext({
    provider: 'x',
    firebaseUid,
    returnTo:
      request.nextUrl.searchParams.get('returnTo') ??
      request.headers.get('x-return-to') ??
      '/onboarding/step-4',
    fallbackReturnTo: '/onboarding/step-4',
    withPkce: true,
  });
  const codeChallenge = createPkceCodeChallenge(context.codeVerifier!);
  const authorizeUrl = buildXAuthorizeUrl({
    clientId: oauthConfig.clientId,
    redirectUri: oauthConfig.redirectUri,
    state: context.state,
    codeChallenge,
  });

  logSocialConnectStart('x', {
    firebaseUid,
    returnTo: context.returnTo,
  });

  const response = NextResponse.json({ authorizeUrl });
  applyOAuthCookies(response, context);
  return response;
}

export async function GET(request: NextRequest) {
  return startXOAuth(request);
}

export async function POST(request: NextRequest) {
  return startXOAuth(request);
}
