import type { GroundingItem } from '../../types';

interface PHNode {
  name: string;
  tagline: string;
  url: string;
  votesCount: number;
  createdAt: string;
}

interface PHResponse {
  data: {
    posts: {
      edges: { node: PHNode }[];
    };
  };
}

export async function fetchProductHunt(): Promise<GroundingItem[]> {
  try {
    const token = process.env.PRODUCTHUNT_TOKEN;
    if (!token) return [];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const query = `{
      posts(order: VOTES, first: 15) {
        edges {
          node {
            name
            tagline
            url
            votesCount
            createdAt
          }
        }
      }
    }`;

    const res = await fetch('https://api.producthunt.com/v2/api/graphql', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });
    clearTimeout(timeout);

    const json: PHResponse = await res.json();

    return json.data.posts.edges.map(({ node }) => ({
      source: 'producthunt',
      title: `${node.name} — ${node.tagline}`,
      url: node.url,
      description: node.tagline,
      score: node.votesCount,
      timestamp: node.createdAt,
    }));
  } catch {
    return [];
  }
}
