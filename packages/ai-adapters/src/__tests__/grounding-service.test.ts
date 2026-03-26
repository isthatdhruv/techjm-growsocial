import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FallbackGroundingService } from '../fallback/grounding-service';
import type { GroundingItem } from '../types';

// Mock all scrapers
vi.mock('../fallback/scrapers/hackernews', () => ({
  fetchHackerNews: vi.fn(),
}));
vi.mock('../fallback/scrapers/reddit', () => ({
  fetchReddit: vi.fn(),
}));
vi.mock('../fallback/scrapers/rss', () => ({
  fetchRss: vi.fn(),
}));
vi.mock('../fallback/scrapers/producthunt', () => ({
  fetchProductHunt: vi.fn(),
}));
vi.mock('../fallback/scrapers/devto', () => ({
  fetchDevTo: vi.fn(),
}));

import { fetchHackerNews } from '../fallback/scrapers/hackernews';
import { fetchReddit } from '../fallback/scrapers/reddit';
import { fetchRss } from '../fallback/scrapers/rss';
import { fetchProductHunt } from '../fallback/scrapers/producthunt';
import { fetchDevTo } from '../fallback/scrapers/devto';

const mockHn = fetchHackerNews as ReturnType<typeof vi.fn>;
const mockReddit = fetchReddit as ReturnType<typeof vi.fn>;
const mockRss = fetchRss as ReturnType<typeof vi.fn>;
const mockPh = fetchProductHunt as ReturnType<typeof vi.fn>;
const mockDevto = fetchDevTo as ReturnType<typeof vi.fn>;

function makeItem(source: string, title: string, url: string, score: number): GroundingItem {
  return {
    source,
    title,
    url,
    description: `Description for ${title}`,
    score,
    timestamp: '2026-03-26T00:00:00Z',
  };
}

describe('FallbackGroundingService', () => {
  const service = new FallbackGroundingService();

  beforeEach(() => {
    vi.clearAllMocks();
    mockHn.mockResolvedValue([]);
    mockReddit.mockResolvedValue([]);
    mockRss.mockResolvedValue([]);
    mockPh.mockResolvedValue([]);
    mockDevto.mockResolvedValue([]);
  });

  it('collects items from all scrapers', async () => {
    mockHn.mockResolvedValue([makeItem('hackernews', 'HN Story', 'https://hn.com/1', 100)]);
    mockReddit.mockResolvedValue([makeItem('reddit', 'Reddit Post', 'https://reddit.com/1', 50)]);
    mockRss.mockResolvedValue([makeItem('rss', 'RSS Article', 'https://blog.com/1', 0)]);

    const items = await service.collect('SaaS / Software');
    expect(items.length).toBe(3);
    expect(items.map((i) => i.source)).toContain('hackernews');
    expect(items.map((i) => i.source)).toContain('reddit');
    expect(items.map((i) => i.source)).toContain('rss');
  });

  it('each item has required fields', async () => {
    mockHn.mockResolvedValue([makeItem('hackernews', 'Test', 'https://example.com', 42)]);

    const items = await service.collect('AI / Machine Learning');
    expect(items.length).toBe(1);

    const item = items[0];
    expect(item).toHaveProperty('source');
    expect(item).toHaveProperty('title');
    expect(item).toHaveProperty('url');
    expect(item).toHaveProperty('score');
    expect(item).toHaveProperty('timestamp');
  });

  it('deduplicates by URL', async () => {
    const sameUrl = 'https://shared-article.com/post';
    mockHn.mockResolvedValue([makeItem('hackernews', 'Same Article HN', sameUrl, 100)]);
    mockReddit.mockResolvedValue([makeItem('reddit', 'Same Article Reddit', sameUrl, 50)]);

    const items = await service.collect('SaaS / Software');
    expect(items.length).toBe(1);
  });

  it('sorts by score descending', async () => {
    mockHn.mockResolvedValue([
      makeItem('hackernews', 'Low', 'https://hn.com/low', 10),
      makeItem('hackernews', 'High', 'https://hn.com/high', 500),
      makeItem('hackernews', 'Mid', 'https://hn.com/mid', 100),
    ]);

    const items = await service.collect('SaaS / Software');
    expect(items[0].score).toBe(500);
    expect(items[1].score).toBe(100);
    expect(items[2].score).toBe(10);
  });

  it('caps at 50 items', async () => {
    const manyItems = Array.from({ length: 60 }, (_, i) =>
      makeItem('hackernews', `Story ${i}`, `https://hn.com/${i}`, i),
    );
    mockHn.mockResolvedValue(manyItems);

    const items = await service.collect('SaaS / Software');
    expect(items.length).toBe(50);
  });

  it('handles scraper failures gracefully', async () => {
    mockHn.mockRejectedValue(new Error('Network error'));
    mockReddit.mockResolvedValue([makeItem('reddit', 'Survived', 'https://reddit.com/1', 25)]);

    const items = await service.collect('SaaS / Software');
    expect(items.length).toBe(1);
    expect(items[0].source).toBe('reddit');
  });

  it('returns empty array when all scrapers fail', async () => {
    mockHn.mockRejectedValue(new Error('fail'));
    mockReddit.mockRejectedValue(new Error('fail'));
    mockRss.mockRejectedValue(new Error('fail'));
    mockPh.mockRejectedValue(new Error('fail'));
    mockDevto.mockRejectedValue(new Error('fail'));

    const items = await service.collect('SaaS / Software');
    expect(items).toEqual([]);
  });

  describe('formatForPrompt', () => {
    it('returns properly formatted string', () => {
      const items: GroundingItem[] = [
        makeItem('hackernews', 'Test Story', 'https://hn.com/1', 200),
        makeItem('reddit', 'Test Post', 'https://reddit.com/1', 150),
      ];

      const formatted = service.formatForPrompt(items);
      expect(formatted).toContain('Real-Time Trending Data');
      expect(formatted).toContain('1. [HACKERNEWS]');
      expect(formatted).toContain('2. [REDDIT]');
      expect(formatted).toContain('URL: https://hn.com/1');
      expect(formatted).toContain('Score: 200');
    });
  });
});
