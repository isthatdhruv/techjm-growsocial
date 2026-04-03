import { describe, expect, it } from 'vitest';
import {
  chunkText,
  cosineSimilarity,
  createDeterministicEmbedding,
} from '../knowledge';

describe('knowledge utilities', () => {
  it('creates deterministic embeddings for the same text', () => {
    const first = createDeterministicEmbedding('career growth for engineers');
    const second = createDeterministicEmbedding('career growth for engineers');

    expect(first).toEqual(second);
    expect(first).toHaveLength(64);
  });

  it('scores similar text higher than unrelated text', () => {
    const query = createDeterministicEmbedding('AI in education');
    const related = createDeterministicEmbedding('How AI changes education and classrooms');
    const unrelated = createDeterministicEmbedding('Fitness routines for marathon runners');

    expect(cosineSimilarity(query, related)).toBeGreaterThan(
      cosineSimilarity(query, unrelated),
    );
  });

  it('chunks long text into overlapping searchable chunks', () => {
    const text = Array.from({ length: 180 }, (_, index) => `sentence-${index}`).join(' ');
    const chunks = chunkText(text, 120, 20);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[1].chunkIndex).toBe(1);
    expect(chunks.every((chunk) => chunk.embedding.length === 64)).toBe(true);
  });
});
