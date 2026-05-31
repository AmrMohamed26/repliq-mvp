import { access } from "node:fs/promises";
import type { Job } from "bullmq";
import type { LeadJobData, ProgressEvent } from "@/types/job";
import type { LeadStatus } from "@/types/lead";
import { captureScreenshot } from "../pipeline/screenshot";
import { renderVideo } from "../pipeline/render";
import { extractThumbnail } from "../pipeline/thumbnail";
import { uploadAssets } from "../pipeline/upload";
import {
  setLeadResult,
  getSession,
  getAllResults,
  getLeads,
  getCheckpoint,
  setCheckpoint,
  clearCheckpoint,
  saveBatchSummary,
  type LeadCheckpoint,
  type BatchSummary,
} from "@/lib/session";
import { cleanupLeadFiles } from "@/lib/files";
import { ensureTalkingHeadLocal } from "@/lib/talking-head";
import { logger } from "@/lib/logger";
import type Redis from "ioredis";
import { PROGRESS_CHANNEL } from "@/lib/queue";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true if the file exists on disk (checkpoint verification). */
async function fileExists(path: string): Promise<boolean> {
  return access(path).then(() => true).catch(() => false);
}

// ── Batch health summary ─────────────────────────────────────────────────────

/**
 * Called after every lead reaches a terminal state.
 * When the last lead completes (success or failure), computes and persists
 * a BatchSummary for the session and emits a structured log for observability.
 */
interface WarnInfoLogger {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
}

async function maybeFinalizeBatch(
  sessionId: string,
  log: WarnInfoLogger,
): Promise<void> {
  try {
    const [allResults, allLeads] = await Promise.all([
      getAllResults(sessionId),
      getLeads(sessionId),
    ]);

    const terminalResults = allResults.filter(
      (r) => r.status === "done" || r.status === "failed",
    );

    if (terminalResults.length < allLeads.length) return; // batch still in progress

    const successful = allResults.filter((r) => r.status === "done").length;
    const failed = allResults.filter((r) => r.status === "failed").length;

    const renderTimes = allResults
      .map((r) => r.renderTime)
      .filter((t): t is number => typeof t === "number");
    const avgRenderTimeMs =
      renderTimes.length > 0
        ? Math.round(renderTimes.reduce((a, b) => a + b, 0) / renderTimes.length)
        : 0;

    const finishedAts = allResults.map((r) => r.finishedAt ?? 0).filter(Boolean);
    const startedAts = allResults
      .map((r) => r.startedAt ?? Infinity)
      .filter((n) => n !== Infinity);

    const totalProcessingTimeMs =
      finishedAts.length > 0 && startedAts.length > 0
        ? Math.max(...finishedAts) - Math.min(...startedAts)
        : 0;

    const summary: BatchSummary = {
      sessionId,
      totalLeads: allLeads.length,
      successful,
      failed,
      avgRenderTimeMs,
      totalProcessingTimeMs,
      completedAt: Date.now(),
    };

    await saveBatchSummary(summary);

    log.info(
      {
        sessionId,
        totalLeads: summary.totalLeads,
        successful: summary.successful,
        failed: summary.failed,
        avgRenderTimeMs: summary.avgRenderTimeMs,
        totalProcessingTimeSec: Math.round(summary.totalProcessingTimeMs / 1000),
        stage: "batch_complete",
        status: "done",
      },
      "batch health summary",
    );
  } catch (err) {
    log.warn({ err }, "maybeFinalizeBatch error — summary not saved");
  }
}

// ── Main processor ───────────────────────────────────────────────────────────

