import type { NextRequest } from "next/server";
import { getSession, getLeads, getAllResults } from "@/lib/session";
import { ok, notFound, handleError } from "@/lib/api";

type Params = { params: Promise<{ sessionId: string }> };

/**
 * GET /api/results/[sessionId]
 * Returns the full results payload for a session.
 * Works at any stage — partial results are returned while processing.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { sessionId } = await params;

    const session = await getSession(sessionId);
    if (!session) return notFound("Session not found");

    const [leads, results] = await Promise.all([
      getLeads(sessionId),
      getAllResults(sessionId),
    ]);

    const completedCount = results.filter((r) => r.status === "done").length;
    const failedCount = results.filter((r) => r.status === "failed").length;

    // Merge: leads that haven't started yet appear as pending
    const leadIds = new Set(results.map((r) => r.id));
    const pendingResults = leads
      .filter((l) => !leadIds.has(l.id))
      .map((l) => ({
        ...l,
        status: "pending" as const,
      }));

    return ok({
      sessionId,
      stage: session.stage,
      totalLeads: leads.length,
      results: [...pendingResults, ...results].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
      completedCount,
      failedCount,
    });
  } catch (err) {
    return handleError(err);
  }
}
