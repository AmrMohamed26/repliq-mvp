import { createSession } from "@/lib/session";
import { created, handleError } from "@/lib/api";

/**
 * POST /api/session
 * Creates a new session and returns the sessionId.
 * No auth. No body required.
 */
export async function POST() {
  try {
    const session = await createSession();
    return created({
      sessionId: session.id,
      stage: session.stage,
      createdAt: session.createdAt,
      leadCount: 0,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // #region agent log
    fetch("http://127.0.0.1:7489/ingest/874f54e3-af15-42bb-a33a-e094f9419f9f", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "b8d92c",
      },
      body: JSON.stringify({
        sessionId: "b8d92c",
        runId: "redis-serverless",
        hypothesisId: "H3",
        location: "app/api/session/route.ts:POST",
        message: "createSession failed",
        data: { error: msg },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    return handleError(err);
  }
}
