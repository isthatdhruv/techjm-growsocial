const POSTIZ_API_URL = process.env.POSTIZ_API_URL || 'http://localhost:5000';
const POSTIZ_API_KEY = process.env.POSTIZ_API_KEY;

interface PostizPublishResult {
  externalId: string;
  url?: string;
}

export async function publishViaPostiz(
  post: { caption: string; imageUrl: string | null; hashtags: unknown },
  platform: 'linkedin' | 'x',
  accessToken: string,
  orgUrn?: string | null,
): Promise<PostizPublishResult> {
  if (!POSTIZ_API_KEY) {
    throw new Error('Postiz API key not configured');
  }

  // Health check
  try {
    const health = await fetch(`${POSTIZ_API_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!health.ok) throw new Error('Postiz unhealthy');
  } catch {
    throw new Error('Postiz unreachable');
  }

  // Build payload — adjust to match Postiz's actual API schema
  const payload: Record<string, unknown> = {
    platform,
    content: post.caption,
    ...(post.imageUrl && { media: [{ url: post.imageUrl, type: 'image' }] }),
  };

  if (platform === 'linkedin' && orgUrn) {
    payload.linkedin_target = orgUrn;
  }

  const response = await fetch(`${POSTIZ_API_URL}/api/posts/publish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${POSTIZ_API_KEY}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Postiz API error ${response.status}: ${error}`);
  }

  const result = await response.json();
  return {
    externalId: result.id || result.external_id || result.post_id,
    url: result.url,
  };
}
