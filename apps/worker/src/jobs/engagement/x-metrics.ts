interface XMetrics {
  impressions: number
  likes: number
  comments: number
  shares: number
}

export async function fetchXMetrics(
  tweetId: string,
  accessToken: string
): Promise<XMetrics> {
  const url = `https://api.x.com/2/tweets/${tweetId}?tweet.fields=public_metrics,non_public_metrics,organic_metrics`

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
    signal: AbortSignal.timeout(15000),
  })

  if (!response.ok) {
    const err = await response.text()
    throw Object.assign(
      new Error(`X metrics failed: ${response.status} ${err}`),
      { status: response.status }
    )
  }

  const data = await response.json()
  const publicMetrics = data.data?.public_metrics || {}
  const nonPublicMetrics = data.data?.non_public_metrics || {}
  const organicMetrics = data.data?.organic_metrics || {}

  return {
    impressions: organicMetrics.impression_count || nonPublicMetrics.impression_count || publicMetrics.impression_count || 0,
    likes: organicMetrics.like_count || publicMetrics.like_count || 0,
    comments: organicMetrics.reply_count || publicMetrics.reply_count || 0,
    shares: (organicMetrics.retweet_count || publicMetrics.retweet_count || 0) +
            (publicMetrics.quote_count || 0),
  }
}
