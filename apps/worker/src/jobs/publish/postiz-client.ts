const POSTIZ_API_URL = process.env.POSTIZ_API_URL || 'http://localhost:5000';
const POSTIZ_API_KEY = process.env.POSTIZ_API_KEY;

interface PostizPublishResult {
  externalId: string;
  url?: string;
}

type PostizIntegration = {
  id: string;
  identifier?: string;
  name?: string;
};

type PostizMedia = {
  id: string;
  path: string;
};

export function isPostizConfigured(): boolean {
  return Boolean(POSTIZ_API_KEY && POSTIZ_API_URL);
}

function getPostizHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: POSTIZ_API_KEY!,
  };
}

async function readTextSafely(response: Response) {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

async function assertPostizHealthy() {
  if (!POSTIZ_API_KEY) {
    throw new Error('Postiz API key not configured');
  }

  try {
    const health = await fetch(`${POSTIZ_API_URL}/public/v1/is-connected`, {
      headers: {
        Authorization: POSTIZ_API_KEY,
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!health.ok) {
      const error = await readTextSafely(health);
      throw new Error(`Postiz unhealthy: ${health.status}${error ? ` ${error}` : ''}`);
    }

    const body = (await health.json()) as { connected?: boolean };
    if (!body.connected) {
      throw new Error('Postiz API key is not connected to an organization');
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Postiz unreachable');
  }
}

async function getPostizIntegration(
  platform: 'linkedin' | 'x',
): Promise<PostizIntegration> {
  const response = await fetch(`${POSTIZ_API_URL}/public/v1/integrations`, {
    headers: {
      Authorization: POSTIZ_API_KEY!,
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const error = await readTextSafely(response);
    throw new Error(
      `Postiz integrations lookup failed: ${response.status}${error ? ` ${error}` : ''}`,
    );
  }

  const integrations = (await response.json()) as PostizIntegration[];
  const identifiers =
    platform === 'linkedin'
      ? new Set(['linkedin'])
      : new Set(['x', 'twitter']);

  const integration = integrations.find((item) =>
    identifiers.has((item.identifier || '').toLowerCase()),
  );

  if (!integration) {
    throw new Error(
      `Postiz has no connected ${platform === 'linkedin' ? 'LinkedIn' : 'X'} integration for this API key`,
    );
  }

  return integration;
}

async function uploadMediaToPostiz(imageUrl: string): Promise<PostizMedia> {
  if (!/^https?:\/\//i.test(imageUrl)) {
    throw new Error('Postiz media upload requires an http(s) image URL');
  }

  const response = await fetch(`${POSTIZ_API_URL}/public/v1/upload-from-url`, {
    method: 'POST',
    headers: getPostizHeaders(),
    body: JSON.stringify({ url: imageUrl }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const error = await readTextSafely(response);
    throw new Error(`Postiz media upload failed: ${response.status}${error ? ` ${error}` : ''}`);
  }

  return (await response.json()) as PostizMedia;
}

export async function publishViaPostiz(
  post: { caption: string; imageUrl: string | null; hashtags: unknown },
  platform: 'linkedin' | 'x',
  _accessToken: string,
  _orgUrn?: string | null,
): Promise<PostizPublishResult> {
  await assertPostizHealthy();

  const integration = await getPostizIntegration(platform);
  const media = post.imageUrl ? [await uploadMediaToPostiz(post.imageUrl)] : [];
  const payload = {
    type: 'now',
    shortLink: false,
    date: new Date().toISOString(),
    tags: [],
    posts: [
      {
        integration: {
          id: integration.id,
        },
        value: [
          {
            content: post.caption,
            image: media,
          },
        ],
        settings: {
          __type: platform,
        },
      },
    ],
  };

  const response = await fetch(`${POSTIZ_API_URL}/public/v1/posts`, {
    method: 'POST',
    headers: getPostizHeaders(),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const error = await readTextSafely(response);
    throw new Error(`Postiz API error ${response.status}: ${error}`);
  }

  const result = (await response.json()) as Array<{ postId?: string; integration?: string }>;
  const externalId = result[0]?.postId;

  if (!externalId) {
    throw new Error('Postiz API did not return a post id');
  }

  return {
    externalId,
  };
}
