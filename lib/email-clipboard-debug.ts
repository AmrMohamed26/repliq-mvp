/**
 * Temporary diagnostics for email HTML → clipboard chain.
 * Mirrors wrap logic in copy-email-clipboard.ts without importing it (no behavior change).
 */

export interface ClipboardStagePayload {
  /** Exact body from GET /api/email/{leadId} */
  apiEmailHtml: string;
  /** Same as copyRichEmailHtml: html.trim() before wrap */
  fragmentBeforeWrap: string;
  /** Full string placed in text/html Blob (ClipboardItem) */
  clipboardWriteHtml: string;
  /** Alias — identical to clipboardWriteHtml */
  clipboardWrapperHtml: string;
  plainText: string;
}

export interface HtmlValidation {
  containsImg: boolean;
  containsBackgroundImage: boolean;
  imageUrl: string | null;
  imageUrlHost: string | null;
  imageUrlProtocol: string | null;
  imageUrlStatus: number | null;
  imageUrlStatusError: string | null;
}

export type ImageSrcKind = "https" | "http" | "cid" | "data" | "relative" | "other";

export interface ImgTagInfo {
  index: number;
  src: string;
  kind: ImageSrcKind;
  host: string | null;
  protocol: string | null;
  widthAttr: string | null;
  heightAttr: string | null;
}

export interface GmailCompatibilityReport {
  score: number; // 0..100
  reasons: string[];
  imgCount: number;
  images: ImgTagInfo[];
  hasScriptTag: boolean;
  hasStyleTag: boolean;
  hasVideoTag: boolean;
  hasFormTag: boolean;
  hasOnEventHandlers: boolean;
  hasBackgroundImageCss: boolean;
  hasDataUris: boolean;
  hasCidUris: boolean;
  hasNonHttpsImages: boolean;
  hasRelativeImages: boolean;
}

