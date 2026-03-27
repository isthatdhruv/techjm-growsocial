'use client';

import { GlassCard } from '@/app/components/glass-card';

export default function QueuesAdminPage() {
  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold text-white">Queue Admin</h1>

      <GlassCard>
        <div className="p-4">
          <p className="mb-4 text-white/70">
            BullMQ Dashboard — view queue depths, job statuses, retry failed jobs, and inspect payloads.
          </p>
          <a
            href="http://localhost:3101/admin/queues"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-lg bg-indigo-500/20 px-4 py-2 text-indigo-300 hover:bg-indigo-500/30"
          >
            Open Bull Board (port 3101)
          </a>
        </div>
      </GlassCard>

      <GlassCard>
        <div className="p-4">
          <h2 className="mb-3 text-lg font-semibold text-white">Embedded Dashboard</h2>
          <iframe
            src="http://localhost:3101/admin/queues"
            className="h-[700px] w-full rounded-lg border border-white/10"
            title="Bull Board"
          />
        </div>
      </GlassCard>
    </div>
  );
}
