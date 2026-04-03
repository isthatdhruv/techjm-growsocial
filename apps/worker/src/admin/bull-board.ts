import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import express from 'express';
import { Queue } from 'bullmq';
import { connection } from '../redis.js';
import { QUEUE_NAMES } from '../queues.js';

export function startBullBoard(port: number = Number(process.env.BULL_BOARD_PORT || '3101')) {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  const queueAdapters = Object.values(QUEUE_NAMES).map(
    (name) => new BullMQAdapter(new Queue(name, { connection })),
  );

  // Add backup queue
  queueAdapters.push(new BullMQAdapter(new Queue('backup', { connection })));

  createBullBoard({
    queues: queueAdapters,
    serverAdapter,
  });

  const app = express();
  app.use('/admin/queues', serverAdapter.getRouter());

  const server = app.listen(port, () => {
    console.log(`Bull Board running at http://localhost:${port}/admin/queues`);
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.warn(
        `[bull-board] Port ${port} is already in use. Worker will continue without Bull Board on this process.`,
      );
      return;
    }

    console.error(`[bull-board] Failed to start: ${error.message}`);
  });
}
