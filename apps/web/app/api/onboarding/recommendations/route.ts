import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { db, recommendationMatrix } from '@techjm/db';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const niche = request.nextUrl.searchParams.get('niche');
    if (!niche) {
      return NextResponse.json({ error: 'Missing niche parameter' }, { status: 400 });
    }

    // Try exact niche match first
    let [rec] = await db
      .select()
      .from(recommendationMatrix)
      .where(eq(recommendationMatrix.niche, niche))
      .limit(1);

    // Fallback to Budget row for custom niches
    if (!rec) {
      [rec] = await db
        .select()
        .from(recommendationMatrix)
        .where(eq(recommendationMatrix.niche, 'Budget (Any Niche)'))
        .limit(1);
    }

    if (!rec) {
      return NextResponse.json({ error: 'No recommendations found' }, { status: 404 });
    }

    return NextResponse.json({ recommendation: rec });
  } catch (err) {
    console.error('Recommendations error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
