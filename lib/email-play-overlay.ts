/**
 * Gmail-safe thumbnail: <img src> + centered play overlay.
 * Uses max-height:0 stacking (Gmail ignores negative margin on overlay tables).
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

  const playOverlay = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${width}" align="center" style="max-height:0;overflow:visible;opacity:0.999;width:${width}px;border-collapse:collapse;"><tr><td align="center" valign="middle" width="${width}" height="${height}" style="height:${height}px;font-size:0;line-height:0;mso-line-height-rule:exactly;">${playDiv}</td></tr></table>`;

  const thumbImg = `<img src="${imageUrl}" alt="Watch your personalized video" width="${width}" height="${height}" border="0" style="display:block;width:${width}px;height:${height}px;border:0;outline:none;text-decoration:none;border-radius:12px;-ms-interpolation-mode:bicubic;" />`;

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${width}" align="center" style="margin:0 auto;border-collapse:collapse;"><tr><td align="center" style="padding:0;line-height:0;font-size:0;mso-line-height-rule:exactly;"><a href="${watchUrl}" target="_blank" style="text-decoration:none;display:inline-block;line-height:0;">${playOverlay}${thumbImg}</a></td></tr></table>`;
}
