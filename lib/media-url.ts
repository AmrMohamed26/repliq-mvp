import { emailThumbnailProxyUrl } from "@/lib/app-url";

/** Legacy proxy paths that 404 outside the Next app — never use in email or UI. */
export function isBrokenProxyThumbnailUrl(url: string): boolean {
  return url.includes("/api/media/thumb");
}

/** True when share URL is an old marketing /v/ link or raw storage file used as share link. */
export function isLegacyShareUrl(url: string): boolean {
  if (url.includes(".mp4")) return true;
  if (url.includes("/storage/v1/object/public/")) return true;
  if (url.includes("/v/") && !url.includes("supabase.co")) {
    try {
      const host = new URL(url).hostname.toLowerCase();
      if (
        host === "amroo.space" ||
        host === "www.amroo.space" ||
        host.endsWith(".vercel.app")
      ) {
        return false;
      }
      if (host !== "localhost" && !host.includes("127.0.0.1")) return true;
    } catch {
      return true;
    }
  }
  return false;
}

/**
 * Thumbnail src for email HTML.
 * Prefers /api/media/thumb on a public app host; falls back to Supabase JPEG.
 */
export function thumbnailUrlForEmail(
  leadId: string,
  supabaseUrl: string | undefined,
  requestOrigin?: string,
): string | undefined {
  const proxy = emailThumbnailProxyUrl(leadId, requestOrigin);
  if (proxy) return proxy;

  if (
    supabaseUrl?.startsWith("https://") &&
    !isBrokenProxyThumbnailUrl(supabaseUrl)
  ) {
    return supabaseUrl;
  }
  return undefined;
}

/** UI thumbnail src; rejects legacy /api/media/thumb proxy URLs on wrong host. */
export function resolveThumbnailUrlForDisplay(
  _leadId: string,
  stored?: string,
): string | undefined {
  if (!stored?.startsWith("https://")) return undefined;
  if (isBrokenProxyThumbnailUrl(stored)) return undefined;
  return stored;
}
