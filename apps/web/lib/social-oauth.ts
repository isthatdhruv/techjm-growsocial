import { createHash, randomBytes } from 'node:crypto';

export type SocialProvider = 'linkedin' | 'x';

type OAuthContext = {
  provider: SocialProvider;
  state: string;
  returnTo: string;
  firebaseUid: string;
  codeVerifier?: string;
};

export const SOCIAL_COOKIE_NAMES = {
  linkedin: {
    state: 'linkedin_oauth_state',
    uid: 'linkedin_oauth_uid',
    returnTo: 'linkedin_oauth_return_to',
  },
  x: {
    state: 'x_oauth_state',
    uid: 'x_oauth_uid',
    returnTo: 'x_oauth_return_to',
    codeVerifier: 'x_oauth_code_verifier',
  },
} as const;

export const SOCIAL_SCOPES = {
  linkedin: ['openid', 'profile', 'email', 'w_member_social'],
  x: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
} as const;

export const LINKEDIN_ORGANIZATION_SCOPES = [
  'r_organization_social',
  'w_organization_social',
] as const;

export function createOAuthState() {
  return randomBytes(32).toString('hex');
}

export function createPkceCodeVerifier() {
  return randomBytes(32).toString('base64url');
}

export function createPkceCodeChallenge(codeVerifier: string) {
  return createHash('sha256').update(codeVerifier).digest('base64url');
}

export function buildLinkedInAuthorizeUrl(config: {
  clientId: string;
  redirectUri: string;
  state: string;
  includeOrganizationScopes?: boolean;
}) {
  const scopes = config.includeOrganizationScopes
    ? [...SOCIAL_SCOPES.linkedin, ...LINKEDIN_ORGANIZATION_SCOPES]
    : [...SOCIAL_SCOPES.linkedin];

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    state: config.state,
    scope: scopes.join(' '),
  });

  return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
}

export function buildXAuthorizeUrl(config: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    state: config.state,
    scope: SOCIAL_SCOPES.x.join(' '),
    code_challenge: config.codeChallenge,
    code_challenge_method: 'S256',
  });

  return `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
}

export function getSafeReturnTo(
  returnTo: string | null | undefined,
  fallback = '/onboarding/step-4',
) {
  if (!returnTo || !returnTo.startsWith('/') || returnTo.startsWith('//')) {
    return fallback;
  }

  return returnTo;
}

export function appendOAuthResultToReturnTo(params: {
  baseUrl: string;
  returnTo: string;
  provider?: SocialProvider;
  status?: 'connected';
  error?: string;
  errorDescription?: string;
}) {
  const url = new URL(params.returnTo, params.baseUrl);

  if (params.provider && params.status) {
    url.searchParams.set(params.provider, params.status);
  }

  if (params.error) {
    url.searchParams.set('error', params.error);
  }

  if (params.errorDescription) {
    url.searchParams.set('error_description', params.errorDescription);
  }

  return url;
}

export function validateOAuthCallback(params: {
  code: string | null;
  state: string | null;
  storedState: string | null | undefined;
}) {
  if (!params.code || !params.state) {
    return {
      ok: false as const,
      error: 'missing_params',
      message: 'The provider callback did not return the required code and state.',
    };
  }

  if (!params.storedState || params.state !== params.storedState) {
    return {
      ok: false as const,
      error: 'invalid_state',
      message: 'The provider callback state did not match the active session.',
    };
  }

  return {
    ok: true as const,
  };
}

export function createOAuthContext(params: {
  provider: SocialProvider;
  firebaseUid: string;
  returnTo?: string | null;
  fallbackReturnTo?: string;
  withPkce?: boolean;
}) {
  const state = createOAuthState();
  const codeVerifier = params.withPkce ? createPkceCodeVerifier() : undefined;

  return {
    provider: params.provider,
    state,
    firebaseUid: params.firebaseUid,
    returnTo: getSafeReturnTo(params.returnTo, params.fallbackReturnTo),
    codeVerifier,
  } satisfies OAuthContext;
}
