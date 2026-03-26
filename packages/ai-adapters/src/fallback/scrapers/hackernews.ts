import type { GroundingItem } from '../../types';

interface HNStory {
  id: number;
  title: string;
  url?: string;
  score: number;
  time: number;
}

export async function fetchHackerNews(): Promise<GroundingItem[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(
      'https://hacker-news.firebaseio.com/v0/topstories.json',
      { signal: controller.signal },
    );
    clearTimeout(timeout);

    const ids: number[] = await res.json();
    const top30 = ids.slice(0, 30);

    const storyResults = await Promise.allSettled(
      top30.map(async (id) => {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 10_000);
        const r = await fetch(
          `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
          { signal: ctrl.signal },
        );
        clearTimeout(t);
        return (await r.json()) as HNStory;
      }),
    );

    const items: GroundingItem[] = [];

    for (const result of storyResults) {
      if (result.status !== 'fulfilled') continue;
      const story = result.value;
      if (!story || story.score <= 10 || !story.url) continue;

      items.push({
        source: 'hackernews',
        title: story.title,
        url: story.url,
        description: '',
        score: story.score,
        timestamp: new Date(story.time * 1000).toISOString(),
      });
    }

    return items;
  } catch {
    return [];
  }
}
