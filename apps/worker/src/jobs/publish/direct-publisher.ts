import https from 'node:https';
import type { IncomingHttpHeaders } from 'node:http';

interface DirectPublishResult {
  externalId: string;
  url?: string;
}

const LINKEDIN_API_VERSION = process.env.LINKEDIN_API_VERSION || '202506';

async function sendHttpsRequest(
  input: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string | Uint8Array;
    timeoutMs?: number;
  } = {},
): Promise<{
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
}> {
  return await new Promise((resolve, reject) => {
    const url = new URL(input);
    const req = https.request(
      url,
      {
        method: options.method || 'GET',
        headers: options.headers,
        family: 4,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 500,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
      },
    );

    req.setTimeout(options.timeoutMs ?? 30_000, () => {
      req.destroy(new Error('Request timed out'));
    });
    req.on('error', reject);

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

async function getImageBuffer(imageSource: string): Promise<Buffer> {
  if (imageSource.startsWith('data:')) {
    const [, base64Payload = ''] = imageSource.split(',', 2);
    if (!base64Payload) {
      throw new Error('Image data URI is missing payload');
    }
    return Buffer.from(base64Payload, 'base64');
  }

  if (/^https?:\/\//i.test(imageSource)) {
    const imageResponse = await fetch(imageSource);
    if (!imageResponse.ok) {
      throw new Error(`Image download failed: ${imageResponse.status}`);
    }
    return Buffer.from(await imageResponse.arrayBuffer());
  }

  // Some posts currently persist the raw base64 payload instead of a URL.
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(imageSource)) {
    return Buffer.from(imageSource, 'base64');
  }

  throw new Error('Unsupported image source format');
}

export async function publishDirect(
  post: { caption: string; imageUrl: string | null; hashtags: unknown },
  platform: 'linkedin' | 'x',
  accessToken: string,
  orgUrn?: string | null,
  accountId?: string | null,
): Promise<DirectPublishResult> {
  if (platform === 'linkedin') {
    return publishToLinkedIn(post, accessToken, orgUrn, accountId);
  } else if (platform === 'x') {
    return publishToX(post, accessToken);
  }
  throw new Error(`Unsupported platform: ${platform}`);
}

// ═══ LinkedIn Direct Publishing ═══

export async function publishToLinkedIn(
  postContent: { caption: string; imageUrl?: string | null },
  accessToken: string,
  orgUrn?: string | null,
  accountId?: string | null,
): Promise<DirectPublishResult> {
  const authorUrn = resolveLinkedInAuthorUrn(orgUrn, accountId) || (await getLinkedInPersonUrn(accessToken));

  let imageAsset: string | null = null;

  // Step 1: Upload image if present
  if (postContent.imageUrl) {
    try {
      // 1a. Initialize upload
      const initPayload = JSON.stringify({
        initializeUploadRequest: { owner: authorUrn },
      });
      const initResponse = await sendHttpsRequest(
        'https://api.linkedin.com/rest/images?action=initializeUpload',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'LinkedIn-Version': LINKEDIN_API_VERSION,
            'X-Restli-Protocol-Version': '2.0.0',
          },
          body: initPayload,
        },
      );

      if (initResponse.status < 200 || initResponse.status >= 300) {
        throw new Error(
          `LinkedIn image init failed: ${initResponse.status} ${initResponse.body.toString('utf8')}`,
        );
      }

      const initData = JSON.parse(initResponse.body.toString('utf8')) as {
        value: { uploadUrl: string; image: string };
      };
      const uploadUrl = initData.value.uploadUrl;
      imageAsset = initData.value.image;

      // 1b. Resolve the image from URL, data URI, or raw base64
      const imageBuffer = await getImageBuffer(postContent.imageUrl);

      // 1c. Upload binary to LinkedIn
      const uploadResponse = await sendHttpsRequest(uploadUrl, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/octet-stream',
        },
        body: new Uint8Array(imageBuffer),
      });

      if (uploadResponse.status < 200 || uploadResponse.status >= 300) {
        console.warn('LinkedIn image upload failed — posting text-only');
        imageAsset = null;
      }
    } catch (err) {
      console.warn(
        `LinkedIn image preparation/upload failed — posting text-only: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      imageAsset = null;
    }
  }

  // Step 2: Create post
  const postBody: Record<string, unknown> = {
    author: authorUrn,
    commentary: postContent.caption,
    visibility: 'PUBLIC',
    distribution: {
      feedDistribution: 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  };

  if (imageAsset) {
    postBody.content = {
      media: {
        title: 'Post image',
        id: imageAsset,
      },
    };
  }

  const responseBody = JSON.stringify(postBody);
  const postResponse = await sendHttpsRequest('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'LinkedIn-Version': LINKEDIN_API_VERSION,
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: responseBody,
  });

  if (postResponse.status < 200 || postResponse.status >= 300) {
    throw new Error(
      `LinkedIn post failed: ${postResponse.status} ${postResponse.body.toString('utf8')}`,
    );
  }

  const postIdHeader = postResponse.headers['x-restli-id'];
  const postId = Array.isArray(postIdHeader) ? postIdHeader[0] : postIdHeader || 'unknown';

  return {
    externalId: postId,
    url: `https://www.linkedin.com/feed/update/${postId}`,
  };
}

function resolveLinkedInAuthorUrn(
  orgUrn?: string | null,
  accountId?: string | null,
): string | null {
  if (orgUrn) {
    return orgUrn;
  }

  if (!accountId) {
    return null;
  }

  return accountId.startsWith('urn:') ? accountId : `urn:li:person:${accountId}`;
}

async function getLinkedInPersonUrn(accessToken: string): Promise<string> {
  const response = await sendHttpsRequest('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `Failed to get LinkedIn user info: ${response.status} ${response.body.toString('utf8')}`,
    );
  }

  const data = JSON.parse(response.body.toString('utf8')) as { sub?: string };

  if (!data.sub) throw new Error('Failed to get LinkedIn user info');
  return `urn:li:person:${data.sub}`;
}

// ═══ X (Twitter) Direct Publishing ═══

async function publishToX(
  post: { caption: string; imageUrl: string | null },
  accessToken: string,
): Promise<DirectPublishResult> {
  let mediaId: string | null = null;

  // Step 1: Upload media if present
  if (post.imageUrl) {
    try {
      const imageResponse = await fetch(post.imageUrl);
      const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
      const base64 = imageBuffer.toString('base64');

      const mediaResponse = await fetch('https://upload.twitter.com/1.1/media/upload.json', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          media_data: base64,
          media_category: 'tweet_image',
        }),
      });

      if (mediaResponse.ok) {
        const mediaData = await mediaResponse.json();
        mediaId = mediaData.media_id_string;
      } else {
        console.warn('X media upload failed — posting text-only');
      }
    } catch (mediaError: unknown) {
      const msg = mediaError instanceof Error ? mediaError.message : 'Unknown error';
      console.warn(`X media upload error: ${msg}`);
    }
  }

  // Step 2: Create tweet
  const tweetBody: Record<string, unknown> = {
    text: post.caption,
  };

  if (mediaId) {
    tweetBody.media = { media_ids: [mediaId] };
  }

  const tweetResponse = await fetch('https://api.x.com/2/tweets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(tweetBody),
  });

  if (!tweetResponse.ok) {
    const err = await tweetResponse.text();
    throw new Error(`X tweet failed: ${tweetResponse.status} ${err}`);
  }

  const tweetData = await tweetResponse.json();
  return {
    externalId: tweetData.data.id,
    url: `https://x.com/i/web/status/${tweetData.data.id}`,
  };
}
