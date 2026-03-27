#!/usr/bin/env tsx
/**
 * Uptime Kuma Monitor Setup — TechJM MVP
 *
 * Prints monitor definitions for manual setup in Uptime Kuma UI (localhost:3001).
 * Uptime Kuma should already be running from docker-compose (Phase 1).
 *
 * Run: npx tsx scripts/setup-uptime-kuma.ts
 */

import 'dotenv/config';

interface Monitor {
  name: string;
  type: 'http' | 'port';
  url?: string;
  hostname?: string;
  port?: number;
  method?: string;
  headers?: string;
  body?: string;
  interval: number;
  retryInterval: number;
  maxretries: number;
  requiresEnv?: string;
}

const MONITORS: Monitor[] = [
  {
    name: 'PostgreSQL',
    type: 'port',
    hostname: 'localhost',
    port: 5432,
    interval: 60,
    retryInterval: 30,
    maxretries: 3,
  },
  {
    name: 'Redis',
    type: 'port',
    hostname: 'localhost',
    port: 6379,
    interval: 60,
    retryInterval: 30,
    maxretries: 3,
  },
  {
    name: 'Worker Health',
    type: 'http',
    url: 'http://localhost:3100/health',
    interval: 60,
    retryInterval: 30,
    maxretries: 3,
  },
  {
    name: 'Next.js Frontend',
    type: 'http',
    url: 'http://localhost:3000',
    interval: 120,
    retryInterval: 60,
    maxretries: 2,
  },
  {
    name: 'Postiz',
    type: 'http',
    url: 'http://localhost:5000/health',
    interval: 120,
    retryInterval: 60,
    maxretries: 2,
  },
  {
    name: 'Firebase Auth',
    type: 'http',
    url: `https://www.googleapis.com/identitytoolkit/v3/relyingparty/getProjectConfig?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '<FIREBASE_API_KEY>'}`,
    interval: 300,
    retryInterval: 120,
    maxretries: 2,
    requiresEnv: 'NEXT_PUBLIC_FIREBASE_API_KEY',
  },
  {
    name: 'Bull Board',
    type: 'http',
    url: 'http://localhost:3101/admin/queues',
    interval: 120,
    retryInterval: 60,
    maxretries: 2,
  },
];

// Optional monitors - only if env vars set
if (process.env.OPENAI_API_KEY) {
  MONITORS.push({
    name: 'OpenAI API',
    type: 'http',
    url: 'https://api.openai.com/v1/models',
    method: 'GET',
    headers: JSON.stringify({ Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }),
    interval: 300,
    retryInterval: 120,
    maxretries: 2,
  });
}

if (process.env.ANTHROPIC_API_KEY) {
  MONITORS.push({
    name: 'Anthropic API',
    type: 'http',
    url: 'https://api.anthropic.com/v1/messages',
    method: 'POST',
    headers: JSON.stringify({
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
    }),
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'hi' }],
    }),
    interval: 300,
    retryInterval: 120,
    maxretries: 2,
  });
}

console.log('=== Uptime Kuma Monitor Setup ===');
console.log('Open http://localhost:3001 and add these monitors:\n');

MONITORS.forEach((m) => {
  const target = m.url || `${m.hostname}:${m.port}`;
  console.log(`[${m.type.toUpperCase()}] ${m.name}`);
  console.log(`  Target: ${target}`);
  console.log(`  Interval: ${m.interval}s | Retry: ${m.retryInterval}s | Max retries: ${m.maxretries}`);
  if (m.method) console.log(`  Method: ${m.method}`);
  if (m.requiresEnv && !process.env[m.requiresEnv]) {
    console.log(`  WARNING: ${m.requiresEnv} not set — update URL after setting`);
  }
  console.log('');
});

console.log('=== Telegram Alert Channel ===');
console.log('In Uptime Kuma UI -> Settings -> Notifications -> Add Telegram:');
console.log(`  Bot Token: ${process.env.TELEGRAM_BOT_TOKEN ? '(set)' : '<TELEGRAM_BOT_TOKEN>'}`);
console.log('  Chat ID: your Telegram chat ID');
console.log('  Enable for all monitors');
console.log('\nThis gives instant Telegram alerts when any service goes down.');
