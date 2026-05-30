/**
 * Skip Chromium download on Vercel (web only). Worker hosts need Playwright installed.
 * Set PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 in Vercel env.
 */
import { execSync } from "node:child_process";

if (process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD === "1") {
  console.log("postinstall: skipping Playwright Chromium (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1)");
  process.exit(0);
}

console.log("postinstall: installing Playwright Chromium…");
execSync("npx playwright install chromium", { stdio: "inherit" });
