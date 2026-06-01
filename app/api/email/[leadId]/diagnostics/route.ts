import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getVideoIndex } from "@/lib/session";
import {
  requestOriginFromNextRequest,
  watchPageUrl,
} from "@/lib/app-url";
import { thumbnailUrlForEmail } from "@/lib/media-url";

type Params = { params: Promise<{ leadId: string }> };

/**
 * GET /api/email/[leadId]/diagnostics
 * Temporary JSON metadata for email clipboard debugging (does not change email HTML).
 */
export async function GET(
  req: NextRequest,
  { params }: Params,
): Promise<NextResponse> {
  const { leadId } = await params;
  const origin = requestOriginFromNextRequest(req);

  const index = await getVideoIndex(leadId);
  if (!index) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  const watchUrl = watchPageUrl(leadId, origin);
  const thumb = thumbnailUrlForEmail(leadId, index.thumbnailUrl, origin);

  return NextResponse.json({
    leadId,
    thumbnailUrl: thumb ?? null,
    shortUrl: watchUrl,
    videoUrl: index.videoUrl?.startsWith("https://") ? index.videoUrl : null,
    storedThumbnailUrl: index.thumbnailUrl ?? null,
    shortUrlStored: index.shortUrl ?? null,
  });
}
