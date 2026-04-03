type Provider = 'linkedin' | 'x';

type ProviderEnvConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

type ProviderStatus = {
  provider: Provider;
  configured: boolean;
  missing: string[];
  env: Partial<ProviderEnvConfig>;
};

const PROVIDER_ENV_KEYS = {
  linkedin: {
    clientId: ['LINKEDIN_CLIENT_ID'],
    clientSecret: ['LINKEDIN_CLIENT_SECRET'],
    redirectUri: ['LINKEDIN_REDIRECT_URI'],
  },
  x: {
    clientId: ['X_CLIENT_ID', 'TWITTER_CLIENT_ID'],
    clientSecret: ['X_CLIENT_SECRET', 'TWITTER_CLIENT_SECRET'],
    redirectUri: ['X_REDIRECT_URI', 'TWITTER_REDIRECT_URI'],
  },
} as const;

function readFirstEnvValue(keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}

function getProviderStatus(provider: Provider): ProviderStatus {
  const keys = PROVIDER_ENV_KEYS[provider];
  const env = {
    clientId: readFirstEnvValue(keys.clientId),
    clientSecret: readFirstEnvValue(keys.clientSecret),
    redirectUri: readFirstEnvValue(keys.redirectUri),
  };

  const missing: string[] = [];

  if (!env.clientId) {
    missing.push(keys.clientId[0]);
  }

  if (!env.clientSecret) {
    missing.push(keys.clientSecret[0]);
  }

  if (!env.redirectUri) {
    missing.push(keys.redirectUri[0]);
  }

  return {
    provider,
    configured: missing.length === 0,
    missing,
    env,
  };
}

function getProviderConfig(provider: Provider): ProviderEnvConfig {
  const status = getProviderStatus(provider);

  if (!status.configured) {
    throw new Error(
      `${provider} OAuth is not configured. Missing ${status.missing.join(', ')}.`,
    );
  }

  return {
    clientId: status.env.clientId!,
    clientSecret: status.env.clientSecret!,
    redirectUri: status.env.redirectUri!,
  };
}

export function getLinkedInConfig() {
  return getProviderConfig('linkedin');
}

export function getXConfig() {
  return getProviderConfig('x');
}

export function isLinkedInConfigured() {
  return getProviderStatus('linkedin').configured;
}

export function isXConfigured() {
  return getProviderStatus('x').configured;
}

export function getLinkedInConfigStatus() {
  return getProviderStatus('linkedin');
}

export function getXConfigStatus() {
  return getProviderStatus('x');
}

export function getSocialConfigStatus() {
  const linkedin = getProviderStatus('linkedin');
  const x = getProviderStatus('x');

  return {
    linkedin,
    x,
  };
}

export function isLinkedInOrganizationScopesEnabled() {
  const value = process.env.LINKEDIN_ENABLE_ORGANIZATION_SCOPES?.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

export type { Provider, ProviderEnvConfig, ProviderStatus };
