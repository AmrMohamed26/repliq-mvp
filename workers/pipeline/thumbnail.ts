import { unlink } from "node:fs/promises";
import ffmpeg from "fluent-ffmpeg";
import { resolveFfmpegPath } from "@/lib/ffmpeg-bin";
import { leadDir, posterThumbnailPath, emailThumbnailPath } from "@/lib/files";
import { logger } from "@/lib/logger";
import {
  RENDER_HEIGHT,
  RENDER_WIDTH,
  REMOTION_SCALE,
} from "@/lib/render-settings";

ffmpeg.setFfmpegPath(resolveFfmpegPath());

const THUMBNAIL_RETRIES = 2;

/**
 * Watch page layout is max 960px wide (VideoPlayer sizes). Retina (~2×) needs ~1920px
 * source; Railway REMOTION_SCALE=0.75 renders video at 1440×810 only — poster must
 * export at full composition size (upscale in ffmpeg) so the browser is not upscaling
 * a 1440px file to ~1920 device pixels.
 */
const WATCH_POSTER_LAYOUT_MAX_PX = 960;
const POSTER_THUMB_WIDTH = Math.min(
  RENDER_WIDTH,
  Math.max(
    Math.round(RENDER_WIDTH * REMOTION_SCALE),
    WATCH_POSTER_LAYOUT_MAX_PX * 2,
  ),
);
const POSTER_THUMB_HEIGHT = Math.round(
  (POSTER_THUMB_WIDTH * RENDER_HEIGHT) / RENDER_WIDTH,
);
/** Email display 360px — export 2× for retina. */
const EMAIL_THUMB_WIDTH = 720;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function extractFrame(
  videoPath: string,
  outPath: string,
  width: number,
  height: number | null,
  quality: number,
): Promise<void> {
  const scale =
    height != null
      ? `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,format=yuv420p`
      : `scale=${width}:-2:flags=lanczos`;

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .outputOptions([
        "-ss 00:00:01",
        "-frames:v 1",
        "-vf",
        scale,
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
 * Extracts full-resolution poster and 2× email JPEGs (no baked play icon).
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
      await extractFrame(
        videoPath,
        posterPath,
        POSTER_THUMB_WIDTH,
        POSTER_THUMB_HEIGHT,
        1,
      );
      await extractFrame(videoPath, emailPath, EMAIL_THUMB_WIDTH, null, 2);
      log.info(
        {
          posterPath,
          emailPath,
          attempt,
          posterW: POSTER_THUMB_WIDTH,
          posterH: POSTER_THUMB_HEIGHT,
          renderScale: REMOTION_SCALE,
          status: "done",
        },
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
