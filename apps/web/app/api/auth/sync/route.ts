import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';
import { db, users } from '@techjm/db';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing authorization token' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(token);

    // Upsert user
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.firebaseUid, decoded.uid))
      .limit(1);

    if (existing.length > 0) {
      // Update existing user
      await db
        .update(users)
        .set({
          email: decoded.email ?? existing[0].email,
          name: decoded.name ?? existing[0].name,
          avatarUrl: decoded.picture ?? existing[0].avatarUrl,
          updatedAt: new Date(),
        })
        .where(eq(users.firebaseUid, decoded.uid));

      return NextResponse.json({
        id: existing[0].id,
        onboardingStep: existing[0].onboardingStep,
      });
    }

    // Insert new user — step 1 (signup) is complete since they authenticated
    const [newUser] = await db
      .insert(users)
      .values({
        firebaseUid: decoded.uid,
        email: decoded.email ?? '',
        name: decoded.name,
        avatarUrl: decoded.picture,
        onboardingStep: '2',
      })
      .returning();

    return NextResponse.json({
      id: newUser.id,
      onboardingStep: newUser.onboardingStep,
    });
  } catch (err) {
    console.error('Auth sync error:', err);
    return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
  }
}