/**
 * Processes a single lead through the full pipeline:
 *   screenshot → render → thumbnail → upload → persist result
 *
 * Design principles (Phase 6):
 *
 * Checkpoints — After each successful stage, a checkpoint is written to Redis.
 *   On BullMQ retry (worker crash / stall), the processor reads the checkpoint,
 *   verifies that any referenced files still exist on disk, and skips stages
 *   that have already completed.
 *
 * Per-stage retry — Different failure modes require different strategies:
 *   Screenshot: 2× retries (handled inside screenshot.ts via PLAYWRIGHT_RETRIES)
 *   Render:     1× retry (handled here — Remotion OOM / transient failure)
 *   Thumbnail:  2× retries (handled inside thumbnail.ts)
 *   Upload:     3× retries with exponential backoff (handled inside upload.ts)
 *
 * Failure isolation — One lead failure does NOT stop the batch. Errors are
 *   caught, the lead is marked `failed`, and the error is re-thrown so BullMQ
 *   can apply its own retry / fail policy.
 *
 * Cleanup — Temp files are removed ONLY on success.  On failure the files are
 *   preserved so a BullMQ retry can resume from the last checkpoint.  The
 *   sweepOldSessions() cron handles eventual cleanup of orphaned files.
 *
 * Output schema — Every terminal result (done | failed) carries the full
 *   LeadResult shape: name, email, website, status, videoUrl, thumbnailUrl,
 *   error, startedAt, finishedAt, renderTime.
 */
