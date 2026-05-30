import { readFile } from "node:fs/promises";
import path from "node:path";

export type CookiePlatform = "upwork" | "linkedin";

export type CookieHealth = "ok" | "warn" | "error" | "missing";

export interface PlatformCookieStatus {
  platform: CookiePlatform;
  health: CookieHealth;
  configured: boolean;
  message: string;
  /** Earliest expiry among tracked auth cookies (ms), if known */
  expiresAt?: number;
  daysUntilExpiry?: number;
  missingAuthCookies?: string[];
}

/** Cookies that must be present for logged-in screenshots */
const AUTH_COOKIE_NAMES: Record<CookiePlatform, string[]> = {
  upwork: ["master_access_token", "user_uid", "console_user"],
  linkedin: ["li_at", "li_rm"],
};

const WARN_DAYS = 7;

export interface ExportedCookie {
  domain: string;
  name: string;
  value: string;
  path?: string;
  expirationDate?: number;
  hostOnly?: boolean;
  httpOnly?: boolean;
  secure?: boolean;
  session?: boolean;
  sameSite?: string;
}

export interface CookieExportFile {
  url?: string;
  cookies: ExportedCookie[];
}

function cookiesDir(): string {
  return (
    process.env.COOKIES_DIR?.trim() ||
    path.join(process.cwd(), "cookies")
  );
}

function cookieFilePath(platform: CookiePlatform): string {
  return path.join(cookiesDir(), `${platform}.json`);
}

export async function loadCookieExport(
  platform: CookiePlatform,
): Promise<CookieExportFile | null> {
  const filePath = cookieFilePath(platform);
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as CookieExportFile;
    if (!Array.isArray(parsed.cookies)) {
      throw new Error("cookies array missing");
    }
    return parsed;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw new Error(
      `Invalid ${platform} cookies file (${filePath}): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** Cookie-Editor exports often wrap values in extra quotes — strip them. */
export function normalizeCookieValue(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function mapSameSite(raw?: string): "Strict" | "Lax" | "None" | undefined {
  if (!raw) return undefined;
  const s = raw.toLowerCase();
  if (s === "strict") return "Strict";
  if (s === "lax") return "Lax";
  if (s === "none" || s === "no_restriction") return "None";
  return "Lax";
}

/** Playwright cookie shape */
export function toPlaywrightCookies(exportFile: CookieExportFile) {
  return exportFile.cookies
    .filter((c) => c.name && c.domain)
    .map((c) => {
      const cookie: {
        name: string;
        value: string;
        domain: string;
        path: string;
        expires?: number;
        httpOnly?: boolean;
        secure?: boolean;
        sameSite?: "Strict" | "Lax" | "None";
      } = {
        name: c.name,
        value: normalizeCookieValue(c.value),
        domain: c.domain,
        path: c.path || "/",
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: mapSameSite(c.sameSite),
      };
      if (!c.session && c.expirationDate) {
        cookie.expires = Math.floor(c.expirationDate);
      }
      return cookie;
    });
}

/** ScrapingBee `cookies` param: name=value;name2=value2 */
export function toScrapingBeeCookieHeader(exportFile: CookieExportFile): string {
  return exportFile.cookies
    .filter((c) => c.name && c.value != null)
    .map((c) => `${c.name}=${normalizeCookieValue(c.value)}`)
    .join(";");
}

export function platformForUrl(url: string): CookiePlatform | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("upwork.com")) return "upwork";
    if (host.includes("linkedin.com")) return "linkedin";
  } catch {
    /* ignore */
  }
  return null;
}

export async function getCookiesForUrl(url: string): Promise<{
  playwright: ReturnType<typeof toPlaywrightCookies>;
  scrapingBeeHeader: string;
} | null> {
  const platform = platformForUrl(url);
  if (!platform) return null;
  const file = await loadCookieExport(platform);
  if (!file) return null;
  return {
    playwright: toPlaywrightCookies(file),
    scrapingBeeHeader: toScrapingBeeCookieHeader(file),
  };
}

function analyzeExport(
  platform: CookiePlatform,
  file: CookieExportFile | null,
): PlatformCookieStatus {
  const label = platform === "upwork" ? "Upwork" : "LinkedIn";
  const filePath = cookieFilePath(platform);

  if (!file) {
    return {
      platform,
      health: "missing",
      configured: false,
      message: `${label} cookies missing — save your browser export to ${filePath} and restart the worker.`,
    };
  }

  const required = AUTH_COOKIE_NAMES[platform];
  const names = new Set(file.cookies.map((c) => c.name));
  const missingAuth = required.filter((n) => !names.has(n));

  const now = Date.now();
  const authExpiries = file.cookies
    .filter((c) => required.includes(c.name) && c.expirationDate)
    .map((c) => c.expirationDate! * (c.expirationDate! < 1e12 ? 1000 : 1));

  const earliest =
    authExpiries.length > 0 ? Math.min(...authExpiries) : undefined;
  const daysUntilExpiry =
    earliest != null
      ? Math.floor((earliest - now) / (24 * 60 * 60 * 1000))
      : undefined;

  if (missingAuth.length > 0) {
    return {
      platform,
      health: "error",
      configured: true,
      message: `${label} cookies file is missing login cookies (${missingAuth.join(", ")}). Re-export while logged in and replace ${filePath}.`,
      missingAuthCookies: missingAuth,
    };
  }

  if (earliest != null && earliest < now) {
    return {
      platform,
      health: "error",
      configured: true,
      message: `${label} cookies have expired. Export fresh cookies from your browser and replace ${filePath}, then restart the worker.`,
      expiresAt: earliest,
      daysUntilExpiry,
    };
  }

  if (daysUntilExpiry != null && daysUntilExpiry <= WARN_DAYS) {
    return {
      platform,
      health: "warn",
      configured: true,
      message: `${label} cookies expire in ${daysUntilExpiry} day(s). Export new cookies soon and replace ${filePath}.`,
      expiresAt: earliest,
      daysUntilExpiry,
    };
  }

  return {
    platform,
    health: "ok",
    configured: true,
    message: `${label} cookies look valid${daysUntilExpiry != null ? ` (auth expires in ~${daysUntilExpiry} days)` : ""}.`,
    expiresAt: earliest,
    daysUntilExpiry,
  };
}

export async function getCookieStatusReport(): Promise<{
  platforms: PlatformCookieStatus[];
  needsAttention: boolean;
}> {
  const [upwork, linkedin] = await Promise.all([
    loadCookieExport("upwork"),
    loadCookieExport("linkedin"),
  ]);

  const platforms = [
    analyzeExport("upwork", upwork),
    analyzeExport("linkedin", linkedin),
  ];

  const needsAttention = platforms.some(
    (p) => p.health === "warn" || p.health === "error" || p.health === "missing",
  );

  return { platforms, needsAttention };
}
