import type { NextRequest } from "next/server";
import { getQueue } from "@/lib/queue";
import { ok, handleError } from "@/lib/api";

/**
 * GET /api/health/queue?sessionId=...
 * Lightweight queue snapshot so the UI can detect a stopped worker.
 * With sessionId, also reports how many waiting jobs belong to other sessions.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get("sessionId") ?? undefined;
    const queue = getQueue();
    const counts = await queue.getJobCounts(
      "waiting",
      "active",
      "delayed",
      "failed",
      "completed",
    );
    const waiting = counts.waiting ?? 0;
    const active = counts.active ?? 0;
    // Heuristic: jobs waiting but nothing active → worker likely not running
    const workerLikelyDown = waiting > 0 && active === 0;

    let otherSessionWaiting = 0;
    if (sessionId && waiting > 0) {
      const waitingJobs = await queue.getJobs(["waiting"], 0, 200);
      otherSessionWaiting = waitingJobs.filter(
        (j) => j.data?.sessionId && j.data.sessionId !== sessionId,
      ).length;
    }

    return ok({
      waiting,
      active,
      delayed: counts.delayed ?? 0,
      workerLikelyDown,
      otherSessionWaiting,
    });
  } catch (err) {
    return handleError(err);
  }
}