export async function processLead(
  job: Job<LeadJobData>,
  publisher: Redis,
): Promise<void> {
  const {
    sessionId,
    leadId,
    name,
    email,
    website,
    talkingHeadPath,
    talkingHeadStorageKey,
    durationSec,
  } = job.data;

  const log = logger.child({ sessionId, leadId, name, website });
  const channel = PROGRESS_CHANNEL(sessionId);
  const startedAt = Date.now();
  const host = (() => {
    try {
      return new URL(website).hostname;
    } catch {
      return "invalid";
    }
  })();

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
      hypothesisId: "H3",
      location: "workers/processors/lead.processor.ts:processLead",
      message: "worker picked job",
      data: { sessionId, leadId, jobId: job.id, host, website: website.slice(0, 120) },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  // ── publish + persist helper ───────────────────────────────────────────────
  async function publish(
    status: LeadStatus,
    extra: Partial<Omit<ProgressEvent, "sessionId" | "leadId" | "status" | "timestamp">> = {},
  ): Promise<void> {
    const event: ProgressEvent = {
      sessionId,
      leadId,
      status,
      timestamp: Date.now(),
      startedAt,
      ...extra,
    };
    await publisher.publish(channel, JSON.stringify(event));

    await setLeadResult(sessionId, {
      id: leadId,
      name,
      email,
      website,
      status,
      startedAt,
      ...extra,
    });
  }

  // ── cancellation guard ─────────────────────────────────────────────────────
  async function assertNotCancelled(): Promise<void> {
    const s = await getSession(sessionId);
    if (s?.stage === "cancelled") {
      throw new Error(`Session ${sessionId} was cancelled`);
    }
  }

  // ── Resume from checkpoint (BullMQ retry / stalled-job recovery) ───────────
  let screenshotPngPath: string | undefined;
  let videoPath: string | undefined;
  let thumbPath: string | undefined;

  const cp: LeadCheckpoint | null = await getCheckpoint(sessionId, leadId);
  if (cp) {
    log.info(
      { checkpoint: cp.stage, updatedAt: cp.updatedAt },
      "found checkpoint — verifying files",
    );

    // Verify that checkpoint files still exist on disk before using them
    if (cp.screenshotPath && await fileExists(cp.screenshotPath)) {
      screenshotPngPath = cp.screenshotPath;
    }
    if (cp.videoPath && await fileExists(cp.videoPath)) {
      videoPath = cp.videoPath;
      if (cp.thumbPath && await fileExists(cp.thumbPath)) {
        thumbPath = cp.thumbPath;
      }
    } else {
      // Video file gone — also discard screenshot to force a clean re-run
      // (render may have depended on a screenshot that was then modified)
      videoPath = undefined;
      thumbPath = undefined;
    }
  }

  let renderTime: number | undefined;

  let localTalkingHeadPath = talkingHeadPath;

  try {
    await assertNotCancelled();

    localTalkingHeadPath = await ensureTalkingHeadLocal(
      sessionId,
      talkingHeadPath,
      talkingHeadStorageKey,
    );

    // ── Stage 1: Screenshot ──────────────────────────────────────────────────
    if (!screenshotPngPath) {
      log.info({ stage: "screenshot", status: "starting" }, "capturing screenshot");
      await publish("screenshotting");

      screenshotPngPath = await captureScreenshot(sessionId, leadId, website);

      await setCheckpoint(sessionId, leadId, {
        stage: "screenshot_done",
        screenshotPath: screenshotPngPath,
        updatedAt: Date.now(),
      });
    } else {
      log.info(
        { stage: "screenshot", status: "skipped", path: screenshotPngPath },
        "checkpoint: screenshot already done",
      );
    }

    // ── Stage 2: Render (1× retry) ───────────────────────────────────────────
    if (!videoPath) {
      await assertNotCancelled();
      log.info({ stage: "render", status: "starting" }, "starting video render");
      await publish("rendering");

      const renderStart = Date.now();
      const renderInput = {
        sessionId,
        leadId,
        screenshotPngPath,
        talkingHeadPath: localTalkingHeadPath,
        leadName: name,
        durationSec,
      };

      try {
        videoPath = await renderVideo(renderInput);
      } catch (renderErr) {
        log.warn(
          { stage: "render", status: "retry", err: renderErr },
          "render failed on first attempt — retrying once",
        );
        videoPath = await renderVideo(renderInput); // single retry
      }

      renderTime = Date.now() - renderStart;

      await setCheckpoint(sessionId, leadId, {
        stage: "render_done",
        screenshotPath: screenshotPngPath,
        videoPath,
        updatedAt: Date.now(),
      });

      log.info(
        { stage: "render", status: "done", renderTimeMs: renderTime },
        "render complete",
      );
    } else {
      log.info(
        { stage: "render", status: "skipped", path: videoPath },
        "checkpoint: render already done",
      );
    }

    // ── Stage 3: Thumbnail ───────────────────────────────────────────────────
    if (!thumbPath) {
      thumbPath = await extractThumbnail(sessionId, leadId, videoPath);
      // Update checkpoint to record thumbnail path for future resume
      await setCheckpoint(sessionId, leadId, {
        stage: "render_done",
        screenshotPath: screenshotPngPath,
        videoPath,
        thumbPath,
        updatedAt: Date.now(),
      });
    }

    // ── Stage 4: Upload (3× retry with exponential backoff via upload.ts) ────
    await assertNotCancelled();
    log.info({ stage: "upload", status: "starting" }, "uploading assets");
    await publish("uploading");

    const { videoUrl, thumbnailUrl } = await uploadAssets(
      sessionId,
      leadId,
      videoPath,
      thumbPath,
    );

    // ── Stage 5: Done ────────────────────────────────────────────────────────
    const finishedAt = Date.now();
    const durationMs = finishedAt - startedAt;

    await clearCheckpoint(sessionId, leadId);
    await publish("done", {
      videoUrl,
      thumbnailUrl,
      finishedAt,
      renderTime,
    });

    log.info(
      {
        stage: "done",
        status: "success",
        videoUrl,
        durationMs,
        renderTimeMs: renderTime,
      },
      "lead processed successfully",
    );

    // Cleanup temp files on success only
    await cleanupLeadFiles(sessionId, leadId).catch((e) =>
      log.warn({ err: e }, "temp file cleanup warning"),
    );

    // Check if this was the final lead; emit batch summary if so
    await maybeFinalizeBatch(sessionId, log);

  } catch (err) {
    const isCancellation =
      err instanceof Error && err.message.includes("was cancelled");
    const errorMsg = err instanceof Error ? err.message : String(err);
    const finishedAt = Date.now();

    log.error(
      {
        stage: "failed",
        status: isCancellation ? "cancelled" : "error",
        err,
        durationMs: finishedAt - startedAt,
      },
      isCancellation ? "lead cancelled" : "lead processing failed",
    );

    // Persist failure state — errors in publish are swallowed so one bad Redis
    // write cannot mask the original job error
    await publish("failed", { error: errorMsg, finishedAt }).catch(() => undefined);

    // Check batch summary even on failure (might be the last lead)
    await maybeFinalizeBatch(sessionId, log);

    // Re-throw so BullMQ can apply its retry/fail policy.
    // Temp files are intentionally NOT cleaned up here so a BullMQ retry can
    // resume from the checkpoint and skip already-completed stages.
    throw err;
  }
}
