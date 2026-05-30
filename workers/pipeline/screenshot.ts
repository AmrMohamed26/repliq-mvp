import { readFile } from "node:fs/promises";
import { newContext } from "../browser";
import { screenshotPath, ensureLeadDir } from "@/lib/files";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { Page } from "playwright";
import { getPngDimensions } from "@/lib/png-dimensions";
import { getCookiesForUrl } from "@/lib/site-cookies";
import {
  cropScreenshotToViewport,
  logScreenshotDebug,
} from "./screenshot-crop";
import {
  dismissLinkedInLoginModal,
  isLinkedInScreenshotAcceptable,
  isLinkedInUrl,
  warmUpLinkedInSessionIfNeeded,
} from "./linkedin-screenshot";
import {
  dismissUpworkCookieBanner,
  isUpworkLoggedInPageOk,
  isUpworkScreenshotAcceptable,
  isUpworkUrl,
  probeUpworkPage,
  waitForUpworkCloudflareClear,
  warmUpUpworkSession,
} from "./upwork-screenshot";
import {
  captureScreenshotViaPaidProviders,
  hasPaidScreenshotProvider,
  isHardScreenshotHost,
} from "./screenshot-providers";

const TIMEOUT = env.PLAYWRIGHT_TIMEOUT_MS;
const HARD_HOST_TIMEOUT_MS = Math.max(TIMEOUT, 90_000);
const RETRIES = env.PLAYWRIGHT_RETRIES;
const BOT_PROTECTION_PATTERNS = [
  "verify you are human",
  "verifying your browser",
  "checking your browser",
  "captcha",
  "cf-challenge",
  "attention required",
  "just a moment",
  "are you a robot",
  "access denied",
];

const CLOUDFLARE_CHALLENGE_SIGNALS = [
  "just a moment",
  "checking your browser",
  "cf-challenge",
  "verify you are human",
];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return url.slice(0, 80);
  }
}

function isBotProtectionMessage(message: string): boolean {
  return message.includes("blocked automated screenshot capture");
}

/** Scroll to main post/job content and hide chrome before viewport capture. */
async function prepareHardHostPage(page: Page, url: string): Promise<void> {
  const host = new URL(url).hostname.toLowerCase();

  if (host.includes("linkedin.com")) {
    await page
      .locator("main, [role='main'], article")
      .first()
      .waitFor({ state: "visible", timeout: 15_000 })
      .catch(() => undefined);

    await page.evaluate(`
      (function () {
        var selectors = ["header", "#global-nav", "aside", "footer", ".msg-overlay-container"];
        for (var i = 0; i < selectors.length; i++) {
          document.querySelectorAll(selectors[i]).forEach(function (node) {
            if (node instanceof HTMLElement) {
              node.style.setProperty("display", "none", "important");
            }
          });
        }
        var focus =
          document.querySelector("article") ||
          document.querySelector("main [data-view-name]") ||
          document.querySelector("main");
        if (focus && focus.scrollIntoView) {
          focus.scrollIntoView({ block: "start", inline: "nearest" });
        }
      })();
    `);
    await page.waitForTimeout(800);
    return;
  }

  if (host.includes("upwork.com")) {
    await page
      .locator("main, [data-test='JobDetails'], .job-details-content")
      .first()
      .waitFor({ state: "visible", timeout: 15_000 })
      .catch(() => undefined);

    await page.evaluate(`
      (function () {
        var selectors = ["header", "nav", "footer", "[data-test='TopNav']"];
        for (var i = 0; i < selectors.length; i++) {
          document.querySelectorAll(selectors[i]).forEach(function (node) {
            if (node instanceof HTMLElement) {
              node.style.setProperty("display", "none", "important");
            }
          });
        }
        var focus =
          document.querySelector("[data-test='JobDetails']") ||
          document.querySelector("main");
        if (focus && focus.scrollIntoView) {
          focus.scrollIntoView({ block: "start", inline: "nearest" });
        }
      })();
    `);
    await page.waitForTimeout(500);
  }
}

