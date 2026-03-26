import type { GroundingItem } from '../../types';
import { getSubreddits } from '../niche-mappings';

interface RedditPost {
  title: string;
  permalink: string;
  selftext?: string;
  score: number;
  created_utc: number;
}

interface RedditResponse {
  data: {
    children: { data: RedditPost }[];
  };
}

export async function fetchReddit(niche: string): Promise<GroundingItem[]> {
  try {
    const subreddits = getSubreddits(niche);

    const results = await Promise.allSettled(
      subreddits.map(async (subreddit) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);

        const res = await fetch(
          `https://www.reddit.com/r/${subreddit}/hot.json?limit=20`,
          {
            signal: controller.signal,
            headers: {
              'User-Agent': 'TechJM/1.0',
            },
          },
        );
        clearTimeout(timeout);

        if (res.status === 429) {
          return [];
        }

        const json: RedditResponse = await res.json();
        return json.data.children.map((child) => child.data);
      }),
    );

    const items: GroundingItem[] = [];

    for (const result of results) {
      if (result.status !== 'fulfilled') continue;

      for (const post of result.value) {
        if (post.score <= 20) continue;

        items.push({
          source: 'reddit',
          title: post.title,
          url: 'https://reddit.com' + post.permalink,
          description: post.selftext?.slice(0, 200) || '',
          score: post.score,
          timestamp: new Date(post.created_utc * 1000).toISOString(),
        });
      }
    }

    return items;
  } catch {
    return [];
  }
}
