import type { NextRequest } from "next/server";
import { getSession, updateSession, getLeads } from "@/lib/session";
import { cleanupSession } from "@/lib/files";
import { getQueue, PROGRESS_CHANNEL } from "@/lib/queue";
import { createRedisClient } from "@/lib/redis";
import { ok, notFound, conflict, handleError } from "@/lib/api";
import { logger } from "@/lib/logger";

type Params = { params: Promise<{ sessionId: string }> };

/**
 * GET /api/session/[sessionId]
 * Returns current session state (stage, lead count).
 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { sessionId } = await params;
    const session = await getSession(sessionId);
    if (!session) return notFound("Session not found");

    const leads = await getLeads(sessionId);
    return ok({
      sessionId: session.id,
      stage: session.stage,
      createdAt: session.createdAt,
      leadCount: leads.length,
    });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * DELETE /api/session/[sessionId]
 * Cancellation: marks session as cancelled, removes waiting jobs, cleans temp files.
 *
 * Already-running jobs detect the cancelled stage on their next stage check
 * and abort gracefully.
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { sessionId } = await params;
    const session = await getSession(sessionId);
    if (!session) return notFound("Session not found");

    if (session.stage === "cancelled") {
      return conflict("Session is already cancelled");
    }

    // Mark as cancelled first — running jobs will pick this up
    await updateSession(sessionId, { stage: "cancelled" });

    // Publish cancellation so any open SSE dashboard transitions immediately.
    // Running worker stages still observe Redis state between heavy operations.
    const publisher = createRedisClient();
    try {
      await publisher.publish(
        PROGRESS_CHANNEL(sessionId),
        JSON.stringify({
          sessionId,
          stage: "cancelled",
          timestamp: Date.now(),
        }),
      );
    } finally {
      await publisher.quit().catch(() => undefined);
    }

    // Remove waiting/delayed jobs for this session from the queue
    const queue = getQueue();
    try {
      const waiting = await queue.getWaiting(0, -1);
      const delayed = await queue.getDelayed(0, -1);
      const toRemove = [...waiting, ...delayed].filter(
        (job) => job.data.sessionId === sessionId,
      );
      await Promise.allSettled(toRemove.map((job) => job.remove()));
      logger.info(
        { sessionId, removedJobs: toRemove.length },
        "cancelled session — removed waiting jobs",
      );
    } catch (qErr) {
      logger.warn({ qErr }, "could not remove all queue jobs during cancel");
    }

    // Clean temp files (fire-and-forget — don't fail the response)
    cleanupSession(sessionId).catch((e) =>
      logger.warn({ e }, "cleanup error during cancel"),
    );

    return ok({ sessionId, cancelled: true });
  } catch (err) {
    return handleError(err);
  }
}
