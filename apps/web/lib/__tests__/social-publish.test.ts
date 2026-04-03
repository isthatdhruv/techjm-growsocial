import { describe, expect, it } from 'vitest';

import { getPublishConnectionError } from '../social-publish';

describe('social-publish', () => {
  it('fails gracefully when the account is not connected', () => {
    expect(getPublishConnectionError(null, 'linkedin')).toBe(
      'Connect your LinkedIn account before publishing.',
    );
  });

  it('fails gracefully when the connected account needs reconnecting', () => {
    expect(
      getPublishConnectionError(
        { isActive: true, connectionHealth: 'expired' },
        'x',
      ),
    ).toBe(
      'Your X connection needs attention. Reconnect it in Settings before publishing.',
    );
  });

  it('allows publish when an active healthy connection is present', () => {
    expect(
      getPublishConnectionError(
        { isActive: true, connectionHealth: 'healthy' },
        'linkedin',
      ),
    ).toBeNull();
  });
});
