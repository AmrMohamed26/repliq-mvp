/**
 * Gmail-safe thumbnail: <img src> + centered circular play (CSS triangle).
 * Full-height negative margin overlay — Gmail ignores small negative offsets.
 */

const PLAY_SIZE_PX = 64;

/** White circle + dark triangle — centered on thumbnail per outreach spec. */
function emailPlayButtonDiv(): string {
  const line = PLAY_SIZE_PX;
  return `<div style="width:${line}px;height:${line}px;border-radius:50%;background-color:#ffffff;margin:0 auto;box-shadow:0 4px 24px rgba(0,0,0,0.35);text-align:center;line-height:${line}px;font-size:0;mso-line-height-rule:exactly;"><span style="display:inline-block;width:0;height:0;border-style:solid;border-width:10px 0 10px 18px;border-color:transparent transparent transparent #0a0a0a;margin-left:5px;vertical-align:middle;line-height:0;font-size:0;"></span></div>`;
}

export function emailThumbnailWithPlayOverlay(
  imageClickUrl: string,
  imageUrl: string,
  width: number,
  height: number,
): string {
  const playDiv = emailPlayButtonDiv();
  const overlayMarginTop = -height;

  // #region agent log
  fetch("http://127.0.0.1:7489/ingest/874f54e3-af15-42bb-a33a-e094f9419f9f", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "b8d92c",
    },
    body: JSON.stringify({
      sessionId: "b8d92c",
      runId: "play-overlay-fix",
      hypothesisId: "H2,H5",
      location: "lib/email-play-overlay.ts:emailThumbnailWithPlayOverlay",
      message: "email thumbnail overlay layout",
      data: {
        playSizePx: PLAY_SIZE_PX,
        overlayMarginTop,
        thumbHeight: height,
        layout: "single-td-full-height-overlay-no-avatar",
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${width}" align="center" style="margin:0 auto;border-collapse:collapse;"><tr><td align="center" style="padding:0;line-height:0;font-size:0;mso-line-height-rule:exactly;"><a href="${imageClickUrl}" target="_blank" style="text-decoration:none;display:inline-block;line-height:0;"><img src="${imageUrl}" alt="Watch your personalized video" width="${width}" height="${height}" border="0" style="display:block;width:${width}px;height:${height}px;border:0;outline:none;text-decoration:none;border-radius:12px;-ms-interpolation-mode:bicubic;" /><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${width}" style="margin-top:${overlayMarginTop}px;width:${width}px;border-collapse:collapse;"><tr><td align="center" valign="middle" height="${height}" style="height:${height}px;font-size:0;line-height:0;mso-line-height-rule:exactly;">${playDiv}</td></tr></table></a></td></tr></table>`;
}
