import type { NextApiRequest, NextApiResponse } from 'next';
import { exec } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'dotenv';
import { getAdminAuth } from '@/lib/firebase-admin';

type SuccessResponse = {
  success: true;
  output: string;
};

type ErrorResponse = {
  success: false;
  error: string;
  stdout?: string;
  stderr?: string;
};

const REPO_ROOT = path.resolve(process.cwd(), '..', '..');
const ENV_PATHS = [
  path.join(REPO_ROOT, '.env'),
  path.join(REPO_ROOT, '.env.local'),
  path.join(REPO_ROOT, 'apps', 'worker', '.env'),
  path.join(REPO_ROOT, 'apps', 'worker', '.env.local'),
  path.join(REPO_ROOT, 'apps', 'web', '.env'),
  path.join(REPO_ROOT, 'apps', 'web', '.env.local'),
];
const PYTHON_TIMEOUT_MS = 180_000;

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SuccessResponse | ErrorResponse>,
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
  const hashtags = typeof req.body?.hashtags === 'string' ? req.body.hashtags.trim() : '';

  if (!content) {
    return res.status(400).json({ success: false, error: 'content is required' });
  }

  const pythonEnv = {
    ...process.env,
    ...readRepoEnv(),
  };

  for (const key of ['LINKEDIN_EMAIL', 'LINKEDIN_PASSWORD', 'LINKEDIN_COMPANY_ADMIN_URL']) {
    if (!pythonEnv[key]?.trim()) {
      return res.status(500).json({
        success: false,
        error: `${key} is not configured for LinkedIn browser automation.`,
      });
    }
  }

  const command = [
    'source .venv/bin/activate',
    '&&',
    'python3 scripts/linkedin_poster.py',
    shellQuote(content),
    '--hashtags',
    shellQuote(hashtags),
  ].join(' ');

  try {
    const result = await execAsync(command, {
      cwd: REPO_ROOT,
      env: pythonEnv,
      shell: '/bin/bash',
      timeout: PYTHON_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
    });

    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    console.info('[publish-linkedin] success', output);
    return res.status(200).json({
      success: true,
      output: output || 'LinkedIn post submitted successfully.',
    });
  } catch (error) {
    const execError = error as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      killed?: boolean;
      signal?: NodeJS.Signals;
    };

    const stderr = execError.stderr?.trim() || '';
    const stdout = execError.stdout?.trim() || '';
    const timeoutMessage =
      execError.killed || execError.signal === 'SIGTERM' ? 'LinkedIn automation timed out.' : '';
    const message = summarizeExecError(
      stderr || stdout || timeoutMessage || execError.message || 'Unknown error',
    );

    console.error('[publish-linkedin] failed', {
      message,
      stdout,
      stderr,
    });

    return res.status(500).json({
      success: false,
      error: message,
      stdout: stdout || undefined,
      stderr: stderr || undefined,
    });
  }
}

function execAsync(
  command: string,
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    shell: string;
    timeout: number;
    maxBuffer: number;
  },
) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    exec(command, options, (error, stdout, stderr) => {
      if (error) {
        return reject(Object.assign(error, { stdout, stderr }));
      }
      resolve({ stdout, stderr });
    });
  });
}

function readRepoEnv() {
  const merged: Record<string, string> = {};

  for (const envPath of ENV_PATHS) {
    if (!fs.existsSync(envPath)) continue;
    const parsed = parse(fs.readFileSync(envPath));
    Object.assign(merged, parsed);
  }

  return merged;
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

async function getAuthenticatedUser(req: NextApiRequest) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice('Bearer '.length);
  try {
    return await getAdminAuth().verifyIdToken(token);
  } catch {
    return null;
  }
}

function summarizeExecError(rawMessage: string) {
  const lines = rawMessage
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (
      line.startsWith('RuntimeError:') ||
      line.startsWith('Error:') ||
      line.startsWith('playwright._impl._errors.Error:')
    ) {
      return line;
    }
  }

  return lines[lines.length - 1] || 'LinkedIn automation failed.';
}
