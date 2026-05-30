import { Queue } from "bullmq";
import { env } from "./env";
import type { LeadJobData } from "@/types/job";

export const QUEUE_NAME = "repliq-leads";
export const PROGRESS_CHANNEL = (sessionId: string) =>
  `progress:${sessionId}`;

/**
 * BullMQ connection options.
 *
 * We pass a plain URL string rather than an ioredis instance to avoid the
 * bundled-ioredis type conflict (BullMQ ships its own copy of ioredis).
 * BullMQ will create and manage its own internal Redis connections.
 */
export const bullmqConnection = { url: env.REDIS_URL } as const;

let _queue: Queue | null = null;

/** Singleton BullMQ producer queue — safe to call from Next.js route handlers. */
export function getQueue(): Queue<LeadJobData> {
  if (!_queue) {
    _queue = new Queue<LeadJobData>(QUEUE_NAME, {
      connection: { url: env.REDIS_URL },
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 500 },
      },
    });
  }
  return _queue as Queue<LeadJobData>;
}

/** Priority for newly enqueued batches (lower = sooner in BullMQ). */
export const NEW_BATCH_JOB_PRIORITY = 1;

/**
 * Remove waiting jobs belonging to other sessions so a new local batch
 * is not stuck behind stale dev runs in the global FIFO queue.
 */
export async function drainWaitingJobsForOtherSessions(
  currentSessionId: string,
): Promise<number> {
  const queue = getQueue();
  const waiting = await queue.getJobs(["waiting"], 0, 500);
  let removed = 0;
  for (const job of waiting) {
    const sid = job.data?.sessionId;
    if (sid && sid !== currentSessionId) {
      await job.remove();
      removed++;
    }
  }
  return removed;
}
