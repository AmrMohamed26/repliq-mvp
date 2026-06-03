/**
 * Email-safe HTML — single source for API, Copy Email clipboard, and CSV emailHtml.
 */

import type { LeadResult } from "@/types/lead";
import { watchPageUrl } from "@/lib/app-url";
import {
  isBrokenProxyThumbnailUrl,
  thumbnailUrlForEmail,
} from "@/lib/media-url";
import { emailThumbnailWithPlayOverlay } from "@/lib/email-play-overlay";
import {
  firstNameFromName,
  personalizedVideoIntroBody,
  VIDEO_NEAR_HINT,
} from "@/lib/personalized-message";

/** Display size in email HTML (source image is 720w). */
export const EMAIL_THUMB_WIDTH_PX = 360;
export const EMAIL_THUMB_HEIGHT_PX = 203;
export const EMAIL_BLOCK_MAX_WIDTH_PX = 440;

export interface EmailBodyParams {
  name: string;
  /** Watch landing page — /v/[leadId] on your deployed app. */
  watchUrl: string;
  thumbnailUrl?: string;
}

/** Minify for CSV cells so Excel/Sheets do not break tags across lines. */
export function minifyEmailHtml(html: string): string {
  return html.replace(/\s+/g, " ").replace(/>\s+</g, "><").trim();
}

export function getEmailHtmlForResult(
  result: LeadResult,
  forCsv = false,
  requestOrigin?: string,
): string {
  if (result.status !== "done") return "";

  const watchUrl =
    result.shortUrl && !result.shortUrl.includes(".mp4")
      ? result.shortUrl
      : watchPageUrl({ id: result.id, slug: result.slug }, requestOrigin);

  const rawThumb =
    result.thumbnailUrl?.startsWith("https://") &&
    !isBrokenProxyThumbnailUrl(result.thumbnailUrl)
      ? result.thumbnailUrl
      : undefined;
  const thumbnailUrl = thumbnailUrlForEmail(
    result.id,
    rawThumb,
    requestOrigin,
  );

  const html = buildEmailBody({
    name: result.name,
    watchUrl,
    thumbnailUrl,
  });
  return forCsv ? minifyEmailHtml(html) : html;
}

export function buildEmailBody({
  name,
  watchUrl,
  thumbnailUrl,
}: EmailBodyParams): string {
  const firstName = firstNameFromName(name);
  const introBody = personalizedVideoIntroBody();
  const w = EMAIL_THUMB_WIDTH_PX;
  const h = EMAIL_THUMB_HEIGHT_PX;
  const blockW = EMAIL_BLOCK_MAX_WIDTH_PX;

  const mediaSection = thumbnailUrl
    ? emailThumbnailWithPlayOverlay(watchUrl, thumbnailUrl, w, h)
    : `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${w}" align="center" style="margin:0 auto;border-collapse:collapse;"><tr><td align="center" style="padding:8px 0;"><a href="${watchUrl}" target="_blank" style="display:inline-block;background-color:#ffffff;color:#000000;padding:12px 28px;border-radius:100px;text-decoration:none;font-size:14px;font-weight:700;">Watch your video</a></td></tr></table>`;

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${blockW}" align="center" style="max-width:${blockW}px;width:100%;margin:0 auto;background-color:#0a0a0a;border-radius:14px;border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;"><tr><td align="center" style="padding:16px 16px 8px 16px;"><p style="margin:0;font-size:17px;font-weight:700;color:#ffffff;line-height:1.3;text-align:center;">Hi ${firstName},</p></td></tr><tr><td align="center" style="padding:0 16px 10px 16px;"><p style="margin:0;font-size:13px;line-height:1.55;color:#b3b3b3;text-align:center;">${introBody}</p></td></tr><tr><td align="center" style="padding:0 16px 8px 16px;"><p style="margin:0;font-size:11px;line-height:1.4;color:#737373;text-align:center;">${VIDEO_NEAR_HINT}</p></td></tr><tr><td align="center" style="padding:0 12px 16px 12px;background-color:#000000;border-radius:0 0 14px 14px;">${mediaSection}</td></tr></table>`;
}
