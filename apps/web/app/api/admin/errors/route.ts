import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { db, jobErrors, users } from '@techjm/db';
import { eq, and, desc, gte, sql } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user || user.plan !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  const resolved = searchParams.get('resolved');
  const range = searchParams.get('range') || '24h';
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
  const offset = parseInt(searchParams.get('offset') || '0');

  // Calculate time range
  const rangeMs: Record<string, number> = {
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
  };
  const since = new Date(Date.now() - (rangeMs[range] || rangeMs['24h']));

  const conditions = [gte(jobErrors.createdAt, since)];

  if (category) {
    conditions.push(eq(jobErrors.errorCategory, category as typeof jobErrors.errorCategory.enumValues[number]));
  }

  if (resolved === 'true') {
    conditions.push(eq(jobErrors.resolved, true));
  } else if (resolved === 'false') {
    conditions.push(eq(jobErrors.resolved, false));
  }

  const errors = await db
    .select({
      id: jobErrors.id,
      userId: jobErrors.userId,
      userEmail: users.email,
      jobType: jobErrors.jobType,
      jobId: jobErrors.jobId,
      errorCategory: jobErrors.errorCategory,
      errorMessage: jobErrors.errorMessage,
      context: jobErrors.context,
      stack: jobErrors.stack,
      resolved: jobErrors.resolved,
      resolvedAt: jobErrors.resolvedAt,
      createdAt: jobErrors.createdAt,
    })
    .from(jobErrors)
    .leftJoin(users, eq(jobErrors.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(jobErrors.createdAt))
    .limit(limit)
    .offset(offset);

  // Stats
  const stats = await db
    .select({
      total: sql<number>`count(*)`,
      unresolved: sql<number>`count(*) filter (where not ${jobErrors.resolved})`,
    })
    .from(jobErrors)
    .where(gte(jobErrors.createdAt, since));

  const categoryBreakdown = await db
    .select({
      category: jobErrors.errorCategory,
      count: sql<number>`count(*)`,
    })
    .from(jobErrors)
    .where(gte(jobErrors.createdAt, since))
    .groupBy(jobErrors.errorCategory);

  return NextResponse.json({
    errors,
    stats: {
      total: stats[0]?.total || 0,
      unresolved: stats[0]?.unresolved || 0,
      range,
      categories: categoryBreakdown,
    },
    pagination: { limit, offset },
  });
}

export async function PATCH(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user || user.plan !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { id } = body;

  if (!id) {
    return NextResponse.json({ error: 'Missing error id' }, { status: 400 });
  }

  await db
    .update(jobErrors)
    .set({ resolved: true, resolvedAt: new Date() })
    .where(eq(jobErrors.id, id));

  return NextResponse.json({ success: true });
}
