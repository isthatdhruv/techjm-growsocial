import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { db, users, userNicheProfiles } from '@techjm/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const nicheBodySchema = z.object({
  niche: z.string().min(1).max(100),
  pillars: z.array(z.string()).min(3).max(6),
  audience: z.string().min(1),
  tone: z.string().min(1).max(50),
  competitors: z
    .array(z.object({ handle: z.string(), platform: z.enum(['linkedin', 'x']) }))
    .optional()
    .default([]),
  antiTopics: z.array(z.string()).optional().default([]),
  examplePosts: z.array(z.string()).max(3).optional().default([]),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = nicheBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const data = parsed.data;

    // Upsert niche profile
    const existing = await db
      .select()
      .from(userNicheProfiles)
      .where(eq(userNicheProfiles.userId, user.id))
      .limit(1);

    let profile;
    if (existing.length > 0) {
      [profile] = await db
        .update(userNicheProfiles)
        .set({
          niche: data.niche,
          pillars: data.pillars,
          audience: data.audience,
          tone: data.tone,
          competitors: data.competitors,
          antiTopics: data.antiTopics,
          examplePosts: data.examplePosts,
          updatedAt: new Date(),
        })
        .where(eq(userNicheProfiles.userId, user.id))
        .returning();
    } else {
      [profile] = await db
        .insert(userNicheProfiles)
        .values({
          userId: user.id,
          niche: data.niche,
          pillars: data.pillars,
          audience: data.audience,
          tone: data.tone,
          competitors: data.competitors,
          antiTopics: data.antiTopics,
          examplePosts: data.examplePosts,
        })
        .returning();
    }

    // Advance onboarding step (only forward, not backward)
    const stepNum = parseInt(user.onboardingStep);
    if (!isNaN(stepNum) && stepNum <= 2) {
      await db
        .update(users)
        .set({ onboardingStep: '3', updatedAt: new Date() })
        .where(eq(users.id, user.id));
    }

    return NextResponse.json({ success: true, profile });
  } catch (err) {
    console.error('Niche save error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [profile] = await db
      .select()
      .from(userNicheProfiles)
      .where(eq(userNicheProfiles.userId, user.id))
      .limit(1);

    return NextResponse.json({ profile: profile || null });
  } catch (err) {
    console.error('Niche fetch error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
