import { describe, expect, it } from 'vitest';

import {
  buildLinkedInAuthorizeUrl,
  buildXAuthorizeUrl,
  validateOAuthCallback,
} from '../social-oauth';

describe('social-oauth', () => {
  it('builds a LinkedIn authorize URL with client_id redirect_uri state and scope', () => {
    const url = new URL(
      buildLinkedInAuthorizeUrl({
        clientId: 'linkedin-client',
        redirectUri: 'https://app.example.com/api/auth/linkedin/callback',
        state: 'linkedin-state',
      }),
    );

    expect(url.origin).toBe('https://www.linkedin.com');
    expect(url.searchParams.get('client_id')).toBe('linkedin-client');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://app.example.com/api/auth/linkedin/callback',
    );
    expect(url.searchParams.get('state')).toBe('linkedin-state');
    expect(url.searchParams.get('scope')).toContain('w_member_social');
    expect(url.searchParams.get('scope')).toContain('openid');
    expect(url.searchParams.get('scope')).toContain('profile');
    expect(url.searchParams.get('scope')).toContain('email');
  });

  it('builds an X authorize URL with client_id redirect_uri state and PKCE fields', () => {
    const url = new URL(
      buildXAuthorizeUrl({
        clientId: 'x-client',
        redirectUri: 'https://app.example.com/api/auth/x/callback',
        state: 'x-state',
        codeChallenge: 'pkce-challenge',
      }),
    );

    expect(url.origin).toBe('https://twitter.com');
    expect(url.searchParams.get('client_id')).toBe('x-client');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://app.example.com/api/auth/x/callback',
    );
    expect(url.searchParams.get('state')).toBe('x-state');
    expect(url.searchParams.get('code_challenge')).toBe('pkce-challenge');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('fails callback validation gracefully on missing code or state', () => {
    expect(
      validateOAuthCallback({
        code: null,
        state: 'state',
        storedState: 'state',
      }),
    ).toEqual({
      ok: false,
      error: 'missing_params',
      message: 'The provider callback did not return the required code and state.',
    });
  });

  it('fails callback validation when state is invalid', () => {
    expect(
      validateOAuthCallback({
        code: 'code',
        state: 'state-a',
        storedState: 'state-b',
      }),
    ).toEqual({
      ok: false,
      error: 'invalid_state',
      message: 'The provider callback state did not match the active session.',
    });
  });
});
