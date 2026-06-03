import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getVideoIndex } from "@/lib/session";
import { requestOriginFromNextRequest, watchPageUrl } from "@/lib/app-url";

type Params = { params: Promise<{ leadId: string }> };

/**
 * GET /go/[leadId]
 * Neutral redirect for email thumbnail clicks (avoids Gmail /v/ video heuristics).
 */
export async function GET(req: NextRequest, { params }: Params) {
  const { leadId } = await params;
  const origin = requestOriginFromNextRequest(req);

  const index = await getVideoIndex(leadId);
  if (!index) {
    return new NextResponse("Video not found", { status: 404 });
  }

  return NextResponse.redirect(
    watchPageUrl({ id: leadId, slug: index.slug }, origin),
    302,
  );
}
