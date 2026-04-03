import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { db, knowledgeDocuments, knowledgeChunks } from '@techjm/db';
import {
  chunkText,
  deleteKnowledgeDocument,
} from '@/lib/knowledge';

export const dynamic = 'force-dynamic';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  await deleteKnowledgeDocument(user.id, id);
  return NextResponse.json({ success: true });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const document = await db.query.knowledgeDocuments.findFirst({
    where: and(eq(knowledgeDocuments.userId, user.id), eq(knowledgeDocuments.id, id)),
  });

  if (!document?.extractedText) {
    return NextResponse.json({ error: 'Document not found or has no text to reprocess' }, { status: 404 });
  }

  const chunks = chunkText(document.extractedText);

  await db.delete(knowledgeChunks).where(eq(knowledgeChunks.documentId, id));
  if (chunks.length > 0) {
    await db.insert(knowledgeChunks).values(
      chunks.map((chunk) => ({
        documentId: id,
        userId: user.id,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        tokenCount: chunk.tokenCount,
        embedding: chunk.embedding,
        metadata: chunk.metadata,
      })),
    );
  }

  await db
    .update(knowledgeDocuments)
    .set({
      chunkCount: chunks.length,
      status: 'ready',
      processedAt: new Date(),
      updatedAt: new Date(),
      errorMessage: null,
    })
    .where(eq(knowledgeDocuments.id, id));

  return NextResponse.json({ success: true, chunkCount: chunks.length });
}
