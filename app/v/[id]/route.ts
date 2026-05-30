import { NextResponse } from "next/server";
import { getVideoIndex } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /v/[id]
 * Short-link redirect: resolves a leadId → actual Supabase video URL.
 * Stored in Redis secondary index written by setLeadResult on job completion.
 */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;

  if (!id || typeof id !== "string") {
    return new NextResponse("Bad request", { status: 400 });
  }

  const index = await getVideoIndex(id);

  if (!index?.videoUrl) {
    return new NextResponse(
      `<!doctype html><html><body style="font-family:system-ui;text-align:center;padding:80px">
        <h2 style="color:#fff">Video not found</h2>
        <p style="color:#aaa">This link may have expired or the video hasn't been processed yet.</p>
        <a href="/" style="color:#888;font-size:14px">← Back to home</a>
      </body></html>`,
      {
        status: 404,
        headers: { "Content-Type": "text/html" },
      },
    );
  }

  return NextResponse.redirect(index.videoUrl, { status: 302 });
}
