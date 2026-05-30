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
