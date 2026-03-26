import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { db, users } from '@techjm/db';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Advance onboarding step
    const stepNum = parseInt(user.onboardingStep);
    if (!isNaN(stepNum) && stepNum <= 4) {
      await db
        .update(users)
        .set({ onboardingStep: '5', updatedAt: new Date() })
        .where(eq(users.id, user.id));
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Social complete error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
