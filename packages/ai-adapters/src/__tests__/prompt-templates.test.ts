import { describe, it, expect } from 'vitest';
import { buildDiscoveryPrompt, buildGrokDiscoveryPrompt, formatGroundingData } from '../prompts/discovery';
import type { NicheContext, GroundingItem } from '../types';

const baseContext: NicheContext = {
  niche: 'SaaS / Software',
  pillars: ['Product Innovation', 'Engineering Culture', 'Growth'],
  audience: 'CTOs and engineering managers at B2B SaaS companies',
  tone: 'Professional',
  competitors: [
    { handle: 'competitor1', platform: 'linkedin' },
    { handle: 'competitor2', platform: 'x' },
  ],
  anti_topics: ['politics', 'religion'],
  recent_topics: ['Recent Post About APIs', 'Another Post About DevOps'],
};

describe('buildDiscoveryPrompt', () => {
  it('includes web search instructions for web-capable providers', () => {
    const prompt = buildDiscoveryPrompt(baseContext, true);
    expect(prompt).toContain('Use your web search capability');
    expect(prompt).toContain('SaaS / Software');
  });

  it('includes fallback instructions for non-web providers', () => {
    const prompt = buildDiscoveryPrompt(baseContext, false);
    expect(prompt).toContain('Analyze the real-time trending data');
    expect(prompt).not.toContain('Use your web search capability');
  });

  it('includes anti-topics', () => {
    const prompt = buildDiscoveryPrompt(baseContext, true);
    expect(prompt).toContain('politics');
    expect(prompt).toContain('religion');
  });

  it('lists recent topics', () => {
    const prompt = buildDiscoveryPrompt(baseContext, true);
    expect(prompt).toContain('Recent Post About APIs');
    expect(prompt).toContain('Another Post About DevOps');
  });

  it('includes competitor handles', () => {
    const prompt = buildDiscoveryPrompt(baseContext, true);
    expect(prompt).toContain('@competitor1');
    expect(prompt).toContain('@competitor2');
  });

  it('includes content pillars', () => {
    const prompt = buildDiscoveryPrompt(baseContext, true);
    expect(prompt).toContain('Product Innovation');
    expect(prompt).toContain('Engineering Culture');
    expect(prompt).toContain('Growth');
  });

  it('includes grounding data when provided', () => {
    const grounding: GroundingItem[] = [
      {
        source: 'hackernews',
        title: 'Test HN Story',
        url: 'https://example.com',
        description: 'A test story',
        score: 100,
        timestamp: '2026-03-26T00:00:00Z',
      },
    ];
    const contextWithGrounding = { ...baseContext, grounding_data: grounding };
    const prompt = buildDiscoveryPrompt(contextWithGrounding, false);
    expect(prompt).toContain('HACKERNEWS');
    expect(prompt).toContain('Test HN Story');
    expect(prompt).toContain('https://example.com');
  });

  it('requests JSON output format', () => {
    const prompt = buildDiscoveryPrompt(baseContext, true);
    expect(prompt).toContain('JSON array');
    expect(prompt).toContain('source_urls');
    expect(prompt).toContain('controversy_level');
  });
});

describe('buildGrokDiscoveryPrompt', () => {
  it('includes X/Twitter search instructions', () => {
    const prompt = buildGrokDiscoveryPrompt(baseContext);
    expect(prompt).toContain('X/Twitter');
    expect(prompt).toContain('x_post_urls');
    expect(prompt).toContain('x_engagement');
  });

  it('includes competitor X handles', () => {
    const prompt = buildGrokDiscoveryPrompt(baseContext);
    expect(prompt).toContain('@competitor2');
  });
});

describe('formatGroundingData', () => {
  it('returns numbered formatted items', () => {
    const items: GroundingItem[] = [
      {
        source: 'reddit',
        title: 'First Item',
        url: 'https://reddit.com/1',
        description: 'Desc 1',
        score: 50,
        timestamp: '2026-03-26T00:00:00Z',
      },
      {
        source: 'hackernews',
        title: 'Second Item',
        url: 'https://hn.com/2',
        description: 'Desc 2',
        score: 100,
        timestamp: '2026-03-26T01:00:00Z',
      },
    ];

    const formatted = formatGroundingData(items);
    expect(formatted).toContain('1. [REDDIT]');
    expect(formatted).toContain('2. [HACKERNEWS]');
    expect(formatted).toContain('URL: https://reddit.com/1');
    expect(formatted).toContain('Score: 100');
  });
});
