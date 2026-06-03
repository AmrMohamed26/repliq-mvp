import { nanoid } from "nanoid";
import { ensureWebRedisConnected } from "./redis";
import { watchPageUrl } from "./app-url";
import {
  allocateUniqueSlug,
  registerSlugMapping,
  resolveLeadId,
} from "./lead-slug";
import { isLegacyShareUrl } from "./media-url";
import type { Session, SessionStage } from "@/types/session";
import type { Lead } from "@/types/lead";
import type { LeadResult } from "@/types/lead";

const TTL_SEC = 60 * 60 * 24; // 24 h

function key(id: string) {
  return `session:${id}`;
}
function leadsKey(id: string) {
  return `leads:${id}`;
}
function resultsKey(id: string) {
  return `results:${id}`;
}

// ─── Session CRUD ──────────────────────────────────────────────────────────

export async function createSession(): Promise<Session> {
  const session: Session = {
    id: nanoid(),
    createdAt: Date.now(),
    stage: "created",
    leads: [],
  };
  const redis = await ensureWebRedisConnected();
  await redis.set(key(session.id), JSON.stringify(session), "EX", TTL_SEC);
  return session;
}

export async function getSession(id: string): Promise<Session | null> {
  const redis = await ensureWebRedisConnected();
  const raw = await redis.get(key(id));
  if (!raw) return null;
  return JSON.parse(raw) as Session;
}

export async function updateSession(
  id: string,
  patch: Partial<Omit<Session, "id" | "createdAt">>,
): Promise<Session | null> {
  const session = await getSession(id);
  if (!session) return null;
  const updated = { ...session, ...patch };
  const redis = await ensureWebRedisConnected();
  await redis.set(key(id), JSON.stringify(updated), "EX", TTL_SEC);
  return updated;
}

export async function setStage(
  id: string,
  stage: SessionStage,
): Promise<void> {
  await updateSession(id, { stage });
}

// ─── Leads ────────────────────────────────────────────────────────────────

export async function setLeads(sessionId: string, leads: Lead[]): Promise<void> {
  const redis = await ensureWebRedisConnected();
  const withSlugs = await ensureLeadSlugs(leads);
  await redis.set(leadsKey(sessionId), JSON.stringify(withSlugs), "EX", TTL_SEC);
  await updateSession(sessionId, { leads: withSlugs, stage: "csv_uploaded" });
}

export async function getLeads(sessionId: string): Promise<Lead[]> {
  const redis = await ensureWebRedisConnected();
  const raw = await redis.get(leadsKey(sessionId));
  if (!raw) return [];
  return JSON.parse(raw) as Lead[];
}

// ─── Results ──────────────────────────────────────────────────────────────

/**
 * Secondary index: video:{leadId} → VideoIndex
 * Allows /v/[id] short-link redirect to resolve a videoUrl without knowing sessionId.
 */
export interface VideoIndex {
  videoUrl: string;
  thumbnailUrl?: string;
  posterThumbnailUrl?: string;
  shortUrl: string;
  sessionId: string;
  leadId: string;
  slug?: string;
  name: string;
  website: string;
}

function videoIndexKey(leadId: string): string {
  return `video:${leadId}`;
}

export async function getVideoIndex(
  publicId: string,
): Promise<VideoIndex | null> {
  const leadId = await resolveLeadId(publicId);
  const redis = await ensureWebRedisConnected();
  const raw = await redis.get(videoIndexKey(leadId));
  if (!raw) return null;
  try {
    const index = JSON.parse(raw) as VideoIndex;
    if (!index.leadId) {
      index.leadId = leadId;
    }
    return index;
  } catch {
    return null;
  }
}

async function ensureLeadSlugs(leads: Lead[]): Promise<Lead[]> {
  const batchReserved = new Set<string>();
  const withSlugs: Lead[] = [];

  for (const lead of leads) {
    if (lead.slug) {
      batchReserved.add(lead.slug);
      await registerSlugMapping(lead.slug, lead.id);
      withSlugs.push(lead);
      continue;
    }

    const slug = await allocateUniqueSlug(lead.name, batchReserved);
    await registerSlugMapping(slug, lead.id);
    withSlugs.push({ ...lead, slug });
  }

  return withSlugs;
}

/**
 * Called by the worker to persist a single lead result.
 * Uses a Redis hash: results:{sessionId} → { [leadId]: JSON }
 *
 * When the lead completes successfully (status=done + public videoUrl):
 *  1. shortUrl is the public watch page (/v/[leadId]) for email links and CSV.
 *  2. videoUrl/thumbnailUrl remain direct Supabase assets for download and proxy.
 */
async function attachSlugFromSession(
  sessionId: string,
  result: LeadResult,
): Promise<LeadResult> {
  if (result.slug) return result;
  const leads = await getLeads(sessionId);
  const lead = leads.find((l) => l.id === result.id);
  return lead?.slug ? { ...result, slug: lead.slug } : result;
}

