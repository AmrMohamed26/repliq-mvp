import { mkdir, rm, access } from "node:fs/promises";
import { join } from "node:path";
import { env } from "./env";

const BASE = env.TMP_DIR; // /tmp/repliq by default

// ── Directory helpers ──────────────────────────────────────────────────────

/** /tmp/repliq/{sessionId}/ — holds the shared talking-head video */
export function sessionDir(sessionId: string): string {
  return join(BASE, sessionId);
}

/**
 * /tmp/repliq/{sessionId}/{leadId}/ — fully isolated per-lead work area.
 * Each lead's intermediate files (screenshot, render, thumbnail) live here,
 * preventing any cross-job file collision in batch workloads.
 */
export function leadDir(sessionId: string, leadId: string): string {
  return join(BASE, sessionId, leadId);
}

// ── Path helpers ───────────────────────────────────────────────────────────

/** Shared talking-head video (one per session, not per lead). */
export function talkingHeadPath(sessionId: string): string {
  return join(sessionDir(sessionId), "talking.mp4");
}

export function screenshotPath(sessionId: string, leadId: string): string {
  return join(leadDir(sessionId, leadId), "screenshot.png");
}

export function renderOutputPath(sessionId: string, leadId: string): string {
  return join(leadDir(sessionId, leadId), "render.mp4");
}

export function thumbnailPath(sessionId: string, leadId: string): string {
  return join(leadDir(sessionId, leadId), "thumb.jpg");
}

// ── Directory creation ─────────────────────────────────────────────────────

/** Ensure the session root dir exists (for talking-head upload). */
export async function ensureSessionDir(sessionId: string): Promise<string> {
  const dir = sessionDir(sessionId);
  await mkdir(dir, { recursive: true });
  return dir;
}

/** Ensure the per-lead isolated work directory exists. */
export async function ensureLeadDir(
  sessionId: string,
  leadId: string,
): Promise<string> {
  const dir = leadDir(sessionId, leadId);
  await mkdir(dir, { recursive: true });
  return dir;
}

// ── Cleanup ────────────────────────────────────────────────────────────────

/**
 * Remove the entire per-lead directory and all intermediate files within it.
 * Called on job SUCCESS — files are kept on failure so BullMQ retries can
 * resume from checkpoints rather than restarting from scratch.
 */
export async function cleanupLeadFiles(
  sessionId: string,
  leadId: string,
): Promise<void> {
  await rm(leadDir(sessionId, leadId), { recursive: true, force: true });
}

/** Remove the entire session temp dir (called on session cancel/expiry). */
export async function cleanupSession(sessionId: string): Promise<void> {
  await rm(sessionDir(sessionId), { recursive: true, force: true });
}

/**
 * Sweep BASE for session directories older than `maxAgeMs`.
 * Runs on worker startup to prevent disk buildup from crashed/orphaned jobs.
 */
export async function sweepOldSessions(
  maxAgeMs = 24 * 60 * 60 * 1000,
): Promise<void> {
  const { readdir, stat } = await import("node:fs/promises");
  try {
    await access(BASE);
  } catch {
    return; // base dir doesn't exist yet — nothing to sweep
  }
  const entries = await readdir(BASE);
  const now = Date.now();
  await Promise.allSettled(
    entries.map(async (entry) => {
      const fullPath = join(BASE, entry);
      try {
        const s = await stat(fullPath);
        if (now - s.mtimeMs > maxAgeMs) {
          await rm(fullPath, { recursive: true, force: true });
        }
      } catch {
        // ignore — entry may have been removed concurrently
      }
    }),
  );
}
