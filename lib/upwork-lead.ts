import type { Lead, LeadMetadata } from "@/types/lead";

const UPWORK_PRIVATE_REASON =
  "Upwork login-required (private) job links cannot be processed — they are excluded to save time.";

function debugLogUpworkClassification(
  url: string,
  data: Record<string, unknown>,
): void {
  // #region agent log
  fetch("http://127.0.0.1:7489/ingest/874f54e3-af15-42bb-a33a-e094f9419f9f", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "b8d92c",
    },
    body: JSON.stringify({
      sessionId: "b8d92c",
      runId: "upwork-classify",
      hypothesisId: "H1",
      location: "lib/upwork-lead.ts:classifyUpworkUrl",
      message: "upwork url classification",
      data: { url, ...data },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}

/** Upwork hostname check. */
export function isUpworkHost(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase().includes("upwork.com");
  } catch {
    return false;
  }
}

/**
 * Legacy matcher (buggy): substring /jobs/ — false-positive on some paths.
 * Kept for debug comparison only.
 */
export function legacyUpworkJobPathMatch(path: string): boolean {
  return path.includes("/jobs/");
}

/**
 * Strict Upwork job posting paths (public and private share the same URL shapes).
 * URL shape alone cannot distinguish public vs login-required.
 */
export function isUpworkJobPostingPath(path: string): boolean {
  const p = path.toLowerCase();
  return (
    p.startsWith("/jobs/") ||
    p.startsWith("/freelance-jobs/") ||
    p.startsWith("/freelance-jobs") ||
    /^\/[a-z]{2}\/freelance-jobs\//.test(p)
  );
}

/** @deprecated Use isUpworkJobPostingPath after normalizing URL — not for blocking. */
export function isUpworkJobUrl(url: string): boolean {
  try {
    if (!isUpworkHost(url)) return false;
    const path = new URL(url).pathname;
    return isUpworkJobPostingPath(path);
  } catch {
    return false;
  }
}

export function classifyUpworkUrl(url: string): {
  isUpwork: boolean;
  pathname: string;
  legacyIncludesJobs: boolean;
  strictJobPath: boolean;
} {
  try {
    const pathname = new URL(url).pathname;
    const isUpwork = isUpworkHost(url);
    const result = {
      isUpwork,
      pathname,
      legacyIncludesJobs: legacyUpworkJobPathMatch(pathname.toLowerCase()),
      strictJobPath: isUpworkJobPostingPath(pathname),
    };
    if (isUpwork) {
      debugLogUpworkClassification(url, result);
    }
    return result;
  } catch {
    return {
      isUpwork: false,
      pathname: "",
      legacyIncludesJobs: false,
      strictJobPath: false,
    };
  }
}

export function upworkPrivateBlockMetadata(): LeadMetadata {
  return {
    blocked: true,
    blockedReason: UPWORK_PRIVATE_REASON,
    upworkPrivate: true,
  };
}

/**
 * No longer blocks by URL — public /jobs/ and /freelance-jobs/apply/ links must pass through.
 * Private vs public cannot be determined from the URL alone.
 */
export function applyUpworkBlockToLead(lead: Lead): Lead {
  classifyUpworkUrl(lead.website);
  return lead;
}

export function enrichLeadsWithUpworkBlocks(leads: Lead[]): Lead[] {
  return leads.map(applyUpworkBlockToLead);
}

export function isLeadBlocked(lead: Lead): boolean {
  return Boolean(lead.metadata?.blocked || lead.metadata?.upworkPrivate);
}

export function getProcessableLeads(leads: Lead[]): Lead[] {
  return leads.filter((l) => !isLeadBlocked(l));
}

export function countBlockedLeads(leads: Lead[]): number {
  return leads.filter(isLeadBlocked).length;
}
