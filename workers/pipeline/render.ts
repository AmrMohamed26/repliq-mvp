import path from "path";
import fs from "fs/promises";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { renderOutputPath, ensureLeadDir, leadDir } from "@/lib/files";
import { env } from "@/lib/env";
import { getPngDimensions } from "@/lib/png-dimensions";
import { logger } from "@/lib/logger";
import { logScreenshotDebug } from "./screenshot-crop";
import { SCREENSHOT_VIEWPORT } from "./screenshot-viewport";
import {
  REMOTION_CRF,
  REMOTION_FRAME_CONCURRENCY,
} from "@/lib/render-settings";

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;
const COMPOSITION_ID = "LoomVideo";

// ── Bundle cache ─────────────────────────────────────────────────────────────
// Compile once per worker process — subsequent renders reuse the bundle.
let bundlePathCache: string | null = null;
let bundlingInFlight: Promise<string> | null = null;
const remotionPublicDir = path.join(env.TMP_DIR, "remotion-public");

/**
 * Returns the path to the compiled Remotion webpack bundle.
 * Concurrent callers wait on the same Promise — only one webpack build runs.
 */
async function getBundlePath(): Promise<string> {
  if (bundlePathCache) return bundlePathCache;
  if (bundlingInFlight) return bundlingInFlight;

  bundlingInFlight = (async () => {
    const entryPoint = path.resolve(process.cwd(), "remotion/index.ts");
    logger.info({ entryPoint }, "bundling Remotion composition (first run)…");

    await fs.mkdir(remotionPublicDir, { recursive: true });
    const result = await bundle({
      entryPoint,
      publicDir: remotionPublicDir,
      symlinkPublicDir: true,
    });
    bundlePathCache = result;
    bundlingInFlight = null;
    logger.info({ bundlePath: result }, "Remotion bundle ready");
    return result;
  })();

  return bundlingInFlight;
}

// ── Public-dir asset placement ───────────────────────────────────────────────
// Remotion's internal HTTP server rejects symlinked final files, so we copy
// per-lead assets into a configured public directory under unique names.
// staticFile() in the composition then resolves to regular files at render time.

function assetName(sessionId: string, leadId: string, suffix: string): string {
  return `${sessionId}-${leadId}-${suffix}`;
}

/**
 * Full-page Playwright PNGs (especially @2x DPR) can exceed what Remotion's
 * Chromium tab can decode. Normalize to a bounded 1920×1080 JPEG before render.
 */
async function prepareScreenshotForRender(
  sourcePath: string,
  sessionId: string,
  leadId: string,
): Promise<string> {
  const outPath = path.join(leadDir(sessionId, leadId), "screenshot-render.jpg");
  const { width: VW, height: VH } = SCREENSHOT_VIEWPORT;

  const sourceBuf = await fs.readFile(sourcePath);
  const sourceDims = getPngDimensions(sourceBuf);
  const tall =
    sourceDims != null && sourceDims.height > VH * 1.05;
  const vf = tall
    ? `crop=${Math.min(sourceDims!.width, VW)}:${VH}:0:0,scale=${VW}:${VH}`
    : `scale=${VW}:${VH}:force_original_aspect_ratio=decrease,pad=${VW}:${VH}:(ow-iw)/2:(oh-ih)/2:color=black`;

  logScreenshotDebug(
    "render.ts:prepareScreenshotForRender",
    "normalize for remotion",
    { sourcePath, sourceDims, tall, vf },
    "B",
  );

  await new Promise<void>((resolve, reject) => {
    ffmpeg(sourcePath)
      .outputOptions([
        "-vf",
        vf,
        "-frames:v",
        "1",
        "-update",
        "1",
        "-q:v",
        "2",
      ])
      .output(outPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });

  const stat = await fs.stat(outPath);
  if (stat.size < 1_000) {
    throw new Error(
      `screenshot normalization produced an invalid file (${stat.size} bytes)`,
    );
  }

  return outPath;
}

async function placeAsset(
  target: string,
  linkName: string,
): Promise<string> {
  await fs.mkdir(remotionPublicDir, { recursive: true });
  const linkPath = path.join(remotionPublicDir, linkName);
  // Remove stale copied file if it exists (e.g. from a crashed previous run)
  await fs.unlink(linkPath).catch(() => undefined);
  await fs.copyFile(target, linkPath);
  return linkPath;
}

// ── Main export ──────────────────────────────────────────────────────────────

export interface RenderInput {
  sessionId: string;
  leadId: string;
  screenshotPngPath: string;
  talkingHeadPath: string;
  leadName: string;
  durationSec: number;
}

/**
 * Renders one personalised Loom-style video per lead.
 *
 * Pipeline:
 *   1. Obtain (or lazily compile) the webpack bundle — cached per process.
 *   2. Symlink the screenshot and video into the bundle's public/ directory
 *      under unique per-lead names, so Remotion's internal server can serve
 *      them via staticFile().
 *   3. Call selectComposition() to evaluate calculateMetadata (gets the real
 *      durationInFrames from the durationSec prop).
 *   4. Render with H.264 (CRF from env), yuv420p.
 *   5. Remove the symlinks in a finally block.
 */
export async function renderVideo(input: RenderInput): Promise<string> {
  const { sessionId, leadId, screenshotPngPath, talkingHeadPath, leadName, durationSec } = input;

  await ensureLeadDir(sessionId, leadId);
  const outPath = renderOutputPath(sessionId, leadId);

  logger.info(
    {
      leadId,
      durationSec,
      remotionConcurrency: REMOTION_FRAME_CONCURRENCY,
      crf: REMOTION_CRF,
    },
    "renderVideo: starting Remotion render",
  );

  const bundlePath = await getBundlePath();

  const preparedScreenshot = await prepareScreenshotForRender(
    screenshotPngPath,
    sessionId,
    leadId,
  );

  const screenshotName = assetName(sessionId, leadId, "screenshot.jpg");
  const videoName = assetName(sessionId, leadId, "video.mp4");

  const screenshotLink = await placeAsset(preparedScreenshot, screenshotName);
  const videoLink = await placeAsset(talkingHeadPath, videoName);
  const [screenshotStat, videoStat] = await Promise.all([
    fs.lstat(screenshotLink),
    fs.lstat(videoLink),
  ]);


  try {
    const inputProps = {
      screenshotPath: screenshotName,
      talkingHeadPath: videoName,
      leadName,
      durationSec,
    };

    // selectComposition evaluates calculateMetadata → real durationInFrames
    const composition = await selectComposition({
      serveUrl: bundlePath,
      id: COMPOSITION_ID,
      inputProps,
      logLevel: "error",
    });

    await renderMedia({
      composition,
      serveUrl: bundlePath,
      codec: "h264",
      outputLocation: outPath,
      inputProps,
      crf: REMOTION_CRF,
      pixelFormat: "yuv420p",
      concurrency: REMOTION_FRAME_CONCURRENCY,
      logLevel: "error",
    });

    logger.info({ leadId, outPath }, "renderVideo: complete");
    return outPath;
  } finally {
    // Always clean up symlinks, even on failure
    await fs.unlink(screenshotLink).catch(() => undefined);
    await fs.unlink(videoLink).catch(() => undefined);
  }
}