/** Short settle after navigation — avoids slow/unreliable networkidle. */
async function settlePageAfterLoad(
  page: Page,
  opts?: { linkedIn?: boolean; upworkLoggedIn?: boolean },
): Promise<void> {
  await page
    .waitForLoadState("domcontentloaded", { timeout: 12_000 })
    .catch(() => undefined);

  const settleMs = opts?.linkedIn ? 2_000 : opts?.upworkLoggedIn ? 1_500 : 1_000;
  await page.waitForTimeout(settleMs);
  await waitForBodyTextStability(page);
}

async function capturePlaywrightScreenshot(
  url: string,
  outPath: string,
  log: ReturnType<typeof logger.child>,
  opts?: { hardHost?: boolean; upworkLoggedIn?: boolean },
): Promise<boolean> {
  const timeout = opts?.hardHost ? HARD_HOST_TIMEOUT_MS : TIMEOUT;
  const linkedIn = isLinkedInUrl(url);
  const upworkLoggedIn = Boolean(opts?.upworkLoggedIn);

  const context = await newContext();
  try {
    const siteCookies = await getCookiesForUrl(url);
    const cookieCount = siteCookies?.playwright.length ?? 0;
    logScreenshotDebug(
      "screenshot.ts:capturePlaywrightScreenshot",
      "playwright start",
      {
        url,
        hardHost: Boolean(opts?.hardHost),
        linkedIn,
        upworkLoggedIn,
        cookieCount,
      },
      "E",
    );

    if (siteCookies?.playwright.length) {
      await context.addCookies(siteCookies.playwright);
    }

    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", {
        get: () => undefined,
      });
    });
    const page = await context.newPage();

    await page.route(
      /\.(woff2?|ttf|otf|eot|mp4|webm|ogg|mp3|wav)(\?.*)?$/i,
      (route) => route.abort(),
    );

    if (upworkLoggedIn && cookieCount > 0) {
      await warmUpUpworkSession(page);
      await waitForUpworkCloudflareClear(page);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout });
      const cfOk = await waitForUpworkCloudflareClear(page);
      await dismissUpworkCookieBanner(page);
      const state = await probeUpworkPage(page);
      logScreenshotDebug(
        "screenshot.ts:capturePlaywrightScreenshot",
        "upwork logged-in navigation",
        { url, cfOk, state },
        "U3",
      );
      if (!isUpworkLoggedInPageOk(state)) {
        log.warn({ url, state }, "Upwork logged-in page not ready");
        return false;
      }
    } else {
      if (linkedIn && cookieCount > 0) {
        await warmUpLinkedInSessionIfNeeded(page);
      }

      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout,
      });
    }

    await settlePageAfterLoad(page, { linkedIn, upworkLoggedIn });

    if (linkedIn) {
      await dismissLinkedInLoginModal(page);
      const check = await isLinkedInScreenshotAcceptable(page);
      if (!check.ok) {
        log.warn(
          { url, reason: check.reason, state: check.state, status: "login-wall" },
          "LinkedIn login wall still visible after dismiss",
        );
        logScreenshotDebug(
          "screenshot.ts:capturePlaywrightScreenshot",
          "linkedin login wall",
          { url, reason: check.reason, state: check.state },
          "D",
        );
        return false;
      }
    }

    if (opts?.hardHost) {
      await prepareHardHostPage(page, url);
    }

    const skipBotHeuristic =
      cookieCount > 0 && (linkedIn || upworkLoggedIn);
    if (!skipBotHeuristic) {
      const detection = await detectBotProtection(page);
      if (detection.blocked) {
        log.warn(
          { url, reason: detection.reason, status: "blocked" },
          "Playwright blocked on hard host",
        );
        return false;
      }
    }

    if (linkedIn) {
      const finalCheck = await isLinkedInScreenshotAcceptable(page);
      if (!finalCheck.ok) {
        log.warn(
          { url, reason: finalCheck.reason, state: finalCheck.state },
          "LinkedIn screenshot rejected before capture",
        );
        return false;
      }
    }

    if (upworkLoggedIn) {
      const state = await probeUpworkPage(page);
      if (!isUpworkLoggedInPageOk(state)) {
        log.warn({ url, state }, "Upwork logged-in page rejected before capture");
        return false;
      }
    }

    await page.screenshot({
      path: outPath,
      fullPage: false,
      type: "png",
      animations: "disabled",
    });

    const buf = await readFile(outPath);
    const dims = getPngDimensions(buf);
    logScreenshotDebug(
      "screenshot.ts:capturePlaywrightScreenshot",
      "playwright viewport capture",
      { url, hardHost: Boolean(opts?.hardHost), linkedIn, ...dims },
      "C",
    );
    await cropScreenshotToViewport(outPath);

    if (upworkLoggedIn && !(await isUpworkScreenshotAcceptable(outPath))) {
      log.warn({ url }, "Upwork Playwright capture failed quality check");
      return false;
    }

    return true;
  } catch (err) {
    log.warn({ url, err }, "Playwright screenshot failed");
    logScreenshotDebug(
      "screenshot.ts:capturePlaywrightScreenshot",
      "playwright error",
      { url, error: err instanceof Error ? err.message : String(err) },
      "E",
    );
    return false;
  } finally {
    await context.close().catch(() => undefined);
  }
}

