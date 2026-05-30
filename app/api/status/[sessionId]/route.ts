import type { NextRequest } from "next/server";
import { createRedisClient } from "@/lib/redis";
import { getSession, getLeads, getAllResults, setStage } from "@/lib/session";
import { PROGRESS_CHANNEL } from "@/lib/queue";
import { logger } from "@/lib/logger";
import type { ProgressEvent } from "@/types/job";
import type { LeadStatus } from "@/types/lead";

type Params = { params: Promise<{ sessionId: string }> };

const encoder = new TextEncoder();
const HEARTBEAT_MS = 25_000;

function sseEvent(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function sseComment(comment: string): Uint8Array {
  return encoder.encode(`: ${comment}\n\n`);
}

/**
 * GET /api/status/[sessionId]
 *
 * Server-Sent Events stream for real-time job progress.
 *
 * Protocol:
 *   event: init       — fires immediately with current results + stage
 *   event: progress   — one per lead state change (screenshotting→rendering→uploading→done|failed)
 *   event: batch_done — fires when all leads have reached a terminal state
 *   : heartbeat       — comment every 25 s to keep proxies/CDN alive
 *
 * The stream closes automatically when:
 *   - All leads reach done/failed
 *   - The session is cancelled
 *   - The client disconnects (AbortSignal)
 *
 * On reconnect the client receives the latest state in the `init` event,
 * so no event replay mechanism is needed.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const { sessionId } = await params;

  const session = await getSession(sessionId);
  if (!session) {
    return new Response(
      JSON.stringify({ error: "Session not found", code: "NOT_FOUND" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const leads = await getLeads(sessionId);
  const totalLeads = leads.length;

  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let sub: ReturnType<typeof createRedisClient> | null = null;

  function cleanup() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (sub) {
      sub.unsubscribe().catch(() => undefined);
      sub.quit().catch(() => undefined);
      sub = null;
    }
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(sseEvent(event, data));
        } catch {
          // Controller may be closed if client already disconnected
        }
      };

      // ── Initial state snapshot ───────────────────────────────────────
      const existingResults = await getAllResults(sessionId);
      send("init", {
        sessionId,
        stage: session.stage,
        totalLeads,
        results: existingResults,
      });

      // If session is already terminal, close immediately
      if (
        session.stage === "completed" ||
        session.stage === "cancelled"
      ) {
        send("batch_done", { sessionId, stage: session.stage });
        controller.close();
        return;
      }

      // ── Track terminal lead count from existing results ──────────────
      const terminalStatuses: LeadStatus[] = ["done", "failed"];
      let terminalCount = existingResults.filter((r) =>
        terminalStatuses.includes(r.status),
      ).length;

      const tryClose = async (stage: "completed" | "cancelled") => {
        cleanup();
        send("batch_done", { sessionId, stage });
        if (stage === "completed") {
          await setStage(sessionId, "completed").catch(() => undefined);
        }
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      if (terminalCount >= totalLeads && totalLeads > 0) {
        await tryClose("completed");
        return;
      }

      // ── Subscribe to Redis pub/sub ───────────────────────────────────
      sub = createRedisClient();
      const channel = PROGRESS_CHANNEL(sessionId);

      sub.on("error", (err) => {
        logger.warn({ err, sessionId }, "SSE subscriber redis error");
      });

      await sub.subscribe(channel);

      sub.on("message", async (_ch: string, rawMsg: string) => {
        let event: ProgressEvent;
        try {
          event = JSON.parse(rawMsg) as ProgressEvent;
        } catch {
          return;
        }

        // Cancellation is a batch-level event, not a lead progress update.
        if ((event as unknown as { stage: string }).stage === "cancelled") {
          await tryClose("cancelled");
          return;
        }

        send("progress", event);

        if (terminalStatuses.includes(event.status as LeadStatus)) {
          terminalCount++;
          if (terminalCount >= totalLeads) {
            await tryClose("completed");
          }
        }
      });

      // ── Heartbeat ────────────────────────────────────────────────────
      heartbeatTimer = setInterval(() => {
        try {
          controller.enqueue(sseComment("heartbeat"));
        } catch {
          cleanup();
        }
      }, HEARTBEAT_MS);
    },

    cancel() {
      cleanup();
    },
  });

  // Also clean up on client disconnect (more reliable than stream cancel in some runtimes)
  request.signal.addEventListener("abort", () => {
    cleanup();
    logger.debug({ sessionId }, "SSE client disconnected");
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable nginx buffering
    },
  });
}
