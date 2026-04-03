import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { ingestKnowledgeDocument, getKnowledgeDocumentsForUser } from '@/lib/knowledge';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const documents = await getKnowledgeDocumentsForUser(user.id);
  return NextResponse.json({ documents });
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const files = formData.getAll('files').filter((entry): entry is File => entry instanceof File);

  if (files.length === 0) {
    return NextResponse.json({ error: 'At least one file is required' }, { status: 400 });
  }

  const uploaded = [];
  const failed: { fileName: string; error: string }[] = [];

  for (const file of files) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await ingestKnowledgeDocument({
        userId: user.id,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: buffer.byteLength,
        buffer,
      });

      uploaded.push(result.document);
    } catch (error) {
      failed.push({
        fileName: file.name,
        error: error instanceof Error ? error.message : 'Upload failed',
      });
    }
  }

  return NextResponse.json({
    success: uploaded.length > 0,
    uploaded,
    failed,
  });
}
