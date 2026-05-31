import { chromium, type Browser, type BrowserContext } from "playwright";
import { logger } from "@/lib/logger";
import { SCREENSHOT_VIEWPORT } from "./pipeline/screenshot-viewport";

/**
 * A single Chromium instance shared across all lead jobs in this worker
 * process. Per-lead isolation is achieved by creating a fresh BrowserContext
 * per job (own cookies, localStorage, cache) and closing it when done.
 *
 * Launching a new browser per lead is expensive (~300 ms + memory).
 * One persistent browser + N short-lived contexts is the idiomatic pattern.
 */

let _browser: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (_browser && _browser.isConnected()) {
    return _browser;
  }
  logger.info("launching Chromium browser instance");
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

/**
 * Creates an isolated BrowserContext from the shared browser.
 * Always call `context.close()` in a finally block — closing the context
 * automatically closes all its pages.
 */
export async function newContext(): Promise<BrowserContext> {
  const browser = await getBrowser();
  return browser.newContext({
    viewport: {
      width: SCREENSHOT_VIEWPORT.width,
      height: SCREENSHOT_VIEWPORT.height,
    },
    deviceScaleFactor: 1,
    colorScheme: "light",
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
  });
}

/** Graceful shutdown — drain in-flight contexts then close the browser. */
export async function closeBrowser(): Promise<void> {
  if (_browser) {
    logger.info("closing Chromium browser");
    try {
      await _browser.close();
    } catch (err) {
      logger.warn({ err }, "error while closing browser");
    } finally {
      _browser = null;
    }
  }
}
