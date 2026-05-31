import type { Job } from "bullmq";
import { getQueue } from "./queue";
import {
  getAllResults,
  getLeads,
  setLeadResult,
  setStage,
} from "./session";
import type { LeadResult } from "@/types/lead";
import { logger } from "./logger";

const IN_PROGRESS: LeadResult["status"][] = [
  "pending",
  "screenshotting",
  "rendering",
  "uploading",
];

/** No BullMQ job for this long while still "rendering" → treat as orphaned. */
const ORPHAN_MS = 8 * 60 * 1000;

async function sessionQueueJobs(sessionId: string): Promise<{
  activeLeadIds: Set<string>;
  failedByLead: Map<string, Job>;
}> {
  const queue = getQueue();
  const activeLeadIds = new Set<string>();
  for (const state of ["active", "waiting", "delayed"] as const) {
    const jobs = await queue.getJobs([state], 0, 300);
    for (const job of jobs) {
      if (job.data?.sessionId !== sessionId) continue;
      activeLeadIds.add(job.data.leadId);
    }
  }

  const failedByLead = new Map<string, Job>();
  const failedJobs = await queue.getJobs(["failed"], 0, 200);
  for (const job of failedJobs) {
    if (job.data?.sessionId !== sessionId) continue;
    failedByLead.set(job.data.leadId, job);
  }

  return { activeLeadIds, failedByLead };
}

/**
 * Fix UI stuck on Rendering/Screenshotting when BullMQ marked the job failed
 * (e.g. "job stalled more than allowable limit") but Redis was never updated.
 */
export async function reconcileStaleResults(
  sessionId: string,
): Promise<number> {
  const [results, leads] = await Promise.all([
    getAllResults(sessionId),
    getLeads(sessionId),
  ]);

  const stuck = results.filter((r) => IN_PROGRESS.includes(r.status));
  if (stuck.length === 0) return 0;

  const { activeLeadIds, failedByLead } = await sessionQueueJobs(sessionId);
  let fixed = 0;

  for (const r of stuck) {
    if (activeLeadIds.has(r.id)) continue;

    const failedJob = failedByLead.get(r.id);
    if (failedJob) {
      const reason =
        failedJob.failedReason?.split("\n")[0]?.trim() ||
        "Job failed in the queue";
      await setLeadResult(sessionId, {
        ...r,
        status: "failed",
        error: reason,
        finishedAt: Date.now(),
      });
      fixed++;
      // #region agent log
      fetch("http://127.0.0.1:7489/ingest/874f54e3-af15-42bb-a33a-e094f9419f9f", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "b8d92c",
        },
        body: JSON.stringify({
          sessionId: "b8d92c",
          runId: "post-fix",
          hypothesisId: "H4",
          location: "lib/reconcile-queue.ts",
          message: "reconciled from failed job",
          data: { sessionId, leadId: r.id, reason: reason.slice(0, 120) },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      logger.info(
        { sessionId, leadId: r.id, reason },
        "reconciled stale lead from failed queue job",
      );
      continue;
    }

    if (r.status === "pending") continue;

    const started = r.startedAt ?? 0;
    if (started > 0 && Date.now() - started >= ORPHAN_MS) {
      await setLeadResult(sessionId, {
        ...r,
        status: "failed",
        error:
          "Processing stopped (worker offline or render stalled). Redeploy the Railway worker, then start a new batch.",
        finishedAt: Date.now(),
      });
      fixed++;
      logger.info(
        { sessionId, leadId: r.id, status: r.status },
        "reconciled orphaned in-progress lead",
      );
    }
  }

  if (fixed > 0) {
    const updated = await getAllResults(sessionId);
    const terminal = updated.filter(
      (x) => x.status === "done" || x.status === "failed",
    );
    if (terminal.length >= leads.length && leads.length > 0) {
      await setStage(sessionId, "completed");
    }
  }

  return fixed;
}
