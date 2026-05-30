import Redis from "ioredis";
import { env } from "./env";
import { logger } from "./logger";

/**
 * Creates a fresh ioredis client configured for our env.
 * Used by both the Next.js process (queue producer, SSE, session reads)
 * and the worker process (queue consumer, progress publisher).
 *
 * Do NOT call this at module load-time in client components.
 */
export function createRedisClient(lazyConnect = false): Redis {
  const client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: lazyConnect ? 3 : null, // null required by BullMQ workers
    enableReadyCheck: false,
    lazyConnect,
    connectTimeout: 10_000,
    retryStrategy: lazyConnect
      ? (times) => (times > 3 ? null : Math.min(times * 200, 2_000))
      : undefined,
  });

  client.on("error", (err) => {
    logger.error({ err }, "Redis client error");
  });

  return client;
}

/** Singleton for the web process (session CRUD, SSE pub/sub). */
let _webClient: Redis | null = null;
export function getWebRedis(): Redis {
  if (!_webClient) {
    // lazyConnect — avoids blocking Next.js startup if Redis is down
    _webClient = createRedisClient(true);
  }
  return _webClient;
}

const WEB_REDIS_CONNECT_MS = 8_000;

/**
 * Serverless-safe: first Redis command must await connect or requests hang forever.
 */
export async function ensureWebRedisConnected(): Promise<Redis> {
  const redis = getWebRedis();
  if (redis.status === "ready") return redis;

  await Promise.race([
    redis.connect(),
    new Promise<never>((_, reject) => {
      setTimeout(
        () =>
          reject(
            new Error(
              "Redis connection timed out. Add REDIS_URL on Vercel (e.g. Upstash) and redeploy.",
            ),
          ),
        WEB_REDIS_CONNECT_MS,
      );
    }),
  ]);

  return redis;
}
