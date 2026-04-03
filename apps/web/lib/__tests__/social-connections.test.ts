import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockFindFirst,
  mockInsertValues,
  mockInsertReturning,
  mockUpdateSet,
  mockUpdateWhere,
  mockEncryptApiKey,
} = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockInsertValues: vi.fn(),
  mockInsertReturning: vi.fn(),
  mockUpdateSet: vi.fn(),
  mockUpdateWhere: vi.fn(),
  mockEncryptApiKey: vi.fn((value: string) => `enc:${value}`),
}));

vi.mock('@techjm/db', () => ({
  db: {
    query: {
      platformConnections: {
        findFirst: mockFindFirst,
      },
    },
    insert: vi.fn(() => ({
      values: mockInsertValues,
    })),
    update: vi.fn(() => ({
      set: mockUpdateSet,
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => []),
        })),
      })),
    })),
  },
  platformConnections: {
    id: 'id',
    userId: 'userId',
    platform: 'platform',
  },
  users: {
    firebaseUid: 'firebaseUid',
  },
}));

vi.mock('@techjm/db/encryption', () => ({
  encryptApiKey: mockEncryptApiKey,
  decryptApiKey: vi.fn((value: string) => value.replace('enc:', '')),
}));

vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => args,
  eq: (...args: unknown[]) => args,
}));

import { upsertPlatformConnection } from '../social-connections';

describe('social-connections', () => {
  beforeEach(() => {
    mockFindFirst.mockReset();
    mockInsertValues.mockReset();
    mockInsertReturning.mockReset();
    mockUpdateSet.mockReset();
    mockUpdateWhere.mockReset();
    mockEncryptApiKey.mockClear();

    mockInsertValues.mockReturnValue({
      returning: mockInsertReturning,
    });
    mockInsertReturning.mockResolvedValue([{ id: 'created-connection' }]);

    mockUpdateSet.mockReturnValue({
      where: mockUpdateWhere,
    });
    mockUpdateWhere.mockResolvedValue(undefined);
  });

  it('stores a new connection through insert when one does not already exist', async () => {
    mockFindFirst.mockResolvedValue(null);

    const id = await upsertPlatformConnection('user-1', 'linkedin', {
      accountName: 'Jane Doe',
      accountId: 'linkedin-user-1',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tokenExpiresAt: new Date('2026-01-01T00:00:00.000Z'),
      scopes: ['openid', 'w_member_social'],
      metadata: { profile: { sub: 'linkedin-user-1' } },
    });

    expect(id).toBe('created-connection');
    expect(mockInsertValues).toHaveBeenCalledTimes(1);
    expect(mockInsertValues.mock.calls[0][0]).toMatchObject({
      userId: 'user-1',
      platform: 'linkedin',
      accessTokenEnc: 'enc:access-token',
      refreshTokenEnc: 'enc:refresh-token',
      isActive: true,
      scopes: ['openid', 'w_member_social'],
    });
  });

  it('updates an existing connection when reconnecting', async () => {
    mockFindFirst.mockResolvedValue({ id: 'existing-1' });

    const id = await upsertPlatformConnection('user-1', 'x', {
      accountName: '@janedoe',
      accountId: 'x-user-1',
      accessToken: 'new-access-token',
      refreshToken: null,
      scopes: ['tweet.read', 'tweet.write'],
      metadata: { profile: { id: 'x-user-1' } },
    });

    expect(id).toBe('existing-1');
    expect(mockUpdateSet).toHaveBeenCalledTimes(1);
    expect(mockUpdateSet.mock.calls[0][0]).toMatchObject({
      accessTokenEnc: 'enc:new-access-token',
      refreshTokenEnc: null,
      accountName: '@janedoe',
      accountId: 'x-user-1',
      isActive: true,
    });
  });
});
