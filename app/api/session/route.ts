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
    return handleError(err);
  }
}
