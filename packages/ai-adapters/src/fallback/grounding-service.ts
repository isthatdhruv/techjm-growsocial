import { fetchHackerNews } from './scrapers/hackernews.js';
import { fetchReddit } from './scrapers/reddit.js';
import { fetchRss } from './scrapers/rss.js';
import { fetchProductHunt } from './scrapers/producthunt.js';
import { fetchDevTo } from './scrapers/devto.js';
import { formatGroundingData } from '../prompts/discovery.js';
import type { GroundingItem } from '../types.js';

export class FallbackGroundingService {
  async collect(nicheHint: string): Promise<GroundingItem[]> {
    const [hn, reddit, rss, ph, devto] = await Promise.allSettled([
      fetchHackerNews(),
      fetchReddit(nicheHint),
      fetchRss(nicheHint),
      fetchProductHunt(),
      fetchDevTo(nicheHint),
    ]);

    const allItems: GroundingItem[] = [];
    for (const result of [hn, reddit, rss, ph, devto]) {
      if (result.status === 'fulfilled') {
        allItems.push(...result.value);
      }
    }

    // Deduplicate by URL
    const seen = new Set<string>();
    const unique = allItems.filter((item) => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });

    // Sort by score descending
    unique.sort((a, b) => b.score - a.score);

    // Cap at 50 items
    return unique.slice(0, 50);
  }

  formatForPrompt(items: GroundingItem[]): string {
    return formatGroundingData(items);
  }
}
