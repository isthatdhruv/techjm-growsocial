import Parser from 'rss-parser';
import type { GroundingItem } from '../../types';
import { getRssFeeds } from '../niche-mappings.js';

export async function fetchRss(niche: string): Promise<GroundingItem[]> {
  try {
    const feeds = getRssFeeds(niche);
    const parser = new Parser({ timeout: 10_000 });

    const results = await Promise.allSettled(
      feeds.map((url) => parser.parseURL(url)),
    );

    const items: GroundingItem[] = [];

    for (const result of results) {
      if (result.status !== 'fulfilled') continue;

      const feedItems = result.value.items.slice(0, 20);

      for (const item of feedItems) {
        if (!item.title || !item.link) continue;

        items.push({
          source: 'rss',
          title: item.title,
          url: item.link,
          description: item.contentSnippet?.slice(0, 200) || '',
          score: 0,
          timestamp: item.isoDate || new Date().toISOString(),
        });
      }
    }

    return items;
  } catch {
    return [];
  }
}
