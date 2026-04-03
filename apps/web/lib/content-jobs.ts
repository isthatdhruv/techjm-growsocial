import { db, platformConnections, scoredTopics } from '@techjm/db';
import { and, eq } from 'drizzle-orm';
import { captionGenQueue } from '@/lib/queue-client';

export async function queueTopicContentGeneration(userId: string, scoredTopicId: string) {
  const topic = await db.query.scoredTopics.findFirst({
    where: and(eq(scoredTopics.id, scoredTopicId), eq(scoredTopics.userId, userId)),
  });

  if (!topic) {
    throw new Error('Topic not found');
  }

  console.info(`[content-jobs] approving topic user=${userId} topic=${scoredTopicId}`);
  await db.update(scoredTopics).set({ status: 'approved' }).where(eq(scoredTopics.id, scoredTopicId));

  const connections = await db.query.platformConnections.findMany({
    where: and(
      eq(platformConnections.userId, userId),
      eq(platformConnections.connectionHealth, 'healthy'),
    ),
    columns: {
      platform: true,
    },
  });

  let platforms = connections
    .map((connection) => connection.platform)
    .filter((platform): platform is 'linkedin' | 'x' => platform === 'linkedin' || platform === 'x');

  if (platforms.length === 0) {
    platforms = ['linkedin', 'x'];
  }

  console.info(
    `[content-jobs] queueing caption generation user=${userId} topic=${scoredTopicId} platforms=${platforms.join(',')}`,
  );

  const job = await captionGenQueue.add(
    `caption-${scoredTopicId}`,
    {
      userId,
      scoredTopicId,
      rawTopicId: topic.rawTopicId,
      platforms,
    },
    {
      attempts: 2,
      backoff: { type: 'exponential', delay: 15000 },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 100 },
    },
  );

  console.info(
    `[content-jobs] queued caption generation user=${userId} topic=${scoredTopicId} jobId=${job.id}`,
  );

  return {
    topic,
    platforms,
    jobId: job.id,
  };
}
