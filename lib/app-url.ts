function isLocalHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".local")
  );
}

export function isLocalOrigin(url: string): boolean {
  try {
    return isLocalHostname(new URL(url).hostname);
  } catch {
    return true;
  }
}

/** HTTPS origin that Gmail and recipients can reach (not localhost). */
export function getPublicAppBaseUrl(requestOrigin?: string): string | undefined {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv && !isLocalOrigin(fromEnv)) {
    return fromEnv.replace(/\/$/, "");
  }
  if (requestOrigin && !isLocalOrigin(requestOrigin)) {
    return requestOrigin.replace(/\/$/, "");
  }
  return undefined;
}

/**
 * App origin for share links and UI (may be localhost during local dev).
 */
export function getAppBaseUrl(requestOrigin?: string): string {
  const pub = getPublicAppBaseUrl(requestOrigin);
  if (pub) return pub;
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (requestOrigin) {
    const normalized = requestOrigin.startsWith("http")
      ? requestOrigin
      : `http://${requestOrigin}`;
    return normalized.replace(/\/$/, "");
  }
  return "http://localhost:3000";
}

/** Personalized watch page — /v/[leadId] with video player + Book a Call. */
export function watchPageUrl(leadId: string, requestOrigin?: string): string {
  return `${getAppBaseUrl(requestOrigin)}/v/${leadId}`;
}

/**
 * Thumbnail URL for <img> in outbound email.
 * Uses our proxy on a public app host (Gmail-friendly headers, no Supabase x-robots-tag).
 */
export function emailThumbnailProxyUrl(
  leadId: string,
  requestOrigin?: string,
): string | undefined {
  const pub = getPublicAppBaseUrl(requestOrigin);
  if (!pub) return undefined;
  return `${pub}/api/media/thumb/${leadId}`;
}

export function requestOriginFromNextRequest(req: {
  headers: Headers;
  nextUrl: { origin: string; protocol: string };
}): string {
  const host =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) return req.nextUrl.origin;
  const proto =
    req.headers.get("x-forwarded-proto") ??
    (isLocalHostname(host.split(":")[0] ?? host) ? "http" : "https");
  return `${proto}://${host}`;
}

export function emailCopyPageUrl(leadId: string, requestOrigin?: string): string {
  return `${getAppBaseUrl(requestOrigin)}/email-copy/${leadId}`;
}
