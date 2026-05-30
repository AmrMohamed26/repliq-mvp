import type { Page } from "playwright";
import { readFile } from "node:fs/promises";
import { getPngDimensions } from "@/lib/png-dimensions";
import { logScreenshotDebug } from "./screenshot-crop";

export function isUpworkUrl(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase().includes("upwork.com");
  } catch {
    return false;
  }
}

/** ScrapingBee needs more time on Upwork (Cloudflare + JS render). */
/** Enough for ScrapingBee stealth on public jobs; avoids 3min worker slot hogging. */
export const UPWORK_SCRAPINGBEE_TIMEOUT_MS = 120_000;

const CF_TITLE = /just a moment|challenge - upwork/i;

function isJpegBuffer(buf: Buffer): boolean {
  return buf.length > 2 && buf[0] === 0xff && buf[1] === 0xd8;
}

/** Reject empty, tiny, or non-image captures before rendering the video. */
export async function isUpworkScreenshotAcceptable(
  filePath: string,
): Promise<boolean> {
  const buf = await readFile(filePath);
  if (buf.length < 40_000) return false;

  const png = getPngDimensions(buf);
  if (png && png.width >= 1200 && png.height >= 700) return true;

  if (isJpegBuffer(buf) && buf.length >= 40_000) return true;

  return false;
}

export interface UpworkPageState {
  title: string;
  redirectLoop: boolean;
  cfChallenge: boolean;
  loginWall: boolean;
  hasJobDetails: boolean;
  bodyLen: number;
}

export async function probeUpworkPage(page: Page): Promise<UpworkPageState> {
  return page.evaluate(() => {
    const text = document.body?.innerText ?? "";
    const title = document.title ?? "";
    return {
      title,
      redirectLoop: /redirected you too many times|ERR_TOO_MANY_REDIRECTS/i.test(
        text,
      ),
      cfChallenge: /just a moment/i.test(title) || /challenge - upwork/i.test(title),
      loginWall: /log in to view|you need to be logged in|sign in to view/i.test(
        text,
      ),
      hasJobDetails: Boolean(
        document.querySelector(
          '[data-test="JobDetails"], [data-test="job-details"], .job-details-content',
        ),
      ),
      bodyLen: text.length,
    };
  });
}

export function isUpworkLoggedInPageOk(state: UpworkPageState): boolean {
  if (state.redirectLoop || state.cfChallenge) return false;
  if (state.loginWall && !state.hasJobDetails) return false;
  return state.hasJobDetails || state.bodyLen > 2_000;
}

/** Establish session on Upwork origin before opening a job deep link. */
export async function warmUpUpworkSession(page: Page): Promise<void> {
  await page
    .goto("https://www.upwork.com/", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    })
    .catch(() => undefined);
  await page.waitForTimeout(2_000);
}

/** Wait until Cloudflare interstitial clears. */
export async function waitForUpworkCloudflareClear(
  page: Page,
  maxMs = 45_000,
): Promise<boolean> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const title = await page.title().catch(() => "");
    if (!CF_TITLE.test(title)) {
      logScreenshotDebug(
        "upwork-screenshot.ts:waitForUpworkCloudflareClear",
        "cloudflare cleared",
        { title },
        "U3",
      );
      return true;
    }
    await page.waitForTimeout(2_000);
  }
  return false;
}

export async function dismissUpworkCookieBanner(page: Page): Promise<void> {
  const selectors = [
    'button[data-test="cookie-banner-accept"]',
    'button[data-test="cookie-consent-accept"]',
    'button:has-text("Accept All")',
    'button[aria-label="Close"]',
  ];
  for (const selector of selectors) {
    const btn = page.locator(selector).first();
    if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
      await btn.click({ timeout: 1_500 }).catch(() => undefined);
      await page.waitForTimeout(400);
      return;
    }
  }
}
