import { db, platformConnections, users } from '@techjm/db';
import { decryptApiKey, encryptApiKey } from '@techjm/db/encryption';
import { and, eq } from 'drizzle-orm';
import https from 'node:https';
import {
  getLinkedInConfigStatus,
  getSocialConfigStatus,
  type Provider,
} from './social-config';

type ProviderConnectionRecord = {
  accountName: string | null;
  accountId: string | null;
  orgUrn?: string | null;
  accessToken: string;
  refreshToken?: string | null;
  tokenExpiresAt?: Date | null;
  scopes?: string[];
  metadata?: Record<string, unknown>;
};

type TestConnectionResult = {
  ok: boolean;
  message: string;
  accountName?: string | null;
};

async function fetchLinkedInUserInfo(accessToken: string) {
  return await new Promise<{
    status: number;
    ok: boolean;
    body: string;
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
          resolve({
            status: res.statusCode ?? 500,
            ok: (res.statusCode ?? 500) >= 200 && (res.statusCode ?? 500) < 300,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );

    req.on('error', reject);
    req.end();
  });
}

export async function findUserByFirebaseUid(firebaseUid: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.firebaseUid, firebaseUid))
    .limit(1);

  return user ?? null;
}

export async function upsertPlatformConnection(
  userId: string,
  provider: Provider,
  record: ProviderConnectionRecord,
) {
  const encryptedAccessToken = encryptApiKey(record.accessToken);
  const encryptedRefreshToken = record.refreshToken
    ? encryptApiKey(record.refreshToken)
    : null;

  const existing = await db.query.platformConnections.findFirst({
    where: and(
      eq(platformConnections.userId, userId),
      eq(platformConnections.platform, provider),
    ),
    columns: {
      id: true,
    },
  });

  const values = {
    accessTokenEnc: encryptedAccessToken,
    refreshTokenEnc: encryptedRefreshToken,
    tokenExpiresAt: record.tokenExpiresAt ?? null,
    accountName: record.accountName,
    accountId: record.accountId,
    orgUrn: record.orgUrn ?? null,
    scopes: record.scopes ?? [],
    metadata: record.metadata ?? {},
    isActive: true,
    connectionHealth: 'healthy' as const,
    lastHealthCheck: new Date(),
    updatedAt: new Date(),
  };

  if (existing) {
    await db
      .update(platformConnections)
      .set(values)
      .where(eq(platformConnections.id, existing.id));

    return existing.id;
  }

  const [created] = await db
    .insert(platformConnections)
    .values({
      userId,
      platform: provider,
      createdAt: new Date(),
      ...values,
    })
    .returning({ id: platformConnections.id });

  return created?.id ?? null;
}

export async function disconnectPlatformConnection(userId: string, provider: Provider) {
  await db
    .delete(platformConnections)
    .where(
      and(
        eq(platformConnections.userId, userId),
        eq(platformConnections.platform, provider),
      ),
    );
}

export async function getConnectionStatusForUser(userId: string) {
  const [connections, config] = await Promise.all([
    db.query.platformConnections.findMany({
      where: eq(platformConnections.userId, userId),
      columns: {
        platform: true,
        accountName: true,
        accountId: true,
        orgUrn: true,
        connectionHealth: true,
        tokenExpiresAt: true,
        lastHealthCheck: true,
      },
    }),
    Promise.resolve(getSocialConfigStatus()),
  ]);

  return {
    connections,
    oauth: {
      linkedin: {
        configured: config.linkedin.configured,
        missing: config.linkedin.missing,
      },
      x: {
        configured: config.x.configured,
        missing: config.x.missing,
      },
    },
  };
}

export async function testPlatformConnection(
  userId: string,
  provider: Provider,
): Promise<TestConnectionResult> {
  const connection = await db.query.platformConnections.findFirst({
    where: and(
      eq(platformConnections.userId, userId),
      eq(platformConnections.platform, provider),
    ),
    columns: {
      id: true,
      accessTokenEnc: true,
      accountName: true,
    },
  });

  if (!connection) {
    return {
      ok: false,
      message: `No active ${provider === 'linkedin' ? 'LinkedIn' : 'X'} connection found.`,
    };
  }

  const accessToken = decryptApiKey(connection.accessTokenEnc);

  if (provider === 'linkedin') {
    const userInfoResponse = await fetchLinkedInUserInfo(accessToken).catch(() => null);

    if (userInfoResponse?.ok) {
      const profile = JSON.parse(userInfoResponse.body) as {
        name?: string;
        given_name?: string;
        family_name?: string;
      };

      return {
        ok: true,
        message: 'LinkedIn connection is healthy.',
        accountName:
          [profile.given_name, profile.family_name].filter(Boolean).join(' ') ||
          profile.name ||
          connection.accountName,
      };
    }

    const response = await fetch('https://api.linkedin.com/v2/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Restli-Protocol-Version': '2.0.0',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return {
        ok: false,
        message: 'LinkedIn connection test failed. Reconnect the account and try again.',
      };
    }

    const profile = (await response.json()) as {
      id?: string;
      localizedFirstName?: string;
      localizedLastName?: string;
    };

    return {
      ok: true,
      message: 'LinkedIn connection is healthy.',
      accountName:
        [profile.localizedFirstName, profile.localizedLastName].filter(Boolean).join(' ') ||
        connection.accountName,
    };
  }

  const response = await fetch('https://api.x.com/2/users/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    return {
      ok: false,
      message: 'X connection test failed. Reconnect the account and try again.',
    };
  }

  const profile = (await response.json()) as {
    data?: { name?: string; username?: string };
  };

  return {
    ok: true,
    message: 'X connection is healthy.',
    accountName:
      profile.data?.username ? `@${profile.data.username}` : profile.data?.name ?? connection.accountName,
  };
}

export function getLinkedInDefaultOrgMode() {
  return getLinkedInConfigStatus().configured;
}
