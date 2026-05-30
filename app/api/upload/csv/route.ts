import type { NextRequest } from "next/server";
import { getSession, setLeads } from "@/lib/session";
import { parseCsv } from "@/lib/csv";
import { enrichLeadsWithUpworkBlocks } from "@/lib/upwork-lead";
import { ok, notFound, badRequest, conflict, handleError } from "@/lib/api";
import { CSV_MAX_BYTES, CSV_ALLOWED_TYPES } from "@/lib/validators";

/**
 * POST /api/upload/csv?sessionId=xxx
 * Body: multipart/form-data with field `file` (CSV).
 *
 * CSVs are small enough to buffer as text for parsing.
 * Max size: 5 MB. Re-uploading replaces the previous CSV.
 */
export async function POST(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get("sessionId");
    if (!sessionId) return badRequest("Missing sessionId query param");

    const session = await getSession(sessionId);
    if (!session) return notFound("Session not found");
    if (session.stage === "processing" || session.stage === "completed") {
      return conflict("Cannot replace CSV while processing is active");
    }
    if (session.stage === "cancelled") {
      return conflict("Session is cancelled");
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return badRequest('Missing form field "file"');
    }

    // Size guard
    if (file.size > CSV_MAX_BYTES) {
      return badRequest(
        `CSV file too large (${(file.size / 1024).toFixed(0)} KB). Max: ${CSV_MAX_BYTES / 1024} KB`,
        "FILE_TOO_LARGE",
      );
    }

    // MIME type guard (also accept text/plain since some OS/browsers mislabel)
    const mime = file.type || "text/csv";
    if (!CSV_ALLOWED_TYPES.includes(mime) && !mime.startsWith("text/")) {
      return badRequest(
        `Invalid file type "${mime}". Expected a CSV file`,
        "INVALID_MIME_TYPE",
      );
    }

    const rawCsv = await file.text();
    if (!rawCsv.trim()) return badRequest("CSV file is empty");

    const { leads: parsedLeads, errors } = parseCsv(rawCsv);
    const leads = enrichLeadsWithUpworkBlocks(parsedLeads);

    if (leads.length === 0) {
      return badRequest(
        `No valid rows found. ${errors.length > 0 ? `Errors: ${errors.map((e) => `row ${e.row}: ${e.message}`).join("; ")}.` : "Check your column headers — website is required per row (name and email optional)."}`,
        "NO_VALID_ROWS",
      );
    }

    // Persist leads; also bumps session stage to csv_uploaded
    await setLeads(sessionId, leads);

    return ok({
      count: leads.length,
      leads,
      errors,
    });
  } catch (err) {
    return handleError(err);
  }
}
