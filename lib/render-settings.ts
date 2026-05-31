import { env } from "@/lib/env";

/** Shared render dimensions (must match remotion/Root.tsx composition). */
export const RENDER_WIDTH = env.RENDER_WIDTH;
export const RENDER_HEIGHT = env.RENDER_HEIGHT;
export const RENDER_FPS = env.RENDER_FPS;

/** Remotion frame parallelism per lead (keep low if WORKER_CONCURRENCY is high). */
export const REMOTION_FRAME_CONCURRENCY = env.RENDER_CONCURRENCY;

/** H.264 quality — 18 = near-lossless, 20 = balanced, 23+ = faster/smaller. */
export const REMOTION_CRF = env.REMOTION_CRF;

/** 1 = full 1920×1080; use 0.75 on Railway to avoid FFmpeg SIGKILL (OOM). */
export const REMOTION_SCALE = env.REMOTION_SCALE;

/** Cap offthread video cache — default Remotion cache is hundreds of MB. */
export const REMOTION_OFFTHREAD_CACHE_BYTES = 28 * 1024 * 1024;