async function waitForBodyTextStability(page: Page) {
  let previous = "";
  let stableTicks = 0;
  for (let i = 0; i < 5; i++) {
    const current = await page
      .locator("body")
      .innerText({ timeout: 5_000 })
      .catch(() => "");
    if (current && current === previous) {
      stableTicks++;
      if (stableTicks >= 2) return;
    } else {
      stableTicks = 0;
      previous = current;
    }
    await page.waitForTimeout(500);
  }
}

async function detectBotProtection(
  page: Page,
): Promise<{ blocked: boolean; reason?: string; title: string; sample: string }> {
  const { title, bodyText, html } = await page.evaluate(() => ({
    title: document.title ?? "",
    bodyText: document.body?.innerText?.slice(0, 4000) ?? "",
    html: document.documentElement?.innerHTML?.slice(0, 8000) ?? "",
  }));
  const haystack = `${title}\n${bodyText}\n${html}`.toLowerCase();

  let reason = BOT_PROTECTION_PATTERNS.find((pattern) =>
    haystack.includes(pattern),
  );

  if (
    !reason &&
    haystack.includes("cloudflare") &&
    CLOUDFLARE_CHALLENGE_SIGNALS.some((s) => haystack.includes(s))
  ) {
    reason = "cloudflare";
  }

  return {
    blocked: Boolean(reason),
    reason,
    title,
    sample: bodyText.slice(0, 240),
  };
}

async function captureFallbackScreenshot(
  outPath: string,
  url: string,
): Promise<void> {
  const host = hostnameFromUrl(url);
  const context = await newContext();
  try {
    const page = await context.newPage();
    await page.setContent(
      `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;width:1920px;height:1080px;background:linear-gradient(145deg,#0f172a 0%,#1e293b 50%,#0f172a 100%);font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;color:#f8fafc;">
        <div style="text-align:center;max-width:720px;padding:48px;">
          <div style="font-size:14px;letter-spacing:0.12em;text-transform:uppercase;color:#94a3b8;margin-bottom:16px;">Personalized for you</div>
          <div style="font-size:42px;font-weight:700;line-height:1.15;margin-bottom:12px;">${host}</div>
          <div style="font-size:18px;color:#cbd5e1;line-height:1.5;">This site limits automated previews.<br/>Your video still includes a custom message.</div>
        </div>
      </body></html>`,
      { waitUntil: "domcontentloaded" },
    );
    await page.screenshot({
      path: outPath,
      fullPage: false,
      type: "png",
      animations: "disabled",
    });
  } finally {
    await context.close().catch(() => undefined);
  }
}

