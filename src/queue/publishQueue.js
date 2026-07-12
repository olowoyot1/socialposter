import { Queue } from "bullmq";
import IORedis from "ioredis";

export const connection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const publishQueue = new Queue("publish", { connection });

/**
 * Schedule a single PostTarget for publishing. `delay` is computed from
 * post.scheduledFor so BullMQ handles the wait — no polling loop needed.
 */
export async function enqueuePublishJob(targetId, scheduledFor) {
  const delay = Math.max(0, new Date(scheduledFor).getTime() - Date.now());
  const job = await publishQueue.add(
    "publish-target",
    { targetId },
    {
      delay,
      // jobId = targetId makes re-enqueueing the same target idempotent —
      // BullMQ won't create a duplicate job for the same target.
      jobId: targetId,
      attempts: 3,
      backoff: { type: "exponential", delay: 30_000 },
      removeOnComplete: { age: 60 * 60 * 24 * 7 }, // keep a week for the audit log
      removeOnFail: false,
    }
  );
  return job.id;
}
