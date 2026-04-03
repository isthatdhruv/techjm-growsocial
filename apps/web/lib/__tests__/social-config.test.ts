import { afterEach, describe, expect, it } from 'vitest';

import {
  getLinkedInConfig,
  getLinkedInConfigStatus,
  getSocialConfigStatus,
  getXConfig,
  getXConfigStatus,
} from '../social-config';

const ORIGINAL_ENV = { ...process.env };

describe('social-config', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('detects missing LinkedIn env vars', () => {
    delete process.env.LINKEDIN_CLIENT_ID;
    delete process.env.LINKEDIN_CLIENT_SECRET;
    delete process.env.LINKEDIN_REDIRECT_URI;

    expect(getLinkedInConfigStatus()).toEqual({
      provider: 'linkedin',
      configured: false,
      missing: [
        'LINKEDIN_CLIENT_ID',
        'LINKEDIN_CLIENT_SECRET',
        'LINKEDIN_REDIRECT_URI',
      ],
      env: {
        clientId: undefined,
        clientSecret: undefined,
        redirectUri: undefined,
      },
    });
  });

  it('detects valid LinkedIn env vars and trims whitespace', () => {
    process.env.LINKEDIN_CLIENT_ID = ' linkedin-id ';
    process.env.LINKEDIN_CLIENT_SECRET = ' linkedin-secret ';
    process.env.LINKEDIN_REDIRECT_URI = ' https://app.example.com/api/auth/linkedin/callback ';

    expect(getLinkedInConfig()).toEqual({
      clientId: 'linkedin-id',
      clientSecret: 'linkedin-secret',
      redirectUri: 'https://app.example.com/api/auth/linkedin/callback',
    });
  });

  it('detects missing X env vars', () => {
    delete process.env.X_CLIENT_ID;
    delete process.env.X_CLIENT_SECRET;
    delete process.env.X_REDIRECT_URI;
    delete process.env.TWITTER_CLIENT_ID;
    delete process.env.TWITTER_CLIENT_SECRET;
    delete process.env.TWITTER_REDIRECT_URI;

    expect(getXConfigStatus()).toEqual({
      provider: 'x',
      configured: false,
      missing: ['X_CLIENT_ID', 'X_CLIENT_SECRET', 'X_REDIRECT_URI'],
      env: {
        clientId: undefined,
        clientSecret: undefined,
        redirectUri: undefined,
      },
    });
  });

  it('accepts valid X env vars through legacy Twitter aliases', () => {
    process.env.TWITTER_CLIENT_ID = 'twitter-id';
    process.env.TWITTER_CLIENT_SECRET = 'twitter-secret';
    process.env.TWITTER_REDIRECT_URI = 'https://app.example.com/api/auth/x/callback';

    expect(getXConfig()).toEqual({
      clientId: 'twitter-id',
      clientSecret: 'twitter-secret',
      redirectUri: 'https://app.example.com/api/auth/x/callback',
    });
  });

  it('returns combined social config status', () => {
    process.env.LINKEDIN_CLIENT_ID = 'linkedin-id';
    process.env.LINKEDIN_CLIENT_SECRET = 'linkedin-secret';
    process.env.LINKEDIN_REDIRECT_URI = 'https://app.example.com/api/auth/linkedin/callback';
    delete process.env.X_CLIENT_ID;
    delete process.env.X_CLIENT_SECRET;
    delete process.env.X_REDIRECT_URI;

    expect(getSocialConfigStatus()).toMatchObject({
      linkedin: { configured: true, missing: [] },
      x: {
        configured: false,
        missing: ['X_CLIENT_ID', 'X_CLIENT_SECRET', 'X_REDIRECT_URI'],
      },
    });
  });
});
