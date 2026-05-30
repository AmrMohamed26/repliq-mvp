import { writeFile, unlink } from "node:fs/promises";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import { getPngDimensions } from "@/lib/png-dimensions";
import { getCookiesForUrl } from "@/lib/site-cookies";
import {
  cropScreenshotToViewport,
  logScreenshotDebug,
} from "./screenshot-crop";
import { SCREENSHOT_VIEWPORT } from "./screenshot-viewport";
import {
  UPWORK_SCRAPINGBEE_TIMEOUT_MS,
  isUpworkUrl,
} from "./upwork-screenshot";

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

/** ScrapingBee often returns JPEG; normalize to PNG for crop + Remotion. */
async function writeScreenshotBuffer(outPath: string, buf: Buffer): Promise<void> {
  if (isImageBuffer(buf) && buf[0] === 0xff) {
    const jpgPath = `${outPath}.jpg`;
    await writeFile(jpgPath, buf);
    await new Promise<void>((resolve, reject) => {
      ffmpeg(jpgPath)
        .outputOptions(["-frames:v", "1"])
        .output(outPath)
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .run();
    });
    await unlink(jpgPath).catch(() => undefined);
    return;
  }
  await writeFile(outPath, buf);
}

export type ScreenshotLog = {
  info: (obj: object, msg: string) => void;
  warn: (obj: object, msg: string) => void;
  error: (obj: object, msg: string) => void;
};

export type PaidScreenshotProvider = "scrapingbee" | "zenrows";

const PAID_FETCH_TIMEOUT_MS = 90_000;

function scrapingBeeTimeoutMs(url: string): number {
  return isUpworkUrl(url) ? UPWORK_SCRAPINGBEE_TIMEOUT_MS : PAID_FETCH_TIMEOUT_MS;
}

/** Hosts that should use paid screenshot APIs when keys are configured. */
const HARD_SCREENSHOT_SUFFIXES = ["upwork.com", "linkedin.com"];

export function isHardScreenshotHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return HARD_SCREENSHOT_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    );
  } catch {
    return false;
  }
}

export function getPaidScreenshotProviderOrder(): PaidScreenshotProvider[] {
  const pref = process.env.SCREENSHOT_PROVIDER?.trim().toLowerCase();
  const hasBee = Boolean(process.env.SCRAPINGBEE_API_KEY?.trim());
  const hasZen = Boolean(process.env.ZENROWS_API_KEY?.trim());

  if (pref === "scrapingbee") {
    return hasBee ? ["scrapingbee", ...(hasZen ? ["zenrows" as const] : [])] : hasZen ? ["zenrows"] : [];
  }
  if (pref === "zenrows") {
    return hasZen ? ["zenrows", ...(hasBee ? ["scrapingbee" as const] : [])] : hasBee ? ["scrapingbee"] : [];
  }

  // auto: ScrapingBee first (default), then ZenRows if configured
  const order: PaidScreenshotProvider[] = [];
  if (hasBee) order.push("scrapingbee");
  if (hasZen) order.push("zenrows");
  return order;
}

export function hasPaidScreenshotProvider(): boolean {
  return getPaidScreenshotProviderOrder().length > 0;
}

