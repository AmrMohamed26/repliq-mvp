import ffmpeg from "fluent-ffmpeg";
import ffprobeStatic from "ffprobe-static";
import { logger } from "./logger";
import {
  VIDEO_MIN_DURATION_SEC,
  VIDEO_MAX_DURATION_SEC,
} from "./validators";

// Wire the static ffprobe binary bundled with ffprobe-static
if (ffprobeStatic?.path) {
  ffmpeg.setFfprobePath(ffprobeStatic.path);
}

/**
 * Probes a video file on disk and returns its duration in seconds.
 *
 * Validates the duration falls within the allowed range defined in validators.ts.
 * Throws a human-readable error if out of range.
 */
export async function probeDuration(filePath: string): Promise<number> {
  const metadata = await new Promise<ffmpeg.FfprobeData>((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) {
        reject(
          new Error(
            `ffprobe failed for "${filePath}": ${err.message}`,
          ),
        );
      } else {
        resolve(data);
      }
    });
  });

  const durationSec = metadata.format.duration ?? 0;
  logger.debug({ filePath, durationSec }, "probed video duration");

  if (durationSec < VIDEO_MIN_DURATION_SEC) {
    throw new Error(
      `Video is too short (${durationSec.toFixed(1)} s). ` +
        `Minimum: ${VIDEO_MIN_DURATION_SEC} s`,
    );
  }
  if (durationSec > VIDEO_MAX_DURATION_SEC) {
    throw new Error(
      `Video is too long (${durationSec.toFixed(1)} s). ` +
        `Maximum: ${VIDEO_MAX_DURATION_SEC} s (${VIDEO_MAX_DURATION_SEC / 60} min)`,
    );
  }

  return durationSec;
}