export async function setLeadResult(
  sessionId: string,
  result: LeadResult,
): Promise<void> {
  const redis = await ensureWebRedisConnected();

  let enriched = await attachSlugFromSession(sessionId, result);

  if (result.status === "done" && result.videoUrl?.startsWith("https://")) {
    if (result.slug) {
      await registerSlugMapping(result.slug, result.id);
    }
    const shortUrl = watchPageUrl({ id: result.id, slug: result.slug });
    const supabaseThumb = result.thumbnailUrl?.startsWith("https://")
      ? result.thumbnailUrl
      : undefined;
    const supabasePoster = result.posterThumbnailUrl?.startsWith("https://")
      ? result.posterThumbnailUrl
      : undefined;

    enriched = {
      ...result,
      shortUrl,
      thumbnailUrl: supabaseThumb,
      posterThumbnailUrl: supabasePoster,
    };

    const index: VideoIndex = {
      videoUrl: result.videoUrl,
      thumbnailUrl: supabaseThumb,
      posterThumbnailUrl: supabasePoster,
      shortUrl,
      sessionId,
      leadId: result.id,
      slug: result.slug,
      name: result.name,
      website: result.website,
    };
    await redis.set(
      videoIndexKey(result.id),
      JSON.stringify(index),
      "EX",
      TTL_SEC,
    );
  }

  await redis.hset(resultsKey(sessionId), enriched.id, JSON.stringify(enriched));
  await redis.expire(resultsKey(sessionId), TTL_SEC);
}

/** Fix legacy Redis rows (proxy thumbs, old /v/ short links on marketing domains). */
async function repairStoredResult(result: LeadResult): Promise<LeadResult> {
  let repaired = result;
  const index = await getVideoIndex(result.id);

  if (!repaired.slug && index?.slug) {
    repaired = { ...repaired, slug: index.slug };
  }

  const storedThumb = repaired.thumbnailUrl;
  if (storedThumb?.includes("/api/media/thumb")) {
    const supabase = index?.thumbnailUrl?.startsWith("https://")
      ? index.thumbnailUrl
      : undefined;
    repaired = {
      ...repaired,
      thumbnailUrl: supabase,
    };
  }

  const publicVideo =
    repaired.videoUrl?.startsWith("https://") ?
      repaired.videoUrl
    : index?.videoUrl?.startsWith("https://") ?
      index.videoUrl
    : undefined;

  const watch = watchPageUrl({ id: repaired.id, slug: repaired.slug ?? index?.slug });
  if (
    publicVideo &&
    (!repaired.shortUrl ||
      isLegacyShareUrl(repaired.shortUrl) ||
      repaired.shortUrl !== watch)
  ) {
    repaired = { ...repaired, shortUrl: watch, videoUrl: publicVideo };
  }

  return repaired;
}

export async function getAllResults(
  sessionId: string,
): Promise<LeadResult[]> {
  const redis = await ensureWebRedisConnected();
  const hash = await redis.hgetall(resultsKey(sessionId));
  if (!hash) return [];
  const results = Object.values(hash).map((v) => JSON.parse(v) as LeadResult);
  return Promise.all(results.map(repairStoredResult));
}

export async function getLeadResult(
  sessionId: string,
  leadId: string,
): Promise<LeadResult | null> {
  const redis = await ensureWebRedisConnected();
  const raw = await redis.hget(resultsKey(sessionId), leadId);
  if (!raw) return null;
  const result = JSON.parse(raw) as LeadResult;
  return repairStoredResult(result);
}

// ─── Job Checkpoints ──────────────────────────────────────────────────────
//
// Checkpoints let the pipeline resume from the last completed stage when a
// worker is killed mid-job and BullMQ hands the job to a new worker.
//
// Lifecycle:
//   1. After screenshot succeeds → setCheckpoint(…, 'screenshot_done', { screenshotPath })
//   2. After render succeeds    → setCheckpoint(…, 'render_done', { …, videoPath })
//   3. After upload succeeds    → clearCheckpoint (job marked 'done' in Redis results)
//
// On job retry, the processor reads the checkpoint, verifies the referenced
// files still exist on disk, and skips any stage that is already complete.

export interface LeadCheckpoint {
  stage: "screenshot_done" | "render_done";
  screenshotPath?: string;
  videoPath?: string;
  thumbPath?: string;
  emailThumbPath?: string;
  updatedAt: number;
}

function checkpointKey(sessionId: string, leadId: string): string {
  return `cp:${sessionId}:${leadId}`;
}

export async function setCheckpoint(
  sessionId: string,
  leadId: string,
  checkpoint: LeadCheckpoint,
): Promise<void> {
  const redis = await ensureWebRedisConnected();
  await redis.set(
    checkpointKey(sessionId, leadId),
    JSON.stringify(checkpoint),
    "EX",
    TTL_SEC,
  );
}

export async function getCheckpoint(
  sessionId: string,
  leadId: string,
): Promise<LeadCheckpoint | null> {
  const redis = await ensureWebRedisConnected();
  const raw = await redis.get(checkpointKey(sessionId, leadId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LeadCheckpoint;
  } catch {
    return null;
  }
}

export async function clearCheckpoint(
  sessionId: string,
  leadId: string,
): Promise<void> {
  const redis = await ensureWebRedisConnected();
  await redis.del(checkpointKey(sessionId, leadId));
}

// ─── Batch Health Summary ──────────────────────────────────────────────────
//
// Generated once the last lead in a batch reaches a terminal state (done|failed).
// Saved to Redis so it can be retrieved by the results API and logged for ops.

export interface BatchSummary {
  sessionId: string;
  totalLeads: number;
  successful: number;
  failed: number;
  avgRenderTimeMs: number;
  totalProcessingTimeMs: number;
  completedAt: number;
}

function summaryKey(sessionId: string): string {
  return `summary:${sessionId}`;
}

export async function saveBatchSummary(summary: BatchSummary): Promise<void> {
  const redis = await ensureWebRedisConnected();
  await redis.set(
    summaryKey(summary.sessionId),
    JSON.stringify(summary),
    "EX",
    TTL_SEC,
  );
}

export async function getBatchSummary(
  sessionId: string,
): Promise<BatchSummary | null> {
  const redis = await ensureWebRedisConnected();
  const raw = await redis.get(summaryKey(sessionId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BatchSummary;
  } catch {
    return null;
  }
}
