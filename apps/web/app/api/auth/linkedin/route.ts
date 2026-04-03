import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { findUserByFirebaseUid } from '@/lib/social-connections';
import {
  getLinkedInConfig,
  getLinkedInConfigStatus,
  isLinkedInOrganizationScopesEnabled,
} from '@/lib/social-config';
import {
  SOCIAL_COOKIE_NAMES,
  buildLinkedInAuthorizeUrl,
  createOAuthContext,
} from '@/lib/social-oauth';
import { logSocialConnectStart } from '@/lib/social-logger';

export const dynamic = 'force-dynamic';

function applyOAuthCookies(response: NextResponse, context: ReturnType<typeof createOAuthContext>) {
  response.cookies.set(SOCIAL_COOKIE_NAMES.linkedin.state, context.state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });

  response.cookies.set(SOCIAL_COOKIE_NAMES.linkedin.uid, context.firebaseUid, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });

  response.cookies.set(SOCIAL_COOKIE_NAMES.linkedin.returnTo, context.returnTo, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });
}

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

async function startLinkedInOAuth(request: NextRequest) {
  const status = getLinkedInConfigStatus();
  if (!status.configured) {
    return NextResponse.json(
      {
        error: 'linkedin_not_configured',
        missing: status.missing,
      },
      { status: 500 },
    );
  }

  const config = getLinkedInConfig();
  const firebaseUid = await resolveFirebaseUid(request);
  if (!firebaseUid) {
    return NextResponse.json({ error: 'Missing authenticated user' }, { status: 400 });
  }

  const context = createOAuthContext({
    provider: 'linkedin',
    firebaseUid,
    returnTo:
      request.nextUrl.searchParams.get('returnTo') ??
      request.headers.get('x-return-to') ??
      '/onboarding/step-4',
    fallbackReturnTo: '/onboarding/step-4',
  });

  const authorizeUrl = buildLinkedInAuthorizeUrl({
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    state: context.state,
    includeOrganizationScopes: isLinkedInOrganizationScopesEnabled(),
  });

  logSocialConnectStart('linkedin', {
    firebaseUid,
    returnTo: context.returnTo,
  });

  const response = NextResponse.json({ authorizeUrl });
  applyOAuthCookies(response, context);
  return response;
}

export async function GET(request: NextRequest) {
  return startLinkedInOAuth(request);
}

export async function POST(request: NextRequest) {
  return startLinkedInOAuth(request);
}
