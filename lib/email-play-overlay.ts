/**
 * Gmail-safe thumbnail: faux-absolute play overlay, then <img src>.
 * @see https://www.goodemailcode.com/email-enhancements/faux-absolute-position.html
 */

const PLAY_SIZE_PX = 64;

/** White circle + CSS triangle — centered on thumbnail. */
function emailPlayButtonDiv(): string {
  const line = PLAY_SIZE_PX;
  return `<div style="width:${line}px;height:${line}px;border-radius:50%;background-color:#ffffff;margin:0 auto;box-shadow:0 4px 24px rgba(0,0,0,0.35);text-align:center;line-height:${line}px;font-size:0;mso-line-height-rule:exactly;"><span style="display:inline-block;width:0;height:0;border-style:solid;border-width:11px 0 11px 19px;border-color:transparent transparent transparent #0a0a0a;margin-left:6px;vertical-align:middle;line-height:0;font-size:0;"></span></div>`;
}

export function emailThumbnailWithPlayOverlay(
  watchUrl: string,
  imageUrl: string,
  width: number,
  height: number,
): string {
  const playDiv = emailPlayButtonDiv();

  // Overlay FIRST, image SECOND — play centered via valign (no padding-top; that added layout height).
  const playOverlay = `<div style="max-height:0;max-width:${width}px;overflow:visible;opacity:0.999;position:relative;"><div style="max-width:${width}px;position:relative;opacity:0.999;margin:0 auto;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${width}" align="center" style="border-collapse:collapse;"><tr><td align="center" valign="middle" width="${width}" height="${height}" style="height:${height}px;font-size:0;line-height:0;mso-line-height-rule:exactly;">${playDiv}</td></tr></table></div></div>`;

  const thumbImg = `<img src="${imageUrl}" alt="Watch your personalized video" width="${width}" height="${height}" border="0" style="display:block;width:${width}px;height:${height}px;border:0;outline:none;text-decoration:none;border-radius:12px;-ms-interpolation-mode:bicubic;" />`;

  const html = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${width}" align="center" style="margin:0 auto;border-collapse:collapse;"><tr><td align="center" style="padding:0;line-height:0;font-size:0;mso-line-height-rule:exactly;"><a href="${watchUrl}" target="_blank" style="text-decoration:none;display:inline-block;line-height:0;">${playOverlay}${thumbImg}</a></td></tr></table>`;

  const imgIdx = html.indexOf("<img");
  const overlayIdx = html.indexOf("max-height:0");

  // #region agent log
  fetch("http://127.0.0.1:7489/ingest/874f54e3-af15-42bb-a33a-e094f9419f9f", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "b8d92c",
    },
    body: JSON.stringify({
      sessionId: "b8d92c",
      runId: "play-overlay-v5",
      hypothesisId: "H1,H2,H3",
      location: "lib/email-play-overlay.ts:emailThumbnailWithPlayOverlay",
      message: "email thumbnail overlay built",
      data: {
        order: "overlay-then-img",
        overlayBeforeImg: overlayIdx >= 0 && imgIdx >= 0 && overlayIdx < imgIdx,
        hasPaddingTop: html.includes("padding-top") || /padding:\d+px 0 0 0/.test(html),
        overlayTdHasFixedHeight: true,
        playSizePx: PLAY_SIZE_PX,
        thumbW: width,
        thumbH: height,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  return html;
}
