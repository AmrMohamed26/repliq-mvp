import { unlink, rename } from "node:fs/promises";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import { thumbnailPath } from "@/lib/files";
import { logger } from "@/lib/logger";

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

const THUMBNAIL_RETRIES = 2;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Email outreach width — keeps JPEG small for Gmail image proxy. */
const EMAIL_THUMB_WIDTH = 360;

function runThumbnail(videoPath: string, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .outputOptions([
        "-ss 00:00:01",
        "-frames:v 1",
        `-vf scale=${EMAIL_THUMB_WIDTH}:-2`,
        "-q:v 4",
        "-f image2",
      ])
      .output(outPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });
}

/**
 * Burns a white play badge into the JPEG (ffmpeg draw filters only — no SVG;
 * ffmpeg-static does not ship an SVG decoder).
 */
export async function addPlayBadgeToThumbnail(
  thumbPath: string,
  log?: { warn: (obj: object, msg: string) => void },
): Promise<void> {
  const outPath = `${thumbPath}.badged.jpg`;
  const vf = [
    "drawbox=x=(iw-56)/2:y=(ih-56)/2:w=56:h=56:color=white@0.92:t=fill",
    "drawtext=text='>':fontsize=28:fontcolor=black:x=(w-text_w)/2+4:y=(h-text_h)/2",
  ].join(",");

  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(thumbPath)
        .outputOptions(["-vf", vf, "-q:v", "2", "-frames:v", "1"])
        .output(outPath)
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .run();
    });
    await rename(outPath, thumbPath);
  } catch (err) {
    await unlink(outPath).catch(() => undefined);
    log?.warn(
      { err, thumbPath },
      "play badge overlay failed — using plain thumbnail",
    );
  }
}

/**
 * Extracts a JPEG thumbnail from the rendered MP4 at the 1-second mark,
 * then composites a play badge for email outreach.
 */
export async function extractThumbnail(
  sessionId: string,
  leadId: string,
  videoPath: string,
): Promise<string> {
  const outPath = thumbnailPath(sessionId, leadId);
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
      await runThumbnail(videoPath, outPath);
      await addPlayBadgeToThumbnail(outPath, log);
      log.info({ outPath, attempt, status: "done" }, "thumbnail extracted");
      return outPath;
    } catch (err) {
      lastError = err;
      log.warn({ attempt, status: "failed", err }, "thumbnail attempt failed");
    }
  }

  throw new Error(
    `thumbnail extraction failed after ${THUMBNAIL_RETRIES + 1} attempt(s): ${String(lastError)}`,
  );
}
