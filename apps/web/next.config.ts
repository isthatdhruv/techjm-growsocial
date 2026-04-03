import type { NextConfig } from 'next';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { config as loadEnv } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');

for (const envPath of [
  path.join(repoRoot, '.env'),
  path.join(repoRoot, '.env.local'),
  path.join(__dirname, '.env'),
  path.join(__dirname, '.env.local'),
]) {
  if (existsSync(envPath)) {
    loadEnv({ path: envPath, override: false, quiet: true });
  }
}

const nextConfig: NextConfig = {
  transpilePackages: ['@techjm/shared', '@techjm/db', '@techjm/rate-limiter'],
  serverExternalPackages: [
    'bullmq',
    'ioredis',
    'postgres',
    'openai',
    '@anthropic-ai/sdk',
    '@google/generative-ai',
    '@mistralai/mistralai',
    'replicate',
    'rss-parser',
    'firebase-admin',
  ],
};

export default nextConfig;
