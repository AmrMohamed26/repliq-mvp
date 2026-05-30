import "dotenv/config";
import { Worker } from "bullmq";
import { createRedisClient } from "@/lib/redis";
import { QUEUE_NAME, bullmqConnection } from "@/lib/queue";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getBrowser, closeBrowser } from "./browser";
import { processLead } from "./processors/lead.processor";
import { sweepOldSessions } from "@/lib/files";
import { getCookieStatusReport } from "@/lib/site-cookies";
import type { LeadJobData } from "@/types/job";

async function main() {
  logger.info(
    {
      pid: process.pid,
      node: process.version,
      workerConcurrency: env.WORKER_CONCURRENCY,
      renderConcurrency: env.RENDER_CONCURRENCY,
      remotionCrf: env.REMOTION_CRF,
    },
    "repliq worker starting",
  );

  // Sweep stale temp files on startup
  await sweepOldSessions().catch((err) =>
    logger.warn({ err }, "sweep failed — continuing"),
  );

  const cookieReport = await getCookieStatusReport();
  for (const p of cookieReport.platforms) {
    const logFn =
      p.health === "ok"
        ? logger.info.bind(logger)
        : p.health === "warn"
          ? logger.warn.bind(logger)
          : logger.error.bind(logger);
    logFn({ platform: p.platform, health: p.health }, p.message);
  }

  // Pre-warm the browser so the first job doesn't pay launch cost
  await getBrowser();
  logger.info("Chromium browser pre-warmed");

  // Dedicated Redis client for publishing progress events.
  // BullMQ uses its own internal connection; the publisher is separate.
  const publisher = createRedisClient();

  const worker = new Worker<LeadJobData>(
    QUEUE_NAME,
    async (job) => {
      logger.info({ jobId: job.id, leadId: job.data.leadId }, "job started");
      await processLead(job, publisher);
    },
    {
      connection: bullmqConnection,
      concurrency: env.WORKER_CONCURRENCY,
      limiter: {
        // Max N jobs active at once — prevents Chromium context overload
        max: env.WORKER_CONCURRENCY,
        duration: 1000,
      },
    },
  );

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id, leadId: job.data.leadId }, "job completed");
  });

  worker.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, leadId: job?.data.leadId, err },
      "job failed",
    );
  });

  worker.on("error", (err) => {
    logger.error({ err }, "worker error");
  });

  logger.info(
    { queue: QUEUE_NAME, concurrency: env.WORKER_CONCURRENCY },
    "worker listening for jobs",
  );

  // ─── Graceful shutdown ─────────────────────────────────────────────
  async function shutdown(signal: string) {
    logger.info({ signal }, "shutdown signal received");

    // Stop accepting new jobs, drain in-flight ones
    await worker.close();
    logger.info("BullMQ worker drained");

    await closeBrowser();
    await publisher.quit();

    logger.info("shutdown complete");
    process.exit(0);
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Keep the process alive
  await new Promise(() => {});
}

main().catch((err) => {
  logger.error({ err }, "worker crashed during boot");
  process.exit(1);
});
