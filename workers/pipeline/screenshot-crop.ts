import { readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import ffmpeg from "fluent-ffmpeg";
import { resolveFfmpegPath } from "@/lib/ffmpeg-bin";
import { getPngDimensions } from "@/lib/png-dimensions";
import { SCREENSHOT_VIEWPORT } from "./screenshot-viewport";

ffmpeg.setFfmpegPath(resolveFfmpegPath());

const { width: VW, height: VH } = SCREENSHOT_VIEWPORT;

/**
 * ScrapingBee (especially with session cookies) can return very tall PNGs.
 * Keep only the top viewport region so the video slide shows a normal browser
 * view, not a miniature full-page poster.
 */
export async function cropScreenshotToViewport(pngPath: string): Promise<{
  width: number;
  height: number;
  cropped: boolean;
}> {
  const buf = await readFile(pngPath);
  const dims = getPngDimensions(buf);
  if (!dims) {
    return { width: 0, height: 0, cropped: false };
  }

  const tall = dims.height > VH * 1.05;
  const wide = dims.width > VW * 1.05;
  if (!tall && !wide) {
    return { ...dims, cropped: false };
  }

  const cropW = Math.min(dims.width, VW);
  const cropH = Math.min(dims.height, VH);
  const tmp = `${pngPath}.crop-tmp.png`;

  await new Promise<void>((resolve, reject) => {
    ffmpeg(pngPath)
      .outputOptions([
        "-vf",
        `crop=${cropW}:${cropH}:0:0,scale=${VW}:${VH}`,
        "-frames:v",
        "1",
      ])
      .output(tmp)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });

  await writeFile(pngPath, await readFile(tmp));
  await unlink(tmp).catch(() => undefined);

  return { width: VW, height: VH, cropped: true };
}

export function logScreenshotDebug(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
  runId = "pre-fix",
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
      runId,
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}
