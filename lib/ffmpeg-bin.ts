import { accessSync, constants } from "node:fs";
import ffmpegStatic from "ffmpeg-static";

function pathExists(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** FFmpeg binary for fluent-ffmpeg (Docker sets FFMPEG_BIN when npm install scripts are skipped). */
export function resolveFfmpegPath(): string {
  const fromEnv = process.env.FFMPEG_BIN?.trim();
  if (fromEnv && pathExists(fromEnv)) return fromEnv;

  if (ffmpegStatic && pathExists(ffmpegStatic)) return ffmpegStatic;

  const fallbacks = ["/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg"];
  for (const p of fallbacks) {
    if (pathExists(p)) return p;
  }

  throw new Error(
    "FFmpeg not found. On Railway/Docker set FFMPEG_BIN=/usr/bin/ffmpeg or run node node_modules/ffmpeg-static/install.js after npm ci.",
  );
}
