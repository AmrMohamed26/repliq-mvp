import path from "path";
import fs from "fs/promises";
import ffmpeg from "fluent-ffmpeg";
import { resolveFfmpegPath } from "@/lib/ffmpeg-bin";
import { sessionDir } from "@/lib/files";
import { logger } from "@/lib/logger";

ffmpeg.setFfmpegPath(resolveFfmpegPath());

/** Webcam overlay is 270px — 960w source is plenty and cuts decode/RAM cost. */
const MAX_WEBCAM_WIDTH = 960;
const MAX_OPTIMIZED_BYTES = 25 * 1024 * 1024;

async function fileExists(p: string): Promise<boolean> {
  return fs.access(p).then(() => true).catch(() => false);
}

function sessionRemotionPath(sessionId: string): string {
  return path.join(sessionDir(sessionId), "talking-remotion.mp4");
}

async function probeVideo(
  filePath: string,
): Promise<{ codec?: string; pixFmt?: string; width?: number; height?: number }> {
  const metadata = await new Promise<ffmpeg.FfprobeData>((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
  const video = metadata.streams.find((s) => s.codec_type === "video");
  return {
    codec: video?.codec_name,
    pixFmt: video?.pix_fmt,
    width: video?.width,
    height: video?.height,
  };
}

/**
 * One optimized talking-head per session (H.264, bounded resolution).
 * Reused across leads so Remotion decodes a small file and FFmpeg uses less RAM.
 */
export async function prepareTalkingHeadForRemotion(
  sourcePath: string,
  sessionId: string,
): Promise<string> {
  const cached = sessionRemotionPath(sessionId);
  if (await fileExists(cached)) return cached;

  const sourceStat = await fs.stat(sourcePath);
  if (sourceStat.size < 1_000) {
    throw new Error(
      `talking head file is too small (${sourceStat.size} bytes): ${sourcePath}`,
    );
  }

  const { codec, pixFmt, width } = await probeVideo(sourcePath);
  const browserSafe =
    codec === "h264" && (!pixFmt || pixFmt === "yuv420p");
  const smallEnough =
    browserSafe &&
    (width ?? 0) > 0 &&
    width! <= MAX_WEBCAM_WIDTH &&
    sourceStat.size <= MAX_OPTIMIZED_BYTES;

  // #region agent log
  fetch("http://127.0.0.1:7489/ingest/874f54e3-af15-42bb-a33a-e094f9419f9f", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "b8d92c",
    },
    body: JSON.stringify({
      sessionId: "b8d92c",
      runId: "sigkill-oom",
      hypothesisId: "H2",
      location: "talking-head-prepare.ts",
      message: "talking head probe",
      data: { sessionId, codec, pixFmt, width, bytes: sourceStat.size, smallEnough },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  if (smallEnough) {
    await fs.copyFile(sourcePath, cached);
    return cached;
  }

  await fs.mkdir(sessionDir(sessionId), { recursive: true });
  logger.info(
    { sessionId, codec, pixFmt, width, bytes: sourceStat.size },
    "optimizing talking head for Remotion (low memory)",
  );

  await new Promise<void>((resolve, reject) => {
    ffmpeg(sourcePath)
      .outputOptions([
        "-vf",
        `scale='min(${MAX_WEBCAM_WIDTH},iw)':-2`,
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-profile:v",
        "baseline",
        "-preset",
        "ultrafast",
        "-crf",
        "28",
        "-c:a",
        "aac",
        "-b:a",
        "96k",
        "-movflags",
        "+faststart",
      ])
      .output(cached)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });

  const outStat = await fs.stat(cached);
  if (outStat.size < 1_000) {
    throw new Error(
      `talking head optimize produced invalid file (${outStat.size} bytes)`,
    );
  }
  return cached;
}
