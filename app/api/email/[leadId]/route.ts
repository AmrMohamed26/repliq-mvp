import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getVideoIndex } from "@/lib/session";
import { buildEmailBody } from "@/lib/email";
import {
  requestOriginFromNextRequest,
  watchPageUrl,
} from "@/lib/app-url";
import { thumbnailUrlForEmail } from "@/lib/media-url";
import {
  CAL_BOOKING_URL,
  firstNameFromName,
  personalizedVideoIntroBody,
  VIDEO_NEAR_HINT,
} from "@/lib/personalized-message";

type Params = { params: Promise<{ leadId: string }> };

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * GET /api/email/[leadId]
 *
 * Returns copy-paste-ready email HTML for personalized video outreach.
 * ?preview=1 — same landing experience as /v/[id] (for internal preview).
 */
export async function GET(req: NextRequest, { params }: Params) {
  const { leadId } = await params;
  const preview = req.nextUrl.searchParams.get("preview") === "1";
  const origin = requestOriginFromNextRequest(req);

  const index = await getVideoIndex(leadId);
  if (!index) {
    return new NextResponse(
      "Video not found — lead has not been processed yet or the link has expired.",
      { status: 404 },
    );
  }

  const { name, thumbnailUrl, videoUrl } = index;
  const watchUrl = watchPageUrl(leadId, origin);
  const thumb = thumbnailUrlForEmail(leadId, thumbnailUrl, origin);
  const video = videoUrl?.startsWith("https://") ? videoUrl : undefined;

  // #region agent log
  fetch("http://127.0.0.1:7489/ingest/874f54e3-af15-42bb-a33a-e094f9419f9f", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "b8d92c",
    },
    body: JSON.stringify({
      sessionId: "b8d92c",
      runId: "gmail-fix",
      hypothesisId: "H-email-urls",
      location: "app/api/email/[leadId]/route.ts:GET",
      message: "email urls built",
      data: {
        leadId,
        watchUrl: watchUrl.slice(0, 80),
        thumbSrc: thumb?.slice(0, 80),
        thumbIsProxy: Boolean(thumb?.includes("/api/media/thumb")),
        origin: origin.slice(0, 60),
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  const emailBody = buildEmailBody({ name, watchUrl, thumbnailUrl: thumb });

  if (preview) {
    const firstName = escapeHtml(firstNameFromName(name));
    const intro = escapeHtml(personalizedVideoIntroBody());
    const hint = escapeHtml(VIDEO_NEAR_HINT);

    const mediaBlock = video
      ? `<video class="video-player" src="${video}" poster="${thumb ?? ""}" controls playsinline preload="metadata"></video>`
      : thumb
        ? `<a href="${watchUrl}" target="_blank" rel="noopener" class="thumb-link"><img src="${thumb}" alt="" class="thumb-img" /><span class="thumb-play" aria-hidden="true"></span></a>`
        : `<a href="${watchUrl}" class="btn-book" target="_blank" rel="noopener">Watch video</a>`;

    return new NextResponse(
      `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${firstName}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0a0a0a;
      color: #fafafa;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      -webkit-font-smoothing: antialiased;
      padding: 48px 20px;
    }
    .page {
      width: 100%;
      max-width: 520px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 28px;
    }
    .greeting {
      margin: 0;
      font-size: 2.35rem;
      font-weight: 600;
      letter-spacing: -0.02em;
      line-height: 1.15;
    }
    .intro {
      margin: 0;
      max-width: 440px;
      font-size: 1.05rem;
      line-height: 1.55;
      color: #a3a3a3;
    }
    .media-wrap {
      width: 100%;
      max-width: 440px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }
    .near-hint {
      margin: 0;
      font-size: 11px;
      line-height: 1.35;
      color: #737373;
    }
    .video-player {
      display: block;
      width: 100%;
      max-height: 70vh;
      border-radius: 16px;
      background: #000;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .thumb-link {
      position: relative;
      display: block;
      width: 100%;
      border-radius: 16px;
      overflow: hidden;
      line-height: 0;
    }
    .thumb-img {
      display: block;
      width: 100%;
      height: auto;
      border-radius: 16px;
    }
    .thumb-play {
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: rgba(255,255,255,0.95);
      box-shadow: 0 4px 24px rgba(0,0,0,0.35);
    }
    .thumb-play::after {
      content: "";
      position: absolute;
      left: 54%;
      top: 50%;
      transform: translate(-50%, -50%);
      border: 10px solid transparent;
      border-left: 17px solid #0a0a0a;
      border-right: 0;
    }
    .btn-book {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 14px 32px;
      border-radius: 100px;
      background: #fff;
      color: #0a0a0a;
      font-size: 16px;
      font-weight: 600;
      text-decoration: none;
    }
    .btn-book:hover { background: #e8e8e8; }
  </style>
</head>
<body>
  <main class="page">
    <header style="display:flex;flex-direction:column;align-items:center;gap:16px;">
      <h1 class="greeting">Hi ${firstName}</h1>
      <p class="intro">${intro}</p>
    </header>
    <div class="media-wrap">
      <p class="near-hint">${hint}</p>
      ${mediaBlock}
    </div>
    <a href="${CAL_BOOKING_URL}" class="btn-book" target="_blank" rel="noopener noreferrer">Book a Call</a>
  </main>
</body>
</html>`,
      { headers: { "Content-Type": "text/html" } },
    );
  }

  return new NextResponse(emailBody, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
