import type { Page } from "playwright";
import { logScreenshotDebug } from "./screenshot-crop";

export function isLinkedInUrl(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase().includes("linkedin.com");
  } catch {
    return false;
  }
}

let linkedInWarmedThisWorker = false;

/** Visit feed so session cookies attach before opening a post URL. */
export async function warmUpLinkedInSession(page: Page): Promise<void> {
  await page
    .goto("https://www.linkedin.com/feed/", {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    })
    .catch(() => undefined);
  await page.waitForTimeout(1_500);
}

/** Once per worker process — avoids a full feed load for every lead. */
export async function warmUpLinkedInSessionIfNeeded(page: Page): Promise<void> {
  if (linkedInWarmedThisWorker) return;
  await warmUpLinkedInSession(page);
  linkedInWarmedThisWorker = true;
}

/** LinkedIn guest-wall modal: "Sign in to view more content". */
export async function dismissLinkedInLoginModal(page: Page): Promise<boolean> {
  const selectors = [
    'button[aria-label="Dismiss"]',
    "button.artdeco-modal__dismiss",
    'button[data-test-modal-close-btn]',
    'button[aria-label="Close"]',
  ];

  for (const selector of selectors) {
    const btn = page.locator(selector).first();
    if (await btn.isVisible({ timeout: 800 }).catch(() => false)) {
      await btn.click({ timeout: 2_000 }).catch(() => undefined);
      await page.waitForTimeout(600);
      logScreenshotDebug(
        "linkedin-screenshot.ts:dismissLinkedInLoginModal",
        "dismissed login modal",
        { selector },
        "D",
      );
      return true;
    }
  }
  return false;
}

export async function probeLinkedInPageState(page: Page): Promise<{
  signInToView: boolean;
  hasLoginModal: boolean;
  hasPostContent: boolean;
  guestNav: boolean;
}> {
  return page.evaluate(() => {
    const text = document.body?.innerText ?? "";
    const article = document.querySelector("article");
    const articleText = article?.innerText ?? "";
    return {
      signInToView: /sign in to view more content/i.test(text),
      hasLoginModal: Boolean(
        document.querySelector(
          ".contextual-sign-in-modal, .artdeco-modal--layer-default, div[role='dialog']",
        ),
      ),
      hasPostContent: articleText.trim().length > 80,
      guestNav: /join now/i.test(text.slice(0, 600)) && /sign in/i.test(text.slice(0, 600)),
    };
  });
}

/** Reject screenshots that still show the guest login wall over the post. */
export async function isLinkedInScreenshotAcceptable(
  page: Page,
): Promise<{ ok: boolean; reason?: string; state?: Awaited<ReturnType<typeof probeLinkedInPageState>> }> {
  const state = await probeLinkedInPageState(page);
  logScreenshotDebug(
    "linkedin-screenshot.ts:isLinkedInScreenshotAcceptable",
    "linkedin page state",
    state,
    "D",
  );

  if (state.signInToView) {
    return { ok: false, reason: "linkedin-login-modal", state };
  }
  if (!state.hasPostContent) {
    return { ok: false, reason: "linkedin-no-post-content", state };
  }
  return { ok: true, state };
}
