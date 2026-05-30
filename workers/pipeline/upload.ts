import { uploadFile } from "@/lib/storage";
import { logger } from "@/lib/logger";

export interface UploadResult {
  videoUrl: string;
  thumbnailUrl: string;
}

interface WarnLogger {
  warn(obj: object, msg: string): void;
}

const UPLOAD_MAX_ATTEMPTS = 3;
const UPLOAD_BASE_DELAY_MS = 1_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Retries an async operation up to `maxAttempts` times with exponential backoff.
 * Delay sequence: baseMs, 2*baseMs, 4*baseMs … capped at 30 s.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number,
  baseMs: number,
  label: string,
  log: WarnLogger,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(baseMs * 2 ** attempt, 30_000);
      log.warn(
        { attempt: attempt + 1, maxAttempts, delay, label, status: "retrying" },
        "upload retry",
      );
      await sleep(delay);
    }
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      log.warn(
        { attempt: attempt + 1, maxAttempts, label, status: "failed", err },
        "upload attempt failed",
      );
    }
  }
  throw new Error(
    `${label} failed after ${maxAttempts} attempt(s): ${String(lastError)}`,
  );
}

/**
 * Uploads the rendered video + thumbnail through the storage abstraction.
 *
 * Each asset is retried independently — video and thumbnail can fail and
 * recover separately (storage provider transient failures).
 *
 * Retry strategy: 3 attempts, exponential backoff (1 s, 2 s, 4 s).
 *
 * Returns public HTTPS URLs only. Provider config errors are surfaced as
 * per-lead failures so CSV exports never contain internal/local paths.
 */
export async function uploadAssets(
  sessionId: string,
  leadId: string,
  videoPath: string,
  thumbPath: string,
): Promise<UploadResult> {
  const log = logger.child({ sessionId, leadId, stage: "upload" });

  const videoKey = `videos/${sessionId}/${leadId}.mp4`;
  const thumbKey = `thumbs/${sessionId}/${leadId}.jpg`;

  log.info({ videoKey, thumbKey, status: "starting" }, "uploading assets to storage");

  const [videoUrl, thumbnailUrl] = await Promise.all([
    withRetry(
      () => uploadFile(videoKey, videoPath, "video/mp4"),
      UPLOAD_MAX_ATTEMPTS,
      UPLOAD_BASE_DELAY_MS,
      "video upload",
      log,
    ),
    withRetry(
      () => uploadFile(thumbKey, thumbPath, "image/jpeg"),
      UPLOAD_MAX_ATTEMPTS,
      UPLOAD_BASE_DELAY_MS,
      "thumbnail upload",
      log,
    ),
  ]);

  log.info({ videoUrl, thumbnailUrl, status: "done" }, "assets uploaded");
  return { videoUrl, thumbnailUrl };
}
