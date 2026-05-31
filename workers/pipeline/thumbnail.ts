import { unlink } from "node:fs/promises";
import ffmpeg from "fluent-ffmpeg";
import { resolveFfmpegPath } from "@/lib/ffmpeg-bin";
import { leadDir, posterThumbnailPath, emailThumbnailPath } from "@/lib/files";
import { logger } from "@/lib/logger";

ffmpeg.setFfmpegPath(resolveFfmpegPath());

const THUMBNAIL_RETRIES = 2;

/** Watch page / video poster — sharp when scaled up. */
const POSTER_THUMB_WIDTH = 1280;
/** Email + copy preview display width (image is 2× for retina). */
const EMAIL_THUMB_WIDTH = 720;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function extractFrame(
  videoPath: string,
  outPath: string,
  width: number,
  quality: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .outputOptions([
        "-ss 00:00:01",
        "-frames:v 1",
        `-vf scale=${width}:-2`,
        "-q:v",
        String(quality),
        "-f image2",
      ])
      .output(outPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });
}

export interface ThumbnailPaths {
  posterPath: string;
  emailPath: string;
}

/**
 * Extracts poster (1280w, no overlay) and email (720w, no overlay) JPEGs.
 * Play icons are added in the UI / email HTML — not burned into the image.
 */
export async function extractThumbnail(
  sessionId: string,
  leadId: string,
  videoPath: string,
): Promise<ThumbnailPaths> {
  const posterPath = posterThumbnailPath(sessionId, leadId);
  const emailPath = emailThumbnailPath(sessionId, leadId);
  const log = logger.child({ sessionId, leadId, stage: "thumbnail" });

  let lastError: unknown;
  for (let attempt = 0; attempt <= THUMBNAIL_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(1_000 * 2 ** attempt, 8_000);
      log.warn(
        { attempt, delay, status: "retrying" },
        "thumbnail extraction failed — retrying",
      );
      await sleep(delay);
    }

    try {
      await extractFrame(videoPath, posterPath, POSTER_THUMB_WIDTH, 2);
      await extractFrame(videoPath, emailPath, EMAIL_THUMB_WIDTH, 3);
      log.info(
        { posterPath, emailPath, attempt, status: "done" },
        "thumbnails extracted",
      );
      return { posterPath, emailPath };
    } catch (err) {
      lastError = err;
      await unlink(posterPath).catch(() => undefined);
      await unlink(emailPath).catch(() => undefined);
      log.warn({ attempt, status: "failed", err }, "thumbnail attempt failed");
    }
  }

  throw new Error(
    `thumbnail extraction failed after ${THUMBNAIL_RETRIES + 1} attempt(s): ${String(lastError)}`,
  );
}
