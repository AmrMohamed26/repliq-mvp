import type { NextRequest } from "next/server";
import { getSession, getAllResults } from "@/lib/session";
import { buildExportCsv } from "@/lib/csv";
import { notFound, handleError } from "@/lib/api";

type Params = { params: Promise<{ sessionId: string }> };

/**
 * GET /api/export/[sessionId]
 * Streams a downloadable CSV of all lead results.
 * Available at any session stage — partial results export mid-processing.
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { sessionId } = await params;

    const session = await getSession(sessionId);
    if (!session) return notFound("Session not found");

    const results = await getAllResults(sessionId);
    const csv = buildExportCsv(results);

    const filename = `repliq-results-${sessionId.slice(0, 8)}.csv`;

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