function isImageBuffer(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  if (buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") return true;
  if (buf[0] === 0xff && buf[1] === 0xd8) return true;
  return false;
}

async function assertImageResponse(
  res: Response,
  provider: string,
): Promise<Buffer> {
  const contentType = res.headers.get("content-type") ?? "";
  const buf = Buffer.from(await res.arrayBuffer());

  if (isImageBuffer(buf)) {
    if (buf.length < 1_000) {
      throw new Error(
        `${provider} returned suspiciously small image (${buf.length} bytes)`,
      );
    }
    return buf;
  }

  if (!res.ok) {
    const snippet = buf.toString("utf8", 0, 300);
    throw new Error(`${provider} HTTP ${res.status}: ${snippet}`);
  }

  if (!contentType.includes("image")) {
    const snippet = buf.toString("utf8", 0, 200);
    throw new Error(
      `${provider} returned non-image (${contentType}): ${snippet}`,
    );
  }
  if (buf.length < 1_000) {
    throw new Error(`${provider} returned suspiciously small image (${buf.length} bytes)`);
  }
  return buf;
}

/** @internal Used by scripts/test-screenshot-providers.ts */
export async function fetchScreenshotScrapingBee(
  url: string,
  outPath: string,
): Promise<void> {
  return captureScrapingBee(url, outPath);
}

/** @internal Used by scripts/test-screenshot-providers.ts */
export async function fetchScreenshotZenRows(
  url: string,
  outPath: string,
): Promise<void> {
  return captureZenRows(url, outPath);
}

async function requestScrapingBeeScreenshot(
  url: string,
  opts: { premiumProxy: boolean; stealthProxy: boolean },
  cookieHeader?: string,
): Promise<Buffer> {
  const apiKey = process.env.SCRAPINGBEE_API_KEY?.trim();
  if (!apiKey) throw new Error("SCRAPINGBEE_API_KEY not set");

  const upwork = isUpworkUrl(url);
  const params = new URLSearchParams({
    api_key: apiKey,
    url,
    screenshot: "true",
    screenshot_full_page: "false",
    render_js: "true",
    wait: upwork ? "8000" : opts.stealthProxy ? "7000" : "5000",
    window_width: String(SCREENSHOT_VIEWPORT.width),
    window_height: String(SCREENSHOT_VIEWPORT.height),
    block_resources: "false",
  });

  if (upwork) {
    params.set("wait_for", '[data-test="JobDetails"], main');
  }

  if (opts.stealthProxy) {
    params.set("stealth_proxy", "true");
  } else if (opts.premiumProxy) {
    params.set("premium_proxy", "true");
  }

  if (cookieHeader) {
    params.set("cookies", cookieHeader);
  }

  const res = await fetch(`https://app.scrapingbee.com/api/v1/?${params}`, {
    signal: AbortSignal.timeout(scrapingBeeTimeoutMs(url)),
  });
  return assertImageResponse(res, "ScrapingBee");
}

async function captureScrapingBee(
  url: string,
  outPath: string,
  opts?: { cookieHeader?: string | null },
): Promise<void> {
  const siteCookies = await getCookiesForUrl(url);
  const cookieHeader =
    opts?.cookieHeader !== undefined
      ? opts.cookieHeader ?? undefined
      : siteCookies?.scrapingBeeHeader;

  const hard = isHardScreenshotHost(url);
  const upwork = isUpworkUrl(url);
  // Upwork: stealth proxy works for public jobs; premium+cookies often redirect-loops.
  const tiers: Array<{ premiumProxy: boolean; stealthProxy: boolean }> = hard
    ? upwork
      ? [{ premiumProxy: false, stealthProxy: true }]
      : [
          { premiumProxy: true, stealthProxy: false },
          { premiumProxy: false, stealthProxy: true },
        ]
    : [{ premiumProxy: true, stealthProxy: false }];

  let lastErr: unknown;
  for (const tier of tiers) {
    try {
      const buf = await requestScrapingBeeScreenshot(url, tier, cookieHeader);
      const before = getPngDimensions(buf);
      logScreenshotDebug(
        "screenshot-providers.ts:captureScrapingBee",
        "scrapingbee raw image",
        {
          url,
          tier,
          hasCookies: Boolean(cookieHeader),
          ...before,
        },
        "A",
      );
      await writeScreenshotBuffer(outPath, buf);
      const crop = await cropScreenshotToViewport(outPath);
      logScreenshotDebug(
        "screenshot-providers.ts:captureScrapingBee",
        "after viewport crop",
        { url, ...crop, before },
        "A",
      );
      return;
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function captureZenRows(url: string, outPath: string): Promise<void> {
  const apiKey = process.env.ZENROWS_API_KEY?.trim();
  if (!apiKey) throw new Error("ZENROWS_API_KEY not set");

  const params = new URLSearchParams({
    apikey: apiKey,
    url,
    js_render: "true",
    premium_proxy: "true",
    screenshot: "true",
    wait: "5000",
    screenshot_full_page: "false",
    window_width: String(SCREENSHOT_VIEWPORT.width),
    window_height: String(SCREENSHOT_VIEWPORT.height),
  });

  const res = await fetch(`https://api.zenrows.com/v1/?${params}`, {
    signal: AbortSignal.timeout(PAID_FETCH_TIMEOUT_MS),
  });
  const buf = await assertImageResponse(res, "ZenRows");
  await writeFile(outPath, buf);
}

/**
 * Tries configured paid providers in order. Returns provider name on success.
 */
export async function captureScreenshotViaPaidProviders(
  url: string,
  outPath: string,
  log: ScreenshotLog,
  opts?: { cookieHeader?: string | null },
): Promise<PaidScreenshotProvider | null> {
  const order = getPaidScreenshotProviderOrder();
  if (order.length === 0) return null;

  for (const provider of order) {
    try {
      if (provider === "scrapingbee") {
        await captureScrapingBee(url, outPath, opts);
      } else {
        await captureZenRows(url, outPath);
      }
      log.info({ url, provider, status: "done" }, "screenshot via paid provider");
      return provider;
    } catch (err) {
      log.warn(
        { url, provider, err, status: "failed" },
        "paid screenshot provider failed",
      );
    }
  }

  return null;
}
