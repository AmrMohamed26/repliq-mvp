/**
 * Gmail-safe thumbnail: <img src> + original circular play control (CSS triangle).
 * Background-image on <td> is not used — Gmail strips it.
 */

/** Centers 64px play badge on thumbnail (height 203 → offset ≈ −(h/2 + 32)). */
function playBadgeMarginTopPx(thumbHeight: number): number {
  return -Math.round(thumbHeight / 2 + 32);
}

/** Original outreach play control (9c44f91) — white circle + border triangle. */
function emailPlayButtonDiv(): string {
  return `<div style="width:64px;height:64px;border-radius:50%;background-color:#ffffff;margin:0 auto;box-shadow:0 4px 24px rgba(0,0,0,0.35);text-align:center;line-height:64px;font-size:0;mso-line-height-rule:exactly;"><span style="display:inline-block;width:0;height:0;border-style:solid;border-width:11px 0 11px 19px;border-color:transparent transparent transparent #0a0a0a;margin-left:6px;vertical-align:middle;line-height:0;font-size:0;"></span></div>`;
}

export function emailThumbnailWithPlayOverlay(
  imageClickUrl: string,
  imageUrl: string,
  width: number,
  height: number,
): string {
  const playDiv = emailPlayButtonDiv();
  const overlayOffset = playBadgeMarginTopPx(height);

  // #region agent log
  fetch("http://127.0.0.1:7489/ingest/874f54e3-af15-42bb-a33a-e094f9419f9f", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "b8d92c",
    },
    body: JSON.stringify({
      sessionId: "b8d92c",
      runId: "play-overlay-v2",
      hypothesisId: "H1,H4",
      location: "lib/email-play-overlay.ts:emailThumbnailWithPlayOverlay",
      message: "email thumbnail markup built",
      data: {
        hasImg: true,
        hasBorderTriangle: playDiv.includes("border-width:11px"),
        hasUnicodePlay: playDiv.includes("&#9654"),
        overlayOffset,
        imageClickUrlHost: (() => {
          try {
            return new URL(imageClickUrl).host;
          } catch {
            return null;
          }
        })(),
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${width}" align="center" style="margin:0 auto;border-collapse:collapse;"><tr><td align="center" style="padding:0;line-height:0;font-size:0;mso-line-height-rule:exactly;"><a href="${imageClickUrl}" target="_blank" style="text-decoration:none;display:inline-block;line-height:0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${width}" style="border-collapse:collapse;"><tr><td width="${width}" style="padding:0;line-height:0;font-size:0;"><img src="${imageUrl}" alt="Watch your personalized video" width="${width}" height="${height}" border="0" style="display:block;width:${width}px;height:${height}px;border:0;outline:none;text-decoration:none;border-radius:12px;-ms-interpolation-mode:bicubic;" /></td></tr><tr><td align="center" width="${width}" style="padding:0;line-height:0;font-size:0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin-top:${overlayOffset}px;border-collapse:collapse;"><tr><td align="center" valign="middle" style="padding:0;line-height:0;font-size:0;">${playDiv}</td></tr></table></td></tr></table></a></td></tr></table>`;
}
