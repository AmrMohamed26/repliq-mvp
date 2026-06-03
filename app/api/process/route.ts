import type { NextRequest } from "next/server";
import { getSession, getLeads, setStage, setLeadResult } from "@/lib/session";
import {
  getQueue,
  drainWaitingJobsForOtherSessions,
  NEW_BATCH_JOB_PRIORITY,
} from "@/lib/queue";
import { ok, notFound, badRequest, conflict, unprocessable, handleError } from "@/lib/api";
import {
  processRequestSchema,
  MAX_LEADS_PER_BATCH,
} from "@/lib/validators";
import { logger } from "@/lib/logger";
import type { LeadJobData } from "@/types/job";

/**
 * POST /api/process
 * Body: JSON { sessionId }
 *
 * Validates the session is ready (both CSV and video uploaded), then
 * enqueues one BullMQ job per lead. Heavy work happens only in workers.
 *
 * Concurrency controls:
 * - Session must be in `video_uploaded` stage (prevents double-enqueue)
 * - Maximum MAX_LEADS_PER_BATCH leads per batch
 * - Jobs are added via addBulk() — one round-trip to Redis
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = processRequestSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(
        parsed.error.issues.map((i) => i.message).join(", "),
        "VALIDATION_ERROR",
      );
    }
    const { sessionId } = parsed.data;

    const session = await getSession(sessionId);
    if (!session) return notFound("Session not found");

    // ── Stage checks ───────────────────────────────────────────────────────
    if (session.stage === "processing") {
      return conflict("This session is already being processed");
    }
    if (session.stage === "completed") {
      return conflict("This session has already completed. Create a new session to run again");
    }
    if (session.stage === "cancelled") {
      return conflict("This session was cancelled");
    }
    if (session.stage === "created") {
      return unprocessable("Add leads before starting", "MISSING_LEADS");
    }
    if (!session.talkingHeadPath || !session.talkingHeadDurationSec) {
      return unprocessable("Upload a talking head video before starting", "MISSING_VIDEO");
    }

    const leads = await getLeads(sessionId);
    if (leads.length === 0) {
      return unprocessable("No leads found for this session", "NO_LEADS");
    }

    if (leads.length > MAX_LEADS_PER_BATCH) {
      return badRequest(
        `Batch too large: ${leads.length} leads. Maximum: ${MAX_LEADS_PER_BATCH}`,
        "TOO_MANY_LEADS",
      );
    }

    // ── Mark as processing before enqueuing (prevents race condition) ──────
    await setStage(sessionId, "processing");

    // Seed Redis results as pending so the UI shows queued state immediately
    await Promise.all(
      leads.map((lead) =>
        setLeadResult(sessionId, {
          id: lead.id,
          slug: lead.slug,
          name: lead.name,
          email: lead.email,
          website: lead.website,
          status: "pending",
        }),
      ),
    );

    // ── Build job payloads ─────────────────────────────────────────────────
    const jobsBulk = leads.map((lead) => ({
      name: `lead:${lead.id}`,
      data: {
        sessionId,
        leadId: lead.id,
        name: lead.name,
        email: lead.email,
        website: lead.website,
        talkingHeadPath: session.talkingHeadPath!,
        talkingHeadStorageKey: session.talkingHeadStorageKey,
        durationSec: session.talkingHeadDurationSec!,
      } satisfies LeadJobData,
      opts: { priority: NEW_BATCH_JOB_PRIORITY },
    }));

    const queue = getQueue();
    const drainedOtherSessions = await drainWaitingJobsForOtherSessions(sessionId);
    await queue.addBulk(jobsBulk);
    const jobCounts = await queue.getJobCounts(
      "waiting",
      "active",
      "delayed",
      "failed",
      "completed",
    );

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
        hypothesisId: "H1",
        location: "app/api/process/route.ts:enqueue",
        message: "batch enqueued after drain",
        data: {
          sessionId,
          enqueuedCount: leads.length,
          drainedOtherSessions,
          jobCounts,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    logger.info(
      { sessionId, enqueuedCount: leads.length, drainedOtherSessions, jobCounts },
      "batch enqueued",
    );

    return ok({
      enqueuedCount: leads.length,
      sessionId,
      drainedOtherSessions,
    });
  } catch (err) {
    return handleError(err);
  }
}
