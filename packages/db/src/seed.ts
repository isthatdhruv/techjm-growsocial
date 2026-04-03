import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { recommendationMatrix } from './schema/recommendations.js';

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);
const db = drizzle(client);

type NewRecommendation = typeof recommendationMatrix.$inferInsert;

const niches: NewRecommendation[] = [
  {
    niche: 'SaaS / Software',
    slotAProvider: 'openai',
    slotAModel: 'gpt-5.4-mini',
    slotBProvider: 'anthropic',
    slotBModel: 'claude-sonnet-4-6',
    slotCProvider: 'google',
    slotCModel: 'gemini-3.1-pro',
    slotDProvider: 'xai',
    slotDModel: 'grok-4.1-fast',
    subAgentProvider: 'anthropic',
    subAgentModel: 'claude-haiku-4-5',
    captionProvider: 'anthropic',
    captionModel: 'claude-sonnet-4-6',
    imageProvider: 'replicate',
    imageModel: 'flux-2-pro',
    reasoning:
      'GPT broad tech web. Sonnet deep reasoning. Gemini Google-indexed launches. Grok X dev threads.',
    estCostLow: '10.00',
    estCostHigh: '18.00',
  },
  {
    niche: 'AI / Machine Learning',
    slotAProvider: 'anthropic',
    slotAModel: 'claude-sonnet-4-6',
    slotBProvider: 'openai',
    slotBModel: 'gpt-5.4-mini',
    slotCProvider: 'xai',
    slotCModel: 'grok-4.1-fast',
    slotDProvider: 'google',
    slotDModel: 'gemini-3.1-pro',
    subAgentProvider: 'anthropic',
    subAgentModel: 'claude-haiku-4-5',
    captionProvider: 'anthropic',
    captionModel: 'claude-sonnet-4-6',
    imageProvider: 'replicate',
    imageModel: 'flux-2-pro',
    reasoning:
      'Sonnet leads AI reasoning. GPT ArXiv coverage. Grok AI Twitter. Gemini Scholar.',
    estCostLow: '12.00',
    estCostHigh: '20.00',
  },
  {
    niche: 'Marketing / Growth',
    slotAProvider: 'openai',
    slotAModel: 'gpt-5.4',
    slotBProvider: 'google',
    slotBModel: 'gemini-3.1-pro',
    slotCProvider: 'xai',
    slotCModel: 'grok-4.1-fast',
    slotDProvider: 'anthropic',
    slotDModel: 'claude-sonnet-4-6',
    subAgentProvider: 'openai',
    subAgentModel: 'gpt-5.4-nano',
    captionProvider: 'openai',
    captionModel: 'gpt-5.4-mini',
    imageProvider: 'openai',
    imageModel: 'gpt-image-1.5',
    reasoning:
      'GPT broad marketing. Gemini Google Trends. Grok viral tweets. Sonnet angles.',
    estCostLow: '12.00',
    estCostHigh: '22.00',
  },
  {
    niche: 'Fintech / Finance',
    slotAProvider: 'openai',
    slotAModel: 'gpt-5.4',
    slotBProvider: 'anthropic',
    slotBModel: 'claude-sonnet-4-6',
    slotCProvider: 'google',
    slotCModel: 'gemini-3.1-pro',
    slotDProvider: 'xai',
    slotDModel: 'grok-4.1-fast',
    subAgentProvider: 'anthropic',
    subAgentModel: 'claude-haiku-4-5',
    captionProvider: 'anthropic',
    captionModel: 'claude-sonnet-4-6',
    imageProvider: 'replicate',
    imageModel: 'flux-2-pro',
    reasoning:
      'GPT earnings/regulatory. Sonnet financial reasoning. Gemini SEC filings. Grok fintech Twitter.',
    estCostLow: '14.00',
    estCostHigh: '24.00',
  },
  {
    niche: 'E-commerce / DTC',
    slotAProvider: 'openai',
    slotAModel: 'gpt-5.4-mini',
    slotBProvider: 'xai',
    slotBModel: 'grok-4.1-fast',
    slotCProvider: 'google',
    slotCModel: 'gemini-3.1-pro',
    slotDProvider: 'anthropic',
    slotDModel: 'claude-sonnet-4-6',
    subAgentProvider: 'openai',
    subAgentModel: 'gpt-5.4-nano',
    captionProvider: 'openai',
    captionModel: 'gpt-5.4-mini',
    imageProvider: 'openai',
    imageModel: 'gpt-image-1.5',
    reasoning:
      'GPT product news. Grok viral product tweets. Gemini shopping trends. Sonnet angles.',
    estCostLow: '10.00',
    estCostHigh: '18.00',
  },
  {
    niche: 'Health / Wellness',
    slotAProvider: 'anthropic',
    slotAModel: 'claude-sonnet-4-6',
    slotBProvider: 'google',
    slotBModel: 'gemini-3.1-pro',
    slotCProvider: 'openai',
    slotCModel: 'gpt-5.4',
    slotDProvider: 'xai',
    slotDModel: 'grok-4.1-fast',
    subAgentProvider: 'anthropic',
    subAgentModel: 'claude-haiku-4-5',
    captionProvider: 'anthropic',
    captionModel: 'claude-sonnet-4-6',
    imageProvider: 'replicate',
    imageModel: 'flux-2-pro',
    reasoning:
      'Sonnet leads for safety. Gemini PubMed. GPT broad medical. Grok health discourse.',
    estCostLow: '14.00',
    estCostHigh: '22.00',
  },
  {
    niche: 'Creator / Personal Brand',
    slotAProvider: 'xai',
    slotAModel: 'grok-4.1-fast',
    slotBProvider: 'openai',
    slotBModel: 'gpt-5.4-mini',
    slotCProvider: 'google',
    slotCModel: 'gemini-3.1-flash',
    slotDProvider: 'anthropic',
    slotDModel: 'claude-sonnet-4-6',
    subAgentProvider: 'openai',
    subAgentModel: 'gpt-5.4-nano',
    captionProvider: 'openai',
    captionModel: 'gpt-5.4-mini',
    imageProvider: 'openai',
    imageModel: 'gpt-image-1.5',
    reasoning: 'Grok LEADS for virality. GPT/Gemini depth. Sonnet polish.',
    estCostLow: '8.00',
    estCostHigh: '15.00',
  },
  {
    niche: 'DevOps / Cloud',
    slotAProvider: 'openai',
    slotAModel: 'gpt-5.4-mini',
    slotBProvider: 'anthropic',
    slotBModel: 'claude-sonnet-4-6',
    slotCProvider: 'google',
    slotCModel: 'gemini-3.1-pro',
    slotDProvider: 'xai',
    slotDModel: 'grok-4.1-fast',
    subAgentProvider: 'anthropic',
    subAgentModel: 'claude-haiku-4-5',
    captionProvider: 'anthropic',
    captionModel: 'claude-sonnet-4-6',
    imageProvider: 'replicate',
    imageModel: 'flux-2-schnell',
    reasoning:
      'GPT cloud announcements. Sonnet infra implications. Gemini docs. Grok DevOps Twitter.',
    estCostLow: '10.00',
    estCostHigh: '16.00',
  },
  {
    niche: 'Legal / Compliance',
    slotAProvider: 'anthropic',
    slotAModel: 'claude-sonnet-4-6',
    slotBProvider: 'openai',
    slotBModel: 'gpt-5.4',
    slotCProvider: 'google',
    slotCModel: 'gemini-3.1-pro',
    slotDProvider: 'xai',
    slotDModel: 'grok-4.1-fast',
    subAgentProvider: 'anthropic',
    subAgentModel: 'claude-haiku-4-5',
    captionProvider: 'anthropic',
    captionModel: 'claude-sonnet-4-6',
    imageProvider: 'replicate',
    imageModel: 'flux-2-pro',
    reasoning:
      'Sonnet leads legal reasoning. GPT regulatory updates. Gemini legal DBs. Grok legal Twitter.',
    estCostLow: '14.00',
    estCostHigh: '22.00',
  },
  {
    niche: 'Budget (Any Niche)',
    slotAProvider: 'openai',
    slotAModel: 'gpt-5.4-nano',
    slotBProvider: 'google',
    slotBModel: 'gemini-2.5-flash',
    slotCProvider: 'deepseek',
    slotCModel: 'deepseek-v3.2',
    slotDProvider: 'deepseek',
    slotDModel: 'deepseek-v3.2',
    subAgentProvider: 'openai',
    subAgentModel: 'gpt-5.4-nano',
    captionProvider: 'openai',
    captionModel: 'gpt-5.4-nano',
    imageProvider: 'openai',
    imageModel: 'gpt-image-1-mini',
    reasoning:
      'All cheapest. Nano + Flash web search. DeepSeek fallback chain.',
    estCostLow: '3.00',
    estCostHigh: '7.00',
  },
];

async function seed() {
  // Clear existing rows
  await db.delete(recommendationMatrix);

  // Insert all niche combos
  await db.insert(recommendationMatrix).values(niches);

  console.log(`Seeded ${niches.length} niche combos`);
  await client.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