export function stripHtmlToPlainForDebug(html: string): string {
  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const text = doc.body.textContent?.replace(/\s+/g, " ").trim();
    if (text) return text;
  }
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/** Same wrapper as copy-email-clipboard wrapClipboardHtml */
export function wrapClipboardHtmlForDebug(fragment: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><!--StartFragment-->${fragment}<!--EndFragment--></body></html>`;
}

export function buildClipboardStagePayload(apiEmailHtml: string): ClipboardStagePayload {
  const fragmentBeforeWrap = apiEmailHtml.trim();
  const clipboardWrapperHtml = wrapClipboardHtmlForDebug(fragmentBeforeWrap);
  const plainText =
    stripHtmlToPlainForDebug(fragmentBeforeWrap) || "Watch your personalized video";

  return {
    apiEmailHtml,
    fragmentBeforeWrap,
    clipboardWriteHtml: clipboardWrapperHtml,
    clipboardWrapperHtml,
    plainText,
  };
}

export function analyzeEmailHtml(html: string): Omit<
  HtmlValidation,
  "imageUrlStatus" | "imageUrlStatusError"
> {
  const containsImg = /<img\s/i.test(html);
  const containsBackgroundImage = /background-image:url\(/i.test(html);
  const imageUrl =
    html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] ?? null;

  let imageUrlHost: string | null = null;
  let imageUrlProtocol: string | null = null;
  if (imageUrl) {
    try {
      const u = new URL(imageUrl);
      imageUrlHost = u.host;
      imageUrlProtocol = u.protocol;
    } catch {
      imageUrlHost = "(invalid URL)";
    }
  }

  return {
    containsImg,
    containsBackgroundImage,
    imageUrl,
    imageUrlHost,
    imageUrlProtocol,
  };
}

function classifyImageSrc(src: string): ImageSrcKind {
  const s = src.trim();
  if (s.startsWith("https://")) return "https";
  if (s.startsWith("http://")) return "http";
  if (s.startsWith("cid:")) return "cid";
  if (s.startsWith("data:")) return "data";
  if (s.startsWith("/")) return "relative";
  if (s.startsWith("//")) return "relative";
  return "other";
}

function safeUrlParts(src: string): { host: string | null; protocol: string | null } {
  try {
    const u = new URL(src);
    return { host: u.host, protocol: u.protocol };
  } catch {
    return { host: null, protocol: null };
  }
}

/** Parse all <img> tags in a fragment (client-side only). */
export function extractImgTagsFromHtml(html: string): ImgTagInfo[] {
  if (typeof DOMParser === "undefined") return [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  const imgs = Array.from(doc.querySelectorAll("img"));
  return imgs.map((img, i) => {
    const src = img.getAttribute("src") ?? "";
    const kind = classifyImageSrc(src);
    const { host, protocol } =
      kind === "https" || kind === "http" ? safeUrlParts(src) : { host: null, protocol: null };
    return {
      index: i,
      src,
      kind,
      host,
      protocol,
      widthAttr: img.getAttribute("width"),
      heightAttr: img.getAttribute("height"),
    };
  });
}

/** Gmail-focused compatibility heuristic for clipboard-paste HTML. */
export function scoreGmailCompatibility(fragmentHtml: string): GmailCompatibilityReport {
  const html = fragmentHtml ?? "";
  const lower = html.toLowerCase();

  const images = extractImgTagsFromHtml(html);
  const imgCount = images.length;

  const hasScriptTag = /<script[\s>]/i.test(html);
  const hasStyleTag = /<style[\s>]/i.test(html);
  const hasVideoTag = /<video[\s>]/i.test(html);
  const hasFormTag = /<(form|input|textarea|button|select)[\s>]/i.test(html);
  const hasOnEventHandlers = /\son\w+\s*=\s*["']/i.test(html);
  const hasBackgroundImageCss = /background-image\s*:\s*url\(/i.test(html);

  const hasDataUris = images.some((i) => i.kind === "data");
  const hasCidUris = images.some((i) => i.kind === "cid");
  const hasNonHttpsImages = images.some((i) => i.kind === "http" || i.kind === "other");
  const hasRelativeImages = images.some((i) => i.kind === "relative");

  const reasons: string[] = [];
  let score = 100;

  if (imgCount === 0) {
    score -= 45;
    reasons.push("No <img> tags found (Gmail will show text only).");
  } else {
    score += 0;
  }

  if (hasScriptTag) {
    score -= 60;
    reasons.push("<script> present (Gmail strips scripts).");
  }
  if (hasOnEventHandlers) {
    score -= 30;
    reasons.push("Inline event handlers present (Gmail strips/neutralizes).");
  }
  if (hasStyleTag) {
    score -= 15;
    reasons.push("<style> tag present (paste sanitization risk).");
  }
  if (hasFormTag) {
    score -= 15;
    reasons.push("Form/input elements present (often stripped/ignored).");
  }
  if (hasVideoTag) {
    score -= 25;
    reasons.push("<video> present (not reliably supported in email).");
  }
  if (hasBackgroundImageCss) {
    score -= 30;
    reasons.push("CSS background-image present (Gmail often strips).");
  }

  if (hasDataUris) {
    score -= 40;
    reasons.push("data: image URIs present (often stripped in sent mail).");
  }
  if (hasCidUris) {
    score -= 30;
    reasons.push("cid: image URIs present (not produced by clipboard paste; may not resolve).");
  }
  if (hasRelativeImages) {
    score -= 35;
    reasons.push("Relative image URLs present (must be absolute HTTPS).");
  }
  if (hasNonHttpsImages) {
    score -= 35;
    reasons.push("Non-HTTPS or unparseable image URLs present (Gmail may block).");
  }

  // Bonus: all images are https.
  const allHttps =
    imgCount > 0 && images.every((i) => i.kind === "https" && i.protocol === "https:");
  if (allHttps) {
    reasons.push("All images are external HTTPS (best-case for Gmail).");
  }

  // Clamp
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    reasons,
    imgCount,
    images,
    hasScriptTag,
    hasStyleTag,
    hasVideoTag,
    hasFormTag,
    hasOnEventHandlers,
    hasBackgroundImageCss,
    hasDataUris,
    hasCidUris,
    hasNonHttpsImages,
    hasRelativeImages,
  };
}

export async function probeImageUrl(url: string): Promise<{
  status: number | null;
  error: string | null;
}> {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    return { status: res.status, error: res.ok ? null : res.statusText };
  } catch (err) {
    return {
      status: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function buildDebugReportText(input: {
  leadId: string;
  thumbnailUrl: string | null;
  shortUrl: string | null;
  videoUrl: string | null;
  storedThumbnailUrl: string | null;
  stages: ClipboardStagePayload;
  validation: HtmlValidation;
  copyTestMode: string | null;
  copyTestError: string | null;
  apiEqualsFragmentTrimmed: boolean;
  fragmentEmbeddedInWrapper: boolean;
}): string {
  const lines = [
    "=== Repliq Email Clipboard Debug Report ===",
    `generatedAt: ${new Date().toISOString()}`,
    "",
    "--- Lead ---",
    `leadId: ${input.leadId}`,
    `thumbnailUrl (email): ${input.thumbnailUrl ?? "(none)"}`,
    `shortUrl (watch): ${input.shortUrl ?? "(none)"}`,
    `videoUrl: ${input.videoUrl ?? "(none)"}`,
    `storedThumbnailUrl (Supabase): ${input.storedThumbnailUrl ?? "(none)"}`,
    "",
    "--- Validation ---",
    `contains <img>: ${input.validation.containsImg}`,
    `contains background-image: ${input.validation.containsBackgroundImage}`,
    `image URL: ${input.validation.imageUrl ?? "(none)"}`,
    `image URL host: ${input.validation.imageUrlHost ?? "(none)"}`,
    `image URL protocol: ${input.validation.imageUrlProtocol ?? "(none)"}`,
    `image URL HTTP status: ${input.validation.imageUrlStatus ?? "(not probed)"}`,
    input.validation.imageUrlStatusError
      ? `image URL probe error: ${input.validation.imageUrlStatusError}`
      : "",
    "",
    "--- Clipboard chain identity ---",
    `apiHtml === trim(apiHtml) fragment: ${input.apiEqualsFragmentTrimmed}`,
    `fragment embedded in wrapper (StartFragment): ${input.fragmentEmbeddedInWrapper}`,
    `copy test mode: ${input.copyTestMode ?? "(not run)"}`,
    input.copyTestError ? `copy test error: ${input.copyTestError}` : "",
    "",
    "--- GET /api/email/{leadId} (exact) ---",
    input.stages.apiEmailHtml,
    "",
    "--- Fragment before clipboard wrap (copyRichEmailHtml input) ---",
    input.stages.fragmentBeforeWrap,
    "",
    "--- navigator.clipboard.write() text/html Blob content ---",
    input.stages.clipboardWriteHtml,
    "",
    "=== end report ===",
  ];
  return lines.filter((l) => l !== undefined).join("\n");
}
