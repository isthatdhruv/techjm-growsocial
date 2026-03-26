import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const hex = process.env.DB_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      'DB_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Encrypts plaintext using AES-256-GCM.
 * Output format: base64(iv + authTag + ciphertext)
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // iv (12) + authTag (16) + ciphertext
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString('base64');
}

/**
 * Decrypts a base64 string produced by encrypt().
 */
export function decrypt(encryptedBase64: string): string {
  const key = getKey();
  const combined = Buffer.from(encryptedBase64, 'base64');

  if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Encrypted data is too short to contain IV and auth tag');
  }

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

/** Convenience wrapper: encrypts an API key string. */
export function encryptApiKey(apiKey: string): string {
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error('Cannot encrypt an empty API key');
  }
  return encrypt(apiKey);
}

/** Convenience wrapper: decrypts an encrypted API key string. */
export function decryptApiKey(encrypted: string): string {
  try {
    return decrypt(encrypted);
  } catch (err) {
    throw new Error(
      `Failed to decrypt API key. The key may have been encrypted with a different DB_ENCRYPTION_KEY. ` +
        `Original error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
