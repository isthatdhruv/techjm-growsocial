import { tmpdir } from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { and, desc, eq } from 'drizzle-orm';
import {
  db,
  knowledgeChunks,
  knowledgeDocuments,
  knowledgeSearchLogs,
} from '@techjm/db';

const execFileAsync = promisify(execFile);
const EMBEDDING_DIMENSIONS = 64;

export type KnowledgeSource = 'uploads' | 'web' | 'both';

export interface ChunkResult {
  content: string;
  chunkIndex: number;
  tokenCount: number;
  embedding: number[];
  metadata: Record<string, unknown>;
}

export interface KnowledgeSearchResult {
  chunkId: string;
  documentId: string;
  fileName: string;
  content: string;
  score: number;
  metadata: Record<string, unknown> | null;
}

export function getFileType(fileName: string): string {
  return path.extname(fileName).replace('.', '').toLowerCase();
}

function decodeText(buffer: Buffer) {
  return buffer.toString('utf8').replace(/\u0000/g, '').trim();
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

async function extractPdfText(buffer: Buffer, fileName: string) {
  const tempPath = path.join(tmpdir(), `${Date.now()}-${fileName}`);
  await fs.writeFile(tempPath, buffer);
  try {
    const { stdout } = await execFileAsync('pdftotext', [tempPath, '-']);
    return stdout.trim();
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => {});
  }
}

async function extractDocxText(buffer: Buffer, fileName: string) {
  const tempPath = path.join(tmpdir(), `${Date.now()}-${fileName}`);
  await fs.writeFile(tempPath, buffer);
  try {
    const script = `
import re, sys, zipfile
from xml.etree import ElementTree as ET
with zipfile.ZipFile(sys.argv[1]) as z:
    xml = z.read('word/document.xml')
root = ET.fromstring(xml)
texts = [node.text for node in root.iter() if node.text]
print(re.sub(r'\\s+', ' ', ' '.join(texts)).strip())
`.trim();
    const { stdout } = await execFileAsync('python3', ['-c', script, tempPath]);
    return stdout.trim();
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => {});
  }
}

export async function extractTextFromBuffer(
  fileName: string,
  mimeType: string,
  buffer: Buffer,
): Promise<string> {
  const fileType = getFileType(fileName);

  if (['txt', 'md', 'csv'].includes(fileType)) {
    return decodeText(buffer);
  }

  if (fileType === 'html' || mimeType.includes('html')) {
    return stripHtml(decodeText(buffer));
  }

  if (fileType === 'pdf' || mimeType.includes('pdf')) {
    return extractPdfText(buffer, fileName);
  }

  if (fileType === 'docx' || mimeType.includes('wordprocessingml')) {
    return extractDocxText(buffer, fileName);
  }

  throw new Error(`Unsupported file type: ${fileType || mimeType}`);
}

export function createDeterministicEmbedding(text: string): number[] {
  const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  for (const token of tokens) {
    let hash = 0;
    for (let i = 0; i < token.length; i += 1) {
      hash = (hash * 31 + token.charCodeAt(i)) >>> 0;
    }
    vector[hash % EMBEDDING_DIMENSIONS] += 1;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => Number((value / magnitude).toFixed(6)));
}

export function cosineSimilarity(left: number[], right: number[]): number {
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let i = 0; i < Math.min(left.length, right.length); i += 1) {
    dot += left[i] * right[i];
    leftMagnitude += left[i] * left[i];
    rightMagnitude += right[i] * right[i];
  }

  if (!leftMagnitude || !rightMagnitude) return 0;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

export function chunkText(text: string, maxLength = 900, overlap = 150): ChunkResult[] {
  const normalized = text.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  const chunks: ChunkResult[] = [];
  let cursor = 0;
  let chunkIndex = 0;

  while (cursor < normalized.length) {
    const end = Math.min(cursor + maxLength, normalized.length);
    const slice = normalized.slice(cursor, end).trim();
    if (slice) {
      chunks.push({
        content: slice,
        chunkIndex,
        tokenCount: slice.split(/\s+/).filter(Boolean).length,
        embedding: createDeterministicEmbedding(slice),
        metadata: {
          startOffset: cursor,
          endOffset: end,
        },
      });
      chunkIndex += 1;
    }

    if (end >= normalized.length) break;
    cursor = Math.max(end - overlap, cursor + 1);
  }

  return chunks;
}

export async function ingestKnowledgeDocument(input: {
  userId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  buffer: Buffer;
}) {
  const fileType = getFileType(input.fileName);
  const extractedText = await extractTextFromBuffer(input.fileName, input.mimeType, input.buffer);
  const chunks = chunkText(extractedText);

  const [document] = await db
    .insert(knowledgeDocuments)
    .values({
      userId: input.userId,
      fileName: input.fileName,
      fileType,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      status: 'ready',
      extractedText,
      summary: extractedText.slice(0, 500),
      chunkCount: chunks.length,
      processedAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  if (chunks.length > 0) {
    await db.insert(knowledgeChunks).values(
      chunks.map((chunk) => ({
        documentId: document.id,
        userId: input.userId,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        tokenCount: chunk.tokenCount,
        embedding: chunk.embedding,
        metadata: chunk.metadata,
      })),
    );
  }

  return {
    document,
    chunks,
  };
}

export async function getKnowledgeDocumentsForUser(userId: string) {
  return db.query.knowledgeDocuments.findMany({
    where: eq(knowledgeDocuments.userId, userId),
    orderBy: [desc(knowledgeDocuments.updatedAt)],
  });
}

export async function searchKnowledge(
  userId: string,
  query: string,
  limit = 8,
): Promise<KnowledgeSearchResult[]> {
  const queryEmbedding = createDeterministicEmbedding(query);
  const documents = await db.query.knowledgeChunks.findMany({
    where: eq(knowledgeChunks.userId, userId),
    with: {
      document: {
        columns: {
          id: true,
          fileName: true,
        },
      },
    },
  });

  const results = documents
    .map((chunk) => {
      const embedding = (chunk.embedding as number[]) || [];
      const similarity = cosineSimilarity(queryEmbedding, embedding);
      const keywordBoost = chunk.content.toLowerCase().includes(query.toLowerCase()) ? 0.25 : 0;

      return {
        chunkId: chunk.id,
        documentId: chunk.document.id,
        fileName: chunk.document.fileName,
        content: chunk.content,
        score: Number((similarity + keywordBoost).toFixed(4)),
        metadata: (chunk.metadata as Record<string, unknown> | null) || null,
      };
    })
    .filter((chunk) => chunk.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);

  await db.insert(knowledgeSearchLogs).values({
    userId,
    query,
    source: 'uploads',
    resultsCount: results.length,
    metadata: { limit },
  });

  return results;
}

export async function deleteKnowledgeDocument(userId: string, documentId: string) {
  await db
    .delete(knowledgeChunks)
    .where(and(eq(knowledgeChunks.userId, userId), eq(knowledgeChunks.documentId, documentId)));

  await db
    .delete(knowledgeDocuments)
    .where(and(eq(knowledgeDocuments.userId, userId), eq(knowledgeDocuments.id, documentId)));
}
