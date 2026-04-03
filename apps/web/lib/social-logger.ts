import type { SocialProvider } from './social-oauth';

type LogContext = Record<string, unknown>;

function log(level: 'info' | 'error', event: string, context: LogContext) {
  const payload = {
    event,
    provider: context.provider,
    userId: context.userId,
    returnTo: context.returnTo,
    status: context.status,
    error: context.error,
    detail: context.detail,
  };

  if (level === 'error') {
    console.error('[social]', payload);
    return;
  }

  console.info('[social]', payload);
}

export function logSocialConnectStart(provider: SocialProvider, context: LogContext) {
  log('info', 'social.connect.start', { provider, ...context });
}

export function logSocialCallbackResult(
  provider: SocialProvider,
  status: 'success' | 'failure',
  context: LogContext,
) {
  log(status === 'success' ? 'info' : 'error', 'social.callback', {
    provider,
    status,
    ...context,
  });
}

export function logPublishEvent(
  provider: SocialProvider,
  status: 'start' | 'failure',
  context: LogContext,
) {
  log(status === 'failure' ? 'error' : 'info', 'social.publish', {
    provider,
    status,
    ...context,
  });
}
