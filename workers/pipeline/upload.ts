import { uploadFile } from "@/lib/storage";
import { logger } from "@/lib/logger";

export interface UploadResult {
  videoUrl: string;
  /** Email outreach JPEG */
  thumbnailUrl: string;
  /** Watch page poster JPEG */
  posterThumbnailUrl: string;
}

interface WarnLogger {
  warn(obj: object, msg: string): void;
}

const UPLOAD_MAX_ATTEMPTS = 3;
const UPLOAD_BASE_DELAY_MS = 1_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

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

export async function uploadAssets(
  sessionId: string,
  leadId: string,
  videoPath: string,
  posterThumbPath: string,
  emailThumbPath: string,
): Promise<UploadResult> {
  const log = logger.child({ sessionId, leadId, stage: "upload" });

  const videoKey = `videos/${sessionId}/${leadId}.mp4`;
  const posterKey = `thumbs/${sessionId}/${leadId}-poster.jpg`;
  const emailKey = `thumbs/${sessionId}/${leadId}-email.jpg`;

  log.info({ videoKey, posterKey, emailKey, status: "starting" }, "uploading assets");

  const [videoUrl, posterThumbnailUrl, thumbnailUrl] = await Promise.all([
    withRetry(
      () => uploadFile(videoKey, videoPath, "video/mp4"),
      UPLOAD_MAX_ATTEMPTS,
      UPLOAD_BASE_DELAY_MS,
      "video upload",
      log,
    ),
    withRetry(
      () => uploadFile(posterKey, posterThumbPath, "image/jpeg"),
      UPLOAD_MAX_ATTEMPTS,
      UPLOAD_BASE_DELAY_MS,
      "poster thumbnail upload",
      log,
    ),
    withRetry(
      () => uploadFile(emailKey, emailThumbPath, "image/jpeg"),
      UPLOAD_MAX_ATTEMPTS,
      UPLOAD_BASE_DELAY_MS,
      "email thumbnail upload",
      log,
    ),
  ]);

  log.info(
    { videoUrl, posterThumbnailUrl, thumbnailUrl, status: "done" },
    "assets uploaded",
  );
  return { videoUrl, thumbnailUrl, posterThumbnailUrl };
}
