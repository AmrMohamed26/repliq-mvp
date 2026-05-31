/**
 * Gmail-friendly thumbnail + circular play control (inline styles only).
 */

export function emailThumbnailWithPlayOverlay(
  watchUrl: string,
  imageUrl: string,
  width: number,
  height: number,
): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${width}" align="center" style="margin:0 auto;border-collapse:collapse;"><tr><td align="center" style="padding:0;line-height:0;font-size:0;mso-line-height-rule:exactly;"><a href="${watchUrl}" target="_blank" style="text-decoration:none;display:inline-block;line-height:0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${width}" height="${height}" style="width:${width}px;height:${height}px;border-collapse:collapse;border-radius:12px;overflow:hidden;"><tr><td align="center" valign="middle" width="${width}" height="${height}" background="${imageUrl}" style="background-image:url(${imageUrl});background-size:cover;background-position:center center;width:${width}px;height:${height}px;vertical-align:middle;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" height="100%"><tr><td align="center" valign="middle" style="vertical-align:middle;"><div style="width:64px;height:64px;border-radius:50%;background-color:#ffffff;margin:0 auto;box-shadow:0 4px 24px rgba(0,0,0,0.35);text-align:center;line-height:64px;"><span style="display:inline-block;width:0;height:0;border-style:solid;border-width:11px 0 11px 19px;border-color:transparent transparent transparent #0a0a0a;margin-left:6px;vertical-align:middle;line-height:0;font-size:0;"></span></div></td></tr></table></td></tr></table></a></td></tr></table>`;
}
