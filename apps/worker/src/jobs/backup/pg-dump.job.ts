import { Worker, Job, Queue } from 'bullmq';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { connection } from '../../redis.js';
import { withErrorHandling } from '../../lib/error-handler.js';

const execAsync = promisify(exec);

const BACKUP_DIR = process.env.BACKUP_DIR || '/tmp/techjm-backups';
const RETENTION_DAILY = 7;
const RETENTION_WEEKLY = 30;

interface BackupJobData {
  type: 'daily' | 'weekly';
}

async function processBackup(job: Job<BackupJobData>) {
  const { type } = job.data;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `techjm-${type}-${timestamp}.sql.gz`;
  const filepath = path.join(BACKUP_DIR, filename);

  job.log(`Starting ${type} backup: ${filename}`);

  await fs.mkdir(BACKUP_DIR, { recursive: true });

  const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/techjm';
  const pgDumpCmd = `pg_dump "${dbUrl}" --format=plain --no-owner --no-acl | gzip > "${filepath}"`;

  try {
    const { stderr } = await execAsync(pgDumpCmd, { timeout: 300000 });
    if (stderr && !stderr.includes('WARNING')) {
      job.log(`pg_dump warnings: ${stderr}`);
    }
  } catch (dumpError: unknown) {
    const msg = (dumpError as Error).message;
    throw new Error(`pg_dump failed: ${msg}`);
  }

  const stats = await fs.stat(filepath);
  if (stats.size < 1000) {
    throw new Error(`Backup file suspiciously small: ${stats.size} bytes`);
  }

  job.log(`Backup created: ${filename} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

  if (process.env.BACKUP_S3_BUCKET) {
    try {
      const s3Cmd = `aws s3 cp "${filepath}" "s3://${process.env.BACKUP_S3_BUCKET}/backups/${filename}"`;
      await execAsync(s3Cmd, { timeout: 120000 });
      job.log(`Uploaded to S3: s3://${process.env.BACKUP_S3_BUCKET}/backups/${filename}`);
    } catch (uploadError: unknown) {
      job.log(`S3 upload failed (backup saved locally): ${(uploadError as Error).message}`);
    }
  }

  // Clean up old backups
  const retentionDays = type === 'daily' ? RETENTION_DAILY : RETENTION_WEEKLY;
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const allFiles = await fs.readdir(BACKUP_DIR);
  const backupFiles = allFiles.filter((f) => f.startsWith(`techjm-${type}-`) && f.endsWith('.sql.gz'));

  let deletedCount = 0;
  for (const file of backupFiles) {
    const filePath = path.join(BACKUP_DIR, file);
    const fileStat = await fs.stat(filePath);
    if (fileStat.mtime < cutoffDate) {
      await fs.unlink(filePath);
      deletedCount++;
    }
  }

  if (deletedCount > 0) {
    job.log(`Cleaned up ${deletedCount} old ${type} backups (retention: ${retentionDays} days)`);
  }

  return {
    filename,
    size: `${(stats.size / 1024 / 1024).toFixed(2)} MB`,
    type,
    oldBackupsDeleted: deletedCount,
  };
}

export const backupWorker = new Worker(
  'backup',
  withErrorHandling('backup', processBackup),
  { connection, concurrency: 1 },
);

export async function scheduleBackups() {
  const queue = new Queue('backup', { connection });

  // Every 6 hours
  await queue.upsertJobScheduler('backup-daily', { pattern: '0 */6 * * *' }, { name: 'backup-daily', data: { type: 'daily' } });

  // Sunday 2 AM
  await queue.upsertJobScheduler('backup-weekly', { pattern: '0 2 * * 0' }, { name: 'backup-weekly', data: { type: 'weekly' } });

  await queue.close();
}
