import type { NextRequest } from "next/server";
import { z } from "zod";
import { getSession, setLeads } from "@/lib/session";
import { enrichLeadsWithUpworkBlocks } from "@/lib/upwork-lead";
import { ok, notFound, badRequest, conflict, handleError } from "@/lib/api";

const leadPayloadSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string(),
  website: z.string().url(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const bodySchema = z.object({
  sessionId: z.string().min(1),
  leads: z.array(leadPayloadSchema).min(1),
});

/**
 * POST /api/upload/leads
 * Body: JSON { sessionId, leads }
 *
 * Persists manually entered leads (same shape as CSV). Replaces prior leads
 * for the session when not processing.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(
        parsed.error.issues.map((i) => i.message).join(", "),
        "VALIDATION_ERROR",
      );
    }

    const { sessionId, leads: rawLeads } = parsed.data;

    const session = await getSession(sessionId);
    if (!session) return notFound("Session not found");
    if (session.stage === "processing" || session.stage === "completed") {
      return conflict("Cannot replace leads while processing is active");
    }
    if (session.stage === "cancelled") {
      return conflict("Session is cancelled");
    }

    const leads = enrichLeadsWithUpworkBlocks(rawLeads);

    await setLeads(sessionId, leads);

    return ok({
      count: leads.length,
      leads,
    });
  } catch (err) {
    return handleError(err);
  }
}
