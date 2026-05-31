import { chromium, type Browser, type BrowserContext } from "playwright";
import { logger } from "@/lib/logger";
import { SCREENSHOT_VIEWPORT } from "./pipeline/screenshot-viewport";

/**
 * A single Chromium instance shared across all lead jobs in this worker
 * process. Per-lead isolation is achieved by creating a fresh BrowserContext
 * per job (own cookies, localStorage, cache) and closing it when done.
 */

let _browser: Browser | null = null;

function isBrowserClosedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /has been closed|Target closed|Browser has been closed/i.test(msg);
}

/** Reset shared Chromium after a crash (used by screenshot retry logic). */
export async function resetBrowserForScreenshot(): Promise<void> {
  await resetBrowser();
}

async function resetBrowser(): Promise<void> {
  const prev = _browser;
  _browser = null;
  if (!prev) return;
  try {
    await prev.close();
  } catch {
    /* ignore */
  }
}

export async function getBrowser(): Promise<Browser> {
  if (_browser?.isConnected()) {
    return _browser;
  }

  await resetBrowser();
  logger.info("launching Chromium browser instance");

  // #region agent log
  fetch("http://127.0.0.1:7489/ingest/874f54e3-af15-42bb-a33a-e094f9419f9f", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "b8d92c",
    },
    body: JSON.stringify({
      sessionId: "b8d92c",
      runId: "linkedin-browser",
      hypothesisId: "H1",
      location: "workers/browser.ts:getBrowser",
      message: "launching chromium",
      data: { platform: process.platform },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  _browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-software-rasterizer",
      "--disable-gpu",
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process",
      "--disable-blink-features=AutomationControlled",
      "--lang=en-US,en",
    ],
  });
  _browser.on("disconnected", () => {
    logger.warn("Chromium browser disconnected — will relaunch on next use");
    _browser = null;
  });
  return _browser;
}

const CONTEXT_OPTIONS = {
  viewport: {
    width: SCREENSHOT_VIEWPORT.width,
    height: SCREENSHOT_VIEWPORT.height,
  },
  deviceScaleFactor: 1,
  colorScheme: "light" as const,
  locale: "en-US",
  timezoneId: "America/New_York",
  ignoreHTTPSErrors: true,
  javaScriptEnabled: true,
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/124.0.0.0 Safari/537.36",
  extraHTTPHeaders: {
    "Accept-Language": "en-US,en;q=0.9",
    "Upgrade-Insecure-Requests": "1",
  },
};

/**
 * Creates an isolated BrowserContext from the shared browser.
 * Retries once if Chromium crashed between jobs (common on small Railway instances).
 */
export async function newContext(): Promise<BrowserContext> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const browser = await getBrowser();
      return await browser.newContext(CONTEXT_OPTIONS);
    } catch (err) {
      if (attempt === 0 && isBrowserClosedError(err)) {
        logger.warn({ err }, "browser dead while creating context — relaunching");
        // #region agent log
        fetch("http://127.0.0.1:7489/ingest/874f54e3-af15-42bb-a33a-e094f9419f9f", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "b8d92c",
          },
          body: JSON.stringify({
            sessionId: "b8d92c",
            runId: "linkedin-browser",
            hypothesisId: "H2",
            location: "workers/browser.ts:newContext",
            message: "context create failed, resetting browser",
            data: { attempt, error: err instanceof Error ? err.message : String(err) },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        await resetBrowser();
        continue;
      }
      throw err;
    }
  }
  throw new Error("Failed to create browser context after retry");
}

/** Graceful shutdown — drain in-flight contexts then close the browser. */
export async function closeBrowser(): Promise<void> {
  await resetBrowser();
}
