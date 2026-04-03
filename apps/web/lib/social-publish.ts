type PublishableConnection = {
  isActive?: boolean | null;
  connectionHealth?: string | null;
};

export function getPublishConnectionError(
  connection: PublishableConnection | null | undefined,
  platform: 'linkedin' | 'x',
) {
  const providerLabel = platform === 'linkedin' ? 'LinkedIn' : 'X';

  if (!connection || connection.isActive === false) {
    return `Connect your ${providerLabel} account before publishing.`;
  }

  if (
    connection.connectionHealth === 'expired' ||
    connection.connectionHealth === 'degraded'
  ) {
    return `Your ${providerLabel} connection needs attention. Reconnect it in Settings before publishing.`;
  }

  return null;
}
