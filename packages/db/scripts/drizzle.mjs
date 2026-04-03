import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { config as loadEnv } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(packageRoot, '../..');

const candidateEnvFiles = [
  path.join(repoRoot, '.env'),
  path.join(repoRoot, '.env.local'),
  path.join(packageRoot, '.env'),
  path.join(repoRoot, 'apps/web/.env'),
  path.join(repoRoot, 'apps/web/.env.local'),
  path.join(repoRoot, 'apps/worker/.env'),
];

for (const envPath of candidateEnvFiles) {
  if (existsSync(envPath)) {
    loadEnv({ path: envPath, override: false, quiet: true });
  }
}

if (!process.env.DATABASE_URL) {
  console.error(
    'DATABASE_URL is not configured. Add it to .env, apps/web/.env.local, apps/worker/.env, or packages/db/.env.',
  );
  process.exit(1);
}

const [, , command = 'push', ...extraArgs] = process.argv;
const drizzleBinCandidates = [
  path.join(packageRoot, 'node_modules', '.bin', 'drizzle-kit'),
  path.join(repoRoot, 'node_modules', '.bin', 'drizzle-kit'),
];
const drizzleBin = drizzleBinCandidates.find((candidate) => existsSync(candidate));
const tscBin = [
  path.join(packageRoot, 'node_modules', '.bin', 'tsc'),
  path.join(repoRoot, 'node_modules', '.bin', 'tsc'),
].find((candidate) => existsSync(candidate));

if (!drizzleBin) {
  console.error('Unable to find drizzle-kit binary. Run npm install first.');
  process.exit(1);
}

if (!tscBin) {
  console.error('Unable to find tsc binary. Run npm install first.');
  process.exit(1);
}

const buildResult = spawnSync(tscBin, ['-p', 'tsconfig.json'], {
  cwd: packageRoot,
  env: process.env,
  stdio: 'inherit',
});

if (buildResult.error || (buildResult.status ?? 0) !== 0) {
  console.error(buildResult.error || 'Failed to build @techjm/db before running drizzle.');
  process.exit(buildResult.status ?? 1);
}

const args = [command, '--config', 'drizzle.config.ts', ...extraArgs];

const result = spawnSync(drizzleBin, args, {
  cwd: packageRoot,
  env: process.env,
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 0);
