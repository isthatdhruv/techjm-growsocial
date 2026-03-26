import { NextRequest } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';
import { db, users } from '@techjm/db';
import { eq } from 'drizzle-orm';

export async function getAuthenticatedUser(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.split('Bearer ')[1];
  const decoded = await getAdminAuth().verifyIdToken(token);

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.firebaseUid, decoded.uid))
    .limit(1);

  return user || null;
}
