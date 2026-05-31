/**
 * Skip Chromium download on Vercel (web only). Worker hosts need Playwright installed.
 * Set PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 in Vercel env.
 *
 * On Linux (Railway, Docker), --with-deps installs OS libraries Chromium needs.
 */
import { execSync } from "node:child_process";

if (process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD === "1") {
  console.log(
    "postinstall: skipping Playwright Chromium (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1)",
  );
  process.exit(0);
}

const linux =
  process.platform === "linux" || process.env.RAILWAY_ENVIRONMENT != null;
const cmd = linux
  ? "npx playwright install --with-deps chromium"
  : "npx playwright install chromium";

console.log(`postinstall: ${cmd}`);
execSync(cmd, { stdio: "inherit" });
