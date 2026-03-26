export const NICHE_TO_SUBREDDITS: Record<string, string[]> = {
  'SaaS / Software': ['SaaS', 'startups', 'webdev', 'programming'],
  'AI / Machine Learning': ['MachineLearning', 'artificial', 'LocalLLaMA', 'deeplearning'],
  'Marketing / Growth': ['marketing', 'SEO', 'socialmedia', 'content_marketing'],
  'Fintech / Finance': ['fintech', 'finance', 'CryptoCurrency', 'algotrading'],
  'E-commerce / DTC': ['ecommerce', 'shopify', 'Entrepreneur', 'smallbusiness'],
  'Health / Wellness': ['HealthIT', 'medicine', 'digital_health'],
  'Creator / Personal Brand': ['NewTubers', 'socialmedia', 'content_marketing', 'Influencer'],
  'DevOps / Cloud': ['devops', 'aws', 'kubernetes', 'sysadmin'],
  'Legal / Compliance': ['law', 'legaltech', 'compliance'],
  '_default': ['technology', 'startups', 'programming'],
};

export const NICHE_TO_RSS_FEEDS: Record<string, string[]> = {
  'SaaS / Software': [
    'https://techcrunch.com/category/startups/feed/',
    'https://hnrss.org/frontpage',
    'https://www.saastr.com/feed/',
  ],
  'AI / Machine Learning': [
    'https://www.technologyreview.com/feed/',
    'https://blog.google/technology/ai/rss/',
    'https://openai.com/blog/rss.xml',
  ],
  'Marketing / Growth': [
    'https://moz.com/feed',
    'https://contentmarketinginstitute.com/feed/',
    'https://blog.hubspot.com/marketing/rss.xml',
  ],
  'Fintech / Finance': [
    'https://techcrunch.com/category/fintech/feed/',
    'https://www.finextra.com/rss/headlines.aspx',
  ],
  'E-commerce / DTC': [
    'https://www.shopify.com/blog/feed',
    'https://techcrunch.com/category/commerce/feed/',
  ],
  'Health / Wellness': [
    'https://www.healthcareitnews.com/feed',
    'https://www.statnews.com/feed/',
  ],
  'Creator / Personal Brand': [
    'https://buffer.com/resources/feed/',
    'https://blog.hootsuite.com/feed/',
  ],
  'DevOps / Cloud': [
    'https://aws.amazon.com/blogs/aws/feed/',
    'https://cloud.google.com/blog/rss',
    'https://kubernetes.io/feed.xml',
  ],
  'Legal / Compliance': [
    'https://www.lawfaremedia.org/feed',
    'https://www.jdsupra.com/resources/syndication/rss.aspx',
  ],
  '_default': [
    'https://hnrss.org/frontpage',
    'https://techcrunch.com/feed/',
  ],
};

export const NICHE_TO_DEVTO_TAGS: Record<string, string[]> = {
  'SaaS / Software': ['saas', 'startup', 'webdev'],
  'AI / Machine Learning': ['ai', 'machinelearning', 'llm'],
  'Marketing / Growth': ['marketing', 'seo', 'growth'],
  'Fintech / Finance': ['fintech', 'blockchain', 'finance'],
  'E-commerce / DTC': ['ecommerce', 'shopify', 'business'],
  'Health / Wellness': ['healthtech', 'health', 'wellness'],
  'Creator / Personal Brand': ['creators', 'contentcreation', 'productivity'],
  'DevOps / Cloud': ['devops', 'cloud', 'kubernetes'],
  'Legal / Compliance': ['legal', 'compliance', 'security'],
  '_default': ['programming', 'webdev'],
};

export function getSubreddits(niche: string): string[] {
  return NICHE_TO_SUBREDDITS[niche] ?? NICHE_TO_SUBREDDITS['_default'];
}

export function getRssFeeds(niche: string): string[] {
  return NICHE_TO_RSS_FEEDS[niche] ?? NICHE_TO_RSS_FEEDS['_default'];
}

export function getDevtoTags(niche: string): string[] {
  return NICHE_TO_DEVTO_TAGS[niche] ?? NICHE_TO_DEVTO_TAGS['_default'];
}
