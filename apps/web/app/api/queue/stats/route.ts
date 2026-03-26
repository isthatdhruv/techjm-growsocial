import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { db, posts } from '@techjm/db';
import { eq, and, sql, gte, lte, asc } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

  // Start of this week (Monday)
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
  const endOfWeek = new Date(startOfWeek.getTime() + 7 * 24 * 60 * 60 * 1000);

  const userCondition = eq(posts.userId, user.id);

  // Run all counts in parallel
  const [scheduledTodayResult, scheduledWeekResult, publishedWeekResult, failedResult, nextPost] =
    await Promise.all([
      // Scheduled today
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(posts)
        .where(
          and(
            userCondition,
            eq(posts.status, 'scheduled'),
            gte(posts.scheduledAt, startOfToday),
            lte(posts.scheduledAt, endOfToday),
          ),
        ),

      // Scheduled this week
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(posts)
        .where(
          and(
            userCondition,
            eq(posts.status, 'scheduled'),
            gte(posts.scheduledAt, startOfWeek),
            lte(posts.scheduledAt, endOfWeek),
          ),
        ),

      // Published this week
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(posts)
        .where(
          and(
            userCondition,
            eq(posts.status, 'published'),
            gte(posts.publishedAt, startOfWeek),
            lte(posts.publishedAt, endOfWeek),
          ),
        ),

      // Failed count
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(posts)
        .where(and(userCondition, eq(posts.status, 'failed'))),

      // Next scheduled post
      db.query.posts.findFirst({
        where: and(userCondition, eq(posts.status, 'scheduled')),
        orderBy: [asc(posts.scheduledAt)],
        columns: {
          id: true,
          platform: true,
          scheduledAt: true,
          caption: true,
        },
      }),
    ]);

  return NextResponse.json({
    scheduledToday: scheduledTodayResult[0]?.count || 0,
    scheduledThisWeek: scheduledWeekResult[0]?.count || 0,
    publishedThisWeek: publishedWeekResult[0]?.count || 0,
    failedCount: failedResult[0]?.count || 0,
    nextScheduled: nextPost
      ? {
          postId: nextPost.id,
          platform: nextPost.platform,
          scheduledAt: nextPost.scheduledAt,
          captionPreview: nextPost.caption?.substring(0, 80),
        }
      : null,
  });
}