async function tryPaidThenPlaceholder(
  url: string,
  outPath: string,
  log: { info: (o: object, m: string) => void; warn: (o: object, m: string) => void },
  reason: string,
): Promise<string> {
  if (hasPaidScreenshotProvider()) {
    const provider = await captureScreenshotViaPaidProviders(url, outPath, log);
    if (provider) return outPath;
  }

  log.warn(
    { url, reason, status: "fallback" },
    "using placeholder screenshot slide",
  );
  await captureFallbackScreenshot(outPath, url);
  return outPath;
}

/**
 * Captures a viewport PNG screenshot of `url`.
 *
 * - Upwork / LinkedIn: paid API first (ScrapingBee / ZenRows) when API keys are set.
 * - Other sites: local Playwright.
 * - Bot block or API failure: placeholder slide (pipeline continues).
 */
export async function captureScreenshot(
  sessionId: string,
  leadId: string,
  url: string,
): Promise<string> {
  await ensureLeadDir(sessionId, leadId);
  const outPath = screenshotPath(sessionId, leadId);

  const log = logger.child({ sessionId, leadId, stage: "screenshot" });

  if (isHardScreenshotHost(url)) {
    if (!hasPaidScreenshotProvider()) {
      throw new Error(
        "Upwork/LinkedIn require SCRAPINGBEE_API_KEY in .env — restart the worker after adding it",
      );
    }
    const siteCookies = await getCookiesForUrl(url);
    if (!siteCookies?.scrapingBeeHeader) {
      log.warn(
        { url },
        "no session cookies for this site — export cookies to cookies/ folder (see cookies/README.md)",
      );
    }

    const hasSessionCookies = Boolean(siteCookies?.playwright.length);
    const linkedInWithCookies = isLinkedInUrl(url) && hasSessionCookies;
    const upworkWithCookies = isUpworkUrl(url) && hasSessionCookies;

    logScreenshotDebug(
      "screenshot.ts:captureScreenshot",
      "hard host route",
      { url, linkedInWithCookies, upworkWithCookies, hasSessionCookies },
      "U1",
    );

    // Upwork: public jobs work via ScrapingBee stealth WITHOUT cookies (cookies → redirect loop).
    if (upworkWithCookies || isUpworkUrl(url)) {
      log.info(
        { url, status: "starting" },
        "Upwork — ScrapingBee stealth (public job view first)",
      );

      let provider = await captureScreenshotViaPaidProviders(url, outPath, log, {
        cookieHeader: null,
      });
      let acceptable =
        provider != null && (await isUpworkScreenshotAcceptable(outPath));

      logScreenshotDebug(
        "screenshot.ts:captureScreenshot",
        "upwork scrape no cookies",
        { provider, acceptable },
        "U2",
      );

      if (!acceptable && upworkWithCookies) {
        log.info(
          { url },
          "Upwork — Playwright with session cookies (private job; ScrapingBee cookies skipped)",
        );
        const ok = await capturePlaywrightScreenshot(url, outPath, log, {
          hardHost: true,
          upworkLoggedIn: true,
        });
        acceptable = ok;
        logScreenshotDebug(
          "screenshot.ts:captureScreenshot",
          "upwork playwright logged-in",
          { ok, acceptable },
          "U3",
        );
      }

      if (acceptable) {
        log.info({ url, status: "done" }, "Upwork screenshot captured");
        return outPath;
      }

      log.warn(
        { url, status: "fallback" },
        "Upwork screenshot failed — using placeholder (private jobs may need fresh cookies/upwork.json)",
      );
      await captureFallbackScreenshot(outPath, url);
      return outPath;
    }

    if (hasSessionCookies && linkedInWithCookies) {
      log.info({ url, status: "starting" }, "hard host — Playwright with session cookies");
      const ok = await capturePlaywrightScreenshot(url, outPath, log, {
        hardHost: true,
      });
      if (ok) {
        log.info({ url, status: "done" }, "screenshot captured via Playwright (hard host)");
        return outPath;
      }

      log.error(
        { url },
        "LinkedIn session screenshot failed — ScrapingBee cannot reuse your login cookies. Re-export cookies/linkedin.json while logged in, restart worker.",
      );
      log.warn(
        { url, status: "fallback" },
        "using placeholder — LinkedIn login wall (refresh cookies/linkedin.json)",
      );
      await captureFallbackScreenshot(outPath, url);
      return outPath;
    }

    if (hasSessionCookies && !isUpworkUrl(url)) {
      log.info({ url, status: "starting" }, "hard host — Playwright with session cookies");
      const ok = await capturePlaywrightScreenshot(url, outPath, log, {
        hardHost: true,
      });
      if (ok) {
        log.info({ url, status: "done" }, "screenshot captured via Playwright (hard host)");
        return outPath;
      }
      log.warn({ url }, "Playwright failed for hard host — trying ScrapingBee");
    }

    log.info({ url, status: "starting" }, "hard host — ScrapingBee screenshot");
    const provider = await captureScreenshotViaPaidProviders(url, outPath, log);
    if (provider) return outPath;

    if (isUpworkUrl(url)) {
      log.warn({ url, status: "fallback" }, "Upwork — placeholder after ScrapingBee failed");
      await captureFallbackScreenshot(outPath, url);
      return outPath;
    }

    log.warn({ url }, "ScrapingBee failed for hard host — trying Playwright");
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(1000 * 2 ** attempt, 8_000);
      log.warn(
        { url, attempt, delay, status: "retrying" },
        "screenshot attempt failed — retrying",
      );
      await sleep(delay);
    }

    const context = await newContext();
    try {
      const siteCookies = await getCookiesForUrl(url);
      if (siteCookies?.playwright.length) {
        await context.addCookies(siteCookies.playwright);
      }

      await context.addInitScript(() => {
        Object.defineProperty(navigator, "webdriver", {
          get: () => undefined,
        });
      });
      const page = await context.newPage();

      await page.route(
        /\.(woff2?|ttf|otf|eot|mp4|webm|ogg|mp3|wav)(\?.*)?$/i,
        (route) => route.abort(),
      );

      await page.goto(url, {
        waitUntil: attempt === 0 ? "domcontentloaded" : "load",
        timeout: TIMEOUT,
      });

      await settlePageAfterLoad(page, {
        linkedIn: isLinkedInUrl(url),
      });
      if (attempt > 0) {
        await page.waitForTimeout(2_000);
      }

      if (isHardScreenshotHost(url)) {
        await prepareHardHostPage(page, url);
      }

      const detection = await detectBotProtection(page);
      if (detection.blocked) {
        log.warn(
          {
            url,
            reason: detection.reason,
            title: detection.title,
            status: "blocked",
          },
          "Playwright blocked — trying paid API or placeholder",
        );
        return tryPaidThenPlaceholder(
          url,
          outPath,
          log,
          detection.reason ?? "bot protection",
        );
      }

      await page.screenshot({
        path: outPath,
        fullPage: false,
        type: "png",
        animations: "disabled",
      });

      const rawBuf = await readFile(outPath);
      const rawDims = getPngDimensions(rawBuf);
      await cropScreenshotToViewport(outPath);
      logScreenshotDebug(
        "screenshot.ts:captureScreenshot",
        "playwright retry path capture",
        { url, attempt, ...rawDims },
        "C",
      );

      log.info(
        { url, outPath, attempt, status: "done" },
        "screenshot captured via Playwright",
      );
      return outPath;
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);

      if (isBotProtectionMessage(msg)) {
        return tryPaidThenPlaceholder(url, outPath, log, msg);
      }

      log.warn(
        { url, attempt, status: "failed", err },
        "screenshot attempt failed",
      );
    } finally {
      await context.close().catch(() => undefined);
    }
  }

  if (hasPaidScreenshotProvider()) {
    const provider = await captureScreenshotViaPaidProviders(url, outPath, log);
    if (provider) return outPath;
  }

  throw new Error(
    `screenshot failed after ${RETRIES + 1} attempt(s) for ${url}: ${String(lastError)}`,
  );
}
