import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

function getServiceAccount() {
  const key = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY;
  if (!key) {
    throw new Error('FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY is not set.');
  }

  try {
    return JSON.parse(key);
  } catch {
    throw new Error(
      'FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY must be a valid JSON string of the service account.',
    );
  }
}

function initAdmin() {
  if (getApps().length === 0) {
    initializeApp({ credential: cert(getServiceAccount()) });
  }
  return getAuth();
}

export const getAdminAuth = () => initAdmin();
