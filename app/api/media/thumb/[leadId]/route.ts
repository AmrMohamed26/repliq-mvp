import { NextResponse } from "next/server";
import { getVideoIndex } from "@/lib/session";

type Params = { params: Promise<{ leadId: string }> };

/**
 * GET /api/media/thumb/[leadId]
 *
 * Serves the lead thumbnail from our domain (stable for Gmail + app UI).
 * Fetches the canonical file from Supabase using the VideoIndex source URL.
 */
export async function GET(
  _req: Request,
  { params }: Params,
): Promise<NextResponse> {
  const { leadId } = await params;
  const index = await getVideoIndex(leadId);

  const source = index?.thumbnailUrl;
  if (!source?.startsWith("https://")) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const upstream = await fetch(source, {
      headers: { Accept: "image/*" },
      next: { revalidate: 3600 },
    });

    if (!upstream.ok) {
      return new NextResponse("Upstream thumbnail unavailable", {
        status: upstream.status,
      });
    }

    const body = await upstream.arrayBuffer();
    const contentType =
      upstream.headers.get("content-type") ?? "image/jpeg";

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": "inline",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return new NextResponse("Failed to load thumbnail", { status: 502 });
  }
}
