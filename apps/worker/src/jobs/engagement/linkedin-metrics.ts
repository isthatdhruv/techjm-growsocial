interface LinkedInMetrics {
  impressions: number
  likes: number
  comments: number
  shares: number
}

export async function fetchLinkedInMetrics(
  postUrn: string,
  accessToken: string,
  orgUrn?: string | null
): Promise<LinkedInMetrics> {
  const metadataUrl = `https://api.linkedin.com/rest/socialMetadata/${encodeURIComponent(postUrn)}`
  const metadataResponse = await fetch(metadataUrl, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'LinkedIn-Version': '202401',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    signal: AbortSignal.timeout(15000),
  })

  let likes = 0, comments = 0, shares = 0

  if (metadataResponse.ok) {
    const metadata = await metadataResponse.json()
    likes = metadata.likesSummary?.totalLikes || metadata.totalLikes || 0
    comments = metadata.commentsSummary?.totalFirstLevelComments || metadata.totalComments || 0
    shares = metadata.totalShares || 0
  } else {
    const actionsUrl = `https://api.linkedin.com/v2/socialActions/${encodeURIComponent(postUrn)}`
    const actionsResponse = await fetch(actionsUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-Restli-Protocol-Version': '2.0.0',
      },
      signal: AbortSignal.timeout(15000),
    })

    if (actionsResponse.ok) {
      const actions = await actionsResponse.json()
      likes = actions.likesSummary?.totalLikes || 0
      comments = actions.commentsSummary?.totalFirstLevelComments || 0
      shares = actions.totalShares || 0
    } else {
      const err = await actionsResponse.text()
      throw Object.assign(
        new Error(`LinkedIn metrics failed: ${actionsResponse.status} ${err}`),
        { status: actionsResponse.status }
      )
    }
  }

  let impressions = 0

  if (orgUrn) {
    try {
      const statsUrl = `https://api.linkedin.com/rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${encodeURIComponent(orgUrn)}&shares[0]=${encodeURIComponent(postUrn)}`
      const statsResponse = await fetch(statsUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'LinkedIn-Version': '202401',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        signal: AbortSignal.timeout(15000),
      })

      if (statsResponse.ok) {
        const stats = await statsResponse.json()
        const shareStats = stats.elements?.[0]?.totalShareStatistics
        if (shareStats) {
          impressions = shareStats.impressionCount || 0
          if (shareStats.likeCount) likes = Math.max(likes, shareStats.likeCount)
          if (shareStats.commentCount) comments = Math.max(comments, shareStats.commentCount)
          if (shareStats.shareCount) shares = Math.max(shares, shareStats.shareCount)
        }
      }
    } catch {
      // Impression data is optional — don't fail the whole check
    }
  } else {
    // Personal posts: estimate impressions from likes (rough LinkedIn benchmark)
    impressions = likes * 30
  }

  return { impressions, likes, comments, shares }
}
