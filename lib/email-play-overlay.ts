/**
 * Gmail-safe email thumbnail: <img src> + stacked table overlays (play + avatar).
 * Avoids background-image on <td> (Gmail strips it).
 */

const PLAY_SIZE_PX = 72;
const AVATAR_SIZE_PX = 64;
const THUMB_BORDER_RADIUS_PX = 16;

/** Dark translucent circle, white ring, white triangle — matches outreach mockup. */
function emailPlayButtonDiv(): string {
  const line = PLAY_SIZE_PX;
  return `<div style="width:${line}px;height:${line}px;border-radius:50%;background-color:rgba(0,0,0,0.55);border:2px solid #ffffff;margin:0 auto;box-shadow:0 8px 32px rgba(0,0,0,0.45);text-align:center;line-height:${line - 4}px;font-size:0;mso-line-height-rule:exactly;"><span style="display:inline-block;width:0;height:0;border-style:solid;border-width:12px 0 12px 20px;border-color:transparent transparent transparent #ffffff;margin-left:6px;vertical-align:middle;line-height:0;font-size:0;"></span></div>`;
}

function emailAvatarImg(avatarUrl: string): string {
  const s = AVATAR_SIZE_PX;
  return `<img src="${avatarUrl}" alt="" width="${s}" height="${s}" border="0" style="display:block;width:${s}px;height:${s}px;border-radius:50%;border:2px solid #ffffff;box-shadow:0 6px 24px rgba(0,0,0,0.4);-ms-interpolation-mode:bicubic;" />`;
}

export function emailThumbnailWithPlayOverlay(
  imageClickUrl: string,
  imageUrl: string,
  width: number,
  height: number,
  avatarUrl?: string,
): string {
  const playDiv = emailPlayButtonDiv();
  const overlayMarginTop = -height;
  const avatarBand = avatarUrl ? AVATAR_SIZE_PX + 12 : 0;
  const avatarBlock = avatarUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${width}" style="margin-top:${-avatarBand}px;width:${width}px;border-collapse:collapse;"><tr><td align="left" valign="bottom" height="${avatarBand}" style="height:${avatarBand}px;padding:0 0 4px 6px;font-size:0;line-height:0;mso-line-height-rule:exactly;">${emailAvatarImg(avatarUrl)}</td></tr></table>`
    : "";

  // #region agent log
  fetch("http://127.0.0.1:7489/ingest/874f54e3-af15-42bb-a33a-e094f9419f9f", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "b8d92c",
    },
    body: JSON.stringify({
      sessionId: "b8d92c",
      runId: "play-overlay-mockup",
      hypothesisId: "H1,H2,H3",
      location: "lib/email-play-overlay.ts:emailThumbnailWithPlayOverlay",
      message: "email thumbnail overlay built",
      data: {
        playSizePx: PLAY_SIZE_PX,
        avatarSizePx: AVATAR_SIZE_PX,
        hasAvatar: Boolean(avatarUrl),
        overlayMarginTop,
        thumbHeight: height,
        thumbWidth: width,
        playStyle: "dark-circle-white-border",
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${width}" align="center" style="margin:0 auto;border-collapse:collapse;"><tr><td align="center" style="padding:0;line-height:0;font-size:0;mso-line-height-rule:exactly;"><a href="${imageClickUrl}" target="_blank" style="text-decoration:none;display:inline-block;line-height:0;"><img src="${imageUrl}" alt="Watch your personalized video" width="${width}" height="${height}" border="0" style="display:block;width:${width}px;height:${height}px;border:0;outline:none;text-decoration:none;border-radius:${THUMB_BORDER_RADIUS_PX}px;-ms-interpolation-mode:bicubic;" /><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${width}" style="margin-top:${overlayMarginTop}px;width:${width}px;border-collapse:collapse;"><tr><td align="center" valign="middle" height="${height}" style="height:${height}px;font-size:0;line-height:0;mso-line-height-rule:exactly;">${playDiv}</td></tr></table>${avatarBlock}</a></td></tr></table>`;
}
