import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { config as loadEnv } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

let loaded = false;

export function ensureDbEnvLoaded() {
  if (loaded) return;

  for (const envPath of [
    path.join(repoRoot, '.env'),
    path.join(repoRoot, '.env.local'),
    path.join(repoRoot, 'apps/worker/.env'),
    path.join(repoRoot, 'apps/worker/.env.local'),
    path.join(repoRoot, 'apps/web/.env'),
    path.join(repoRoot, 'apps/web/.env.local'),
    path.join(repoRoot, 'packages/db/.env'),
    path.join(repoRoot, 'packages/db/.env.local'),
  ]) {
    if (existsSync(envPath)) {
      loadEnv({ path: envPath, override: true, quiet: true });
    }
  }

  loaded = true;
}
