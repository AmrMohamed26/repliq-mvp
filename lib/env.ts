import { z } from "zod";

const emptyStringToUndefined = (value: unknown) =>
  value === "" ? undefined : value;

/** Zod `.url()` rejects redis:// and rediss:// — validate Redis connection strings explicitly. */
const redisUrlSchema = z
  .string()
  .refine((v) => /^rediss?:\/\/.+/i.test(v), {
    message: "REDIS_URL must start with redis:// or rediss://",
  })
  .default("redis://localhost:6379");

const serverSchema = z.object({
  REDIS_URL: redisUrlSchema,
  SUPABASE_URL: z.preprocess(
    emptyStringToUndefined,
    z.string().url().optional(),
  ),
  SUPABASE_SERVICE_ROLE_KEY: z.preprocess(
    emptyStringToUndefined,
    z.string().optional(),
  ),
  SUPABASE_BUCKET: z.preprocess(
    emptyStringToUndefined,
    z.string().default("repliq-mvp"),
  ),
  SUPABASE_PUBLIC_BASE_URL: z.preprocess(
    emptyStringToUndefined,
    z.string().url().optional(),
  ),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().max(8).default(2),
  PLAYWRIGHT_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  PLAYWRIGHT_RETRIES: z.coerce.number().int().min(0).default(2),
  RENDER_FPS: z.coerce.number().int().positive().default(30),
  RENDER_WIDTH: z.coerce.number().int().positive().default(1920),
  RENDER_HEIGHT: z.coerce.number().int().positive().default(1080),
  /** Parallel frames per Remotion render (2 is safe on 8GB+ machines). */
  RENDER_CONCURRENCY: z.coerce.number().int().positive().max(6).default(2),
  /** H.264 CRF — 18 = highest quality, 20 = balanced speed/quality. */
  REMOTION_CRF: z.coerce.number().int().min(18).max(28).default(20),
  /** Max ms for one Remotion renderMedia call (Railway needs headroom for bundle + encode). */
  RENDER_TIMEOUT_MS: z.coerce.number().int().positive().default(1_200_000),
  TMP_DIR: z.string().default("/tmp/repliq"),
  SCRAPINGBEE_API_KEY: z.preprocess(
    emptyStringToUndefined,
    z.string().optional(),
  ),
  ZENROWS_API_KEY: z.preprocess(emptyStringToUndefined, z.string().optional()),
  /** auto | scrapingbee | zenrows — order for Upwork/LinkedIn screenshot APIs */
  SCREENSHOT_PROVIDER: z.preprocess(
    emptyStringToUndefined,
    z.enum(["auto", "scrapingbee", "zenrows"]).default("auto"),
  ),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
});

const clientSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().default("Repliq"),
  NEXT_PUBLIC_APP_URL: z.preprocess(
    emptyStringToUndefined,
    z.string().url().optional(),
  ),
});

/**
 * Server-side env. Only safe to import in server contexts (route handlers,
 * server components, workers).
 */
const serverEnvInput = {
  REDIS_URL: process.env.REDIS_URL,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_BUCKET: process.env.SUPABASE_BUCKET,
  SUPABASE_PUBLIC_BASE_URL: process.env.SUPABASE_PUBLIC_BASE_URL,
  WORKER_CONCURRENCY: process.env.WORKER_CONCURRENCY,
  PLAYWRIGHT_TIMEOUT_MS: process.env.PLAYWRIGHT_TIMEOUT_MS,
  PLAYWRIGHT_RETRIES: process.env.PLAYWRIGHT_RETRIES,
  RENDER_FPS: process.env.RENDER_FPS,
  RENDER_WIDTH: process.env.RENDER_WIDTH,
  RENDER_HEIGHT: process.env.RENDER_HEIGHT,
  RENDER_CONCURRENCY: process.env.RENDER_CONCURRENCY,
  REMOTION_CRF: process.env.REMOTION_CRF,
  RENDER_TIMEOUT_MS: process.env.RENDER_TIMEOUT_MS,
  TMP_DIR: process.env.TMP_DIR,
  SCRAPINGBEE_API_KEY: process.env.SCRAPINGBEE_API_KEY,
  ZENROWS_API_KEY: process.env.ZENROWS_API_KEY,
  SCREENSHOT_PROVIDER: process.env.SCREENSHOT_PROVIDER,
  LOG_LEVEL: process.env.LOG_LEVEL,
};

export const env = serverSchema.parse(serverEnvInput);

export const publicEnv = clientSchema.parse({
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});

export type ServerEnv = typeof env;
export type PublicEnv = typeof publicEnv;
