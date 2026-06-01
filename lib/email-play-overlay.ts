/**
 * Gmail/Outlook-safe thumbnail: must use <img src>, not CSS background-image.
 * (Gmail strips background-image on <td> → black box with only the play div visible.)
 */

export function emailThumbnailWithPlayOverlay(
  watchUrl: string,
  imageUrl: string,
  width: number,
  height: number,
): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${width}" align="center" style="margin:0 auto;border-collapse:collapse;"><tr><td align="center" style="padding:0;line-height:0;font-size:0;mso-line-height-rule:exactly;"><a href="${watchUrl}" target="_blank" style="text-decoration:none;display:inline-block;line-height:0;"><img src="${imageUrl}" alt="Watch your personalized video" width="${width}" height="${height}" border="0" style="display:block;width:${width}px;height:${height}px;border:0;outline:none;text-decoration:none;border-radius:12px;-ms-interpolation-mode:bicubic;" /></a></td></tr></table>`;
}
