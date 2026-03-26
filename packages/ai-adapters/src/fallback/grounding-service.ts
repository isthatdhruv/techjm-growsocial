import { fetchHackerNews } from './scrapers/hackernews';
import { fetchReddit } from './scrapers/reddit';
import { fetchRss } from './scrapers/rss';
import { fetchProductHunt } from './scrapers/producthunt';
import { fetchDevTo } from './scrapers/devto';
import { formatGroundingData } from '../prompts/discovery';
import type { GroundingItem } from '../types';

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
