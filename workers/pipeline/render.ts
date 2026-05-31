import path from "path";
import fs from "fs/promises";
import ffmpeg from "fluent-ffmpeg";
import { resolveFfmpegPath } from "@/lib/ffmpeg-bin";
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
  REMOTION_SCALE,
  REMOTION_OFFTHREAD_CACHE_BYTES,
} from "@/lib/render-settings";

ffmpeg.setFfmpegPath(resolveFfmpegPath());

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
async function readPrebuiltBundlePath(): Promise<string | null> {
  const fromEnv = process.env.REMOTION_BUNDLE_PATH?.trim();
  if (fromEnv) {
    try {
      await fs.access(fromEnv);
      return fromEnv;
    } catch {
      logger.warn({ fromEnv }, "REMOTION_BUNDLE_PATH missing on disk");
    }
  }
  const marker = path.join(process.cwd(), ".remotion-bundle-path");
  try {
    const p = (await fs.readFile(marker, "utf8")).trim();
    if (p) {
      await fs.access(p);
      return p;
    }
  } catch {
    /* no prebuilt bundle */
  }
  return null;
}

async function getBundlePath(): Promise<string> {
  if (bundlePathCache) return bundlePathCache;
  if (bundlingInFlight) return bundlingInFlight;

  const prebuilt = await readPrebuiltBundlePath();
  if (prebuilt) {
    bundlePathCache = prebuilt;
    logger.info({ bundlePath: prebuilt }, "using prebuilt Remotion bundle");
    return prebuilt;
  }

  bundlingInFlight = (async () => {
    const entryPoint = path.resolve(process.cwd(), "remotion/index.ts");
    logger.info({ entryPoint }, "bundling Remotion composition (first run)…");
    // #region agent log
    fetch("http://127.0.0.1:7489/ingest/874f54e3-af15-42bb-a33a-e094f9419f9f", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "b8d92c",
      },
      body: JSON.stringify({
        sessionId: "b8d92c",
        runId: "render-stuck",
        hypothesisId: "H1",
        location: "render.ts:getBundlePath",
        message: "runtime webpack bundle start",
        data: { entryPoint },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    await fs.mkdir(remotionPublicDir, { recursive: true });
    let lastBundlePct = -1;
    const result = await bundle({
      entryPoint,
      publicDir: remotionPublicDir,
      outDir: path.join(env.TMP_DIR, "remotion-webpack"),
      symlinkPublicDir: true,
      onProgress: (p) => {
        const pct = Math.floor(p * 100);
        if (pct >= lastBundlePct + 25) {
          lastBundlePct = pct;
          logger.info({ progress: pct }, "Remotion bundle progress");
        }
      },
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

/**
 * Prebuilt Docker bundles symlink `public/` → `/app/tmp/remotion-public`.
 * Runtime must copy assets into that directory, not `TMP_DIR/remotion-public`.
 */
async function resolveBundlePublicDir(bundlePath: string): Promise<string> {
  const publicEntry = path.join(bundlePath, "public");
  try {
    const resolved = await fs.realpath(publicEntry);
    await fs.mkdir(resolved, { recursive: true });
    return resolved;
  } catch {
    await fs.mkdir(remotionPublicDir, { recursive: true });
    return remotionPublicDir;
  }
}

async function placeAsset(
  publicDir: string,
  target: string,
  linkName: string,
): Promise<string> {
  await fs.mkdir(publicDir, { recursive: true });
  const destPath = path.join(publicDir, linkName);
  await fs.unlink(destPath).catch(() => undefined);
  await fs.copyFile(target, destPath);
  return destPath;
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
  const publicDir = await resolveBundlePublicDir(bundlePath);

  // #region agent log
  fetch("http://127.0.0.1:7489/ingest/874f54e3-af15-42bb-a33a-e094f9419f9f", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "b8d92c",
    },
    body: JSON.stringify({
      sessionId: "b8d92c",
      runId: "video-playback",
      hypothesisId: "H1",
      location: "render.ts:renderVideo",
      message: "remotion public dir resolved",
      data: { leadId, bundlePath, publicDir, tmpPublicDir: remotionPublicDir },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  const preparedScreenshot = await prepareScreenshotForRender(
    screenshotPngPath,
    sessionId,
    leadId,
  );
  const screenshotName = assetName(sessionId, leadId, "screenshot.jpg");
  const videoName = assetName(sessionId, leadId, "video.mp4");

  const screenshotLink = await placeAsset(
    publicDir,
    preparedScreenshot,
    screenshotName,
  );
  const videoLink = await placeAsset(publicDir, talkingHeadPath, videoName);
  const [screenshotStat, videoStat] = await Promise.all([
    fs.lstat(screenshotLink),
    fs.lstat(videoLink),
  ]);

  if (videoStat.size < 1_000) {
    throw new Error(
      `Remotion public video asset is empty (${videoStat.size} bytes at ${videoLink})`,
    );
  }
  logger.info(
    {
      leadId,
      publicDir,
      screenshotBytes: screenshotStat.size,
      videoBytes: videoStat.size,
    },
    "render assets placed in bundle public dir",
  );


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

    const mem = process.memoryUsage();
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
        hypothesisId: "H1",
        location: "render.ts:renderMedia",
        message: "memory before remotion render",
        data: {
          leadId,
          rssMb: Math.round(mem.rss / 1024 / 1024),
          heapMb: Math.round(mem.heapUsed / 1024 / 1024),
          remotionScale: REMOTION_SCALE,
          frameConcurrency: REMOTION_FRAME_CONCURRENCY,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    let lastRenderPct = -1;
    let lastDebugPct = -1;
    const renderPromise = renderMedia({
      composition,
      serveUrl: bundlePath,
      codec: "h264",
      outputLocation: outPath,
      inputProps,
      crf: REMOTION_CRF,
      pixelFormat: "yuv420p",
      concurrency: REMOTION_FRAME_CONCURRENCY,
      scale: REMOTION_SCALE,
      disallowParallelEncoding: true,
      offthreadVideoThreads: 1,
      offthreadVideoCacheSizeInBytes: REMOTION_OFFTHREAD_CACHE_BYTES,
      x264Preset: "ultrafast",
      logLevel: "error",
      onProgress: ({ progress }) => {
        const pct = Math.round(progress * 100);
        if (pct >= lastRenderPct + 10) {
          lastRenderPct = pct;
          logger.info({ leadId, renderPct: pct }, "Remotion render progress");
        }
        // #region agent log
        if (pct >= 25 && pct % 25 === 0 && pct > lastDebugPct) {
          lastDebugPct = pct;
          fetch(
            "http://127.0.0.1:7489/ingest/874f54e3-af15-42bb-a33a-e094f9419f9f",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Debug-Session-Id": "b8d92c",
              },
              body: JSON.stringify({
                sessionId: "b8d92c",
                runId: "render-stuck",
                hypothesisId: "H2",
                location: "render.ts:renderMedia",
                message: "render progress",
                data: { leadId, pct },
                timestamp: Date.now(),
              }),
            },
          ).catch(() => {});
        }
        // #endregion
      },
    });

    const timeoutMs = env.RENDER_TIMEOUT_MS;
    await Promise.race([
      renderPromise,
      new Promise<never>((_, reject) => {
        setTimeout(
          () =>
            reject(
              new Error(
                `Remotion render timed out after ${Math.round(timeoutMs / 60_000)} minutes`,
              ),
            ),
          timeoutMs,
        );
      }),
    ]);

    logger.info({ leadId, outPath }, "renderVideo: complete");
    return outPath;
  } finally {
    // Always clean up symlinks, even on failure
    await fs.unlink(screenshotLink).catch(() => undefined);
    await fs.unlink(videoLink).catch(() => undefined);
  }
}
