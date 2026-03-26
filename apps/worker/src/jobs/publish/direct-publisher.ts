interface DirectPublishResult {
  externalId: string;
  url?: string;
}

export async function publishDirect(
  post: { caption: string; imageUrl: string | null; hashtags: unknown },
  platform: 'linkedin' | 'x',
  accessToken: string,
  orgUrn?: string | null,
): Promise<DirectPublishResult> {
  if (platform === 'linkedin') {
    return publishToLinkedIn(post, accessToken, orgUrn);
  } else if (platform === 'x') {
    return publishToX(post, accessToken);
  }
  throw new Error(`Unsupported platform: ${platform}`);
}

// ═══ LinkedIn Direct Publishing ═══

async function publishToLinkedIn(
  post: { caption: string; imageUrl: string | null },
  accessToken: string,
  orgUrn?: string | null,
): Promise<DirectPublishResult> {
  const authorUrn = orgUrn || (await getLinkedInPersonUrn(accessToken));

  let imageAsset: string | null = null;

  // Step 1: Upload image if present
  if (post.imageUrl) {
    // 1a. Initialize upload
    const initResponse = await fetch(
      'https://api.linkedin.com/rest/images?action=initializeUpload',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'LinkedIn-Version': '202401',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify({
          initializeUploadRequest: { owner: authorUrn },
        }),
      },
    );

    if (!initResponse.ok) {
      const err = await initResponse.text();
      throw new Error(`LinkedIn image init failed: ${initResponse.status} ${err}`);
    }

    const initData = await initResponse.json();
    const uploadUrl = initData.value.uploadUrl;
    imageAsset = initData.value.image;

    // 1b. Download image from our CDN
    const imageResponse = await fetch(post.imageUrl);
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

    // 1c. Upload binary to LinkedIn
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/octet-stream',
      },
      body: imageBuffer,
    });

    if (!uploadResponse.ok) {
      console.warn('LinkedIn image upload failed — posting text-only');
      imageAsset = null;
    }
  }

  // Step 2: Create post
  const postBody: Record<string, unknown> = {
    author: authorUrn,
    commentary: post.caption,
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

  const postResponse = await fetch('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'LinkedIn-Version': '202401',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(postBody),
  });

  if (!postResponse.ok) {
    const err = await postResponse.text();
    throw new Error(`LinkedIn post failed: ${postResponse.status} ${err}`);
  }

  const postId = postResponse.headers.get('x-restli-id') || 'unknown';

  return {
    externalId: postId,
    url: `https://www.linkedin.com/feed/update/${postId}`,
  };
}

async function getLinkedInPersonUrn(accessToken: string): Promise<string> {
  const response = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error('Failed to get LinkedIn user info');
  const data = await response.json();
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
