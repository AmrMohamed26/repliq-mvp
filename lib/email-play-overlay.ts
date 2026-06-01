/**
 * Gmail/Outlook-safe thumbnail: <img src> + table-based play badge (no CSS border hacks).
 */

/** Vertical offset to center play badge on thumbnail (203px tall, 64px badge). */
const PLAY_BADGE_OFFSET_PX = -134;

export function emailThumbnailWithPlayOverlay(
  imageClickUrl: string,
  imageUrl: string,
  width: number,
  height: number,
): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${width}" align="center" style="margin:0 auto;border-collapse:collapse;"><tr><td align="center" style="padding:0;line-height:0;font-size:0;mso-line-height-rule:exactly;"><a href="${imageClickUrl}" target="_blank" style="text-decoration:none;display:inline-block;line-height:0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${width}" style="border-collapse:collapse;"><tr><td width="${width}" style="padding:0;font-size:0;line-height:0;"><img src="${imageUrl}" alt="Watch your personalized video" width="${width}" height="${height}" border="0" style="display:block;width:${width}px;height:${height}px;border:0;outline:none;text-decoration:none;border-radius:12px;-ms-interpolation-mode:bicubic;" /></td></tr><tr><td align="center" width="${width}" style="padding:0;font-size:0;line-height:0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin-top:${PLAY_BADGE_OFFSET_PX}px;border-collapse:collapse;"><tr><td align="center" valign="middle" width="64" height="64" bgcolor="#ffffff" style="background-color:#ffffff;border-radius:50px;width:64px;height:64px;box-shadow:0 4px 24px rgba(0,0,0,0.35);font-family:Arial,Helvetica,sans-serif;font-size:0;line-height:0;mso-line-height-rule:exactly;"><!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" arcsize="50%" fillcolor="#ffffff" stroke="f" style="width:64px;height:64px;"><v:textbox inset="0,0,0,0"><center style="font-family:Arial,sans-serif;font-size:26px;color:#0a0a0a;">&#9654;</center></v:textbox></v:roundrect><![endif]--><!--[if !mso]><!--><span style="display:inline-block;width:64px;height:64px;line-height:64px;font-size:26px;font-weight:bold;color:#0a0a0a;text-align:center;">&#9654;</span><!--<![endif]--></td></tr></table></td></tr></table></a></td></tr></table>`;
}
