import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const firebaseUid = request.nextUrl.searchParams.get('uid');
  if (!firebaseUid) {
    return NextResponse.json({ error: 'Missing uid' }, { status: 400 });
  }

  const state = randomBytes(32).toString('hex');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.LINKEDIN_CLIENT_ID!,
    redirect_uri: process.env.LINKEDIN_REDIRECT_URI!,
    scope: 'openid profile email w_member_social r_organization_social w_organization_social',
    state,
  });

  const response = NextResponse.redirect(
    `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`,
  );

  response.cookies.set('linkedin_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  });

  response.cookies.set('linkedin_oauth_uid', firebaseUid, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });

  return response;
}
