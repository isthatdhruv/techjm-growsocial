import type { GroundingItem } from '../../types';
import { getDevtoTags } from '../niche-mappings.js';

interface DevToArticle {
  title: string;
  url: string;
  description?: string;
  positive_reactions_count: number;
  published_at: string;
}

export async function fetchDevTo(niche: string): Promise<GroundingItem[]> {
  try {
    const tags = getDevtoTags(niche);

    const requests: Promise<DevToArticle[]>[] = [];

    // Fetch top articles
    requests.push(
      (async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);
        const res = await fetch(
          'https://dev.to/api/articles?top=1&per_page=20',
          { signal: controller.signal },
        );
        clearTimeout(timeout);
        return (await res.json()) as DevToArticle[];
      })(),
    );

    // Fetch tag-specific articles
    for (const tag of tags) {
      requests.push(
        (async () => {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10_000);
          const res = await fetch(
            `https://dev.to/api/articles?tag=${tag}&top=1&per_page=10`,
            { signal: controller.signal },
          );
          clearTimeout(timeout);
          return (await res.json()) as DevToArticle[];
        })(),
      );
    }

    const results = await Promise.allSettled(requests);

    const seenUrls = new Set<string>();
    const items: GroundingItem[] = [];

    for (const result of results) {
      if (result.status !== 'fulfilled') continue;

      for (const article of result.value) {
        if (!article.url || seenUrls.has(article.url)) continue;
        seenUrls.add(article.url);

        items.push({
          source: 'devto',
          title: article.title,
          url: article.url,
          description: article.description || '',
          score: article.positive_reactions_count,
          timestamp: article.published_at,
        });
      }
    }

    return items;
  } catch {
    return [];
  }
}
