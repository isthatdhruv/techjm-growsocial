import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, createHash } from 'node:crypto';

export const dynamic = 'force-dynamic';

function generateCodeVerifier() {
  return randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier: string) {
  return createHash('sha256').update(verifier).digest('base64url');
}

export async function GET(request: NextRequest) {
  const firebaseUid = request.nextUrl.searchParams.get('uid');
  if (!firebaseUid) {
    return NextResponse.json({ error: 'Missing uid' }, { status: 400 });
  }

  const state = randomBytes(32).toString('hex');
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.X_CLIENT_ID!,
    redirect_uri: process.env.X_REDIRECT_URI!,
    scope: 'tweet.read tweet.write users.read offline.access',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  const response = NextResponse.redirect(
    `https://twitter.com/i/oauth2/authorize?${params.toString()}`,
  );

  response.cookies.set('x_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });

  response.cookies.set('x_oauth_code_verifier', codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });

  response.cookies.set('x_oauth_uid', firebaseUid, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });

  return response;
}
