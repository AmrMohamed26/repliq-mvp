import Redis from "ioredis";
import { env } from "./env";
import { logger } from "./logger";

const WEB_REDIS_CONNECT_MS = 8_000;

const globalRedis = globalThis as typeof globalThis & {
  __repliqWebRedis?: Redis;
};

function debugRedisLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
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
      runId: "redis-serverless",
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}

function redisNeedsTls(url: string, hostname: string): boolean {
  if (/^rediss:\/\//i.test(url)) return true;
  // Upstash requires TLS even when the URL scheme is redis:// (redis-cli --tls).
  return hostname.endsWith(".upstash.io");
}

function redisUrlMeta(): { usesTls: boolean; hostHint: string } {
  try {
    const u = new URL(
      env.REDIS_URL.replace(/^redis:\/\//i, "http://").replace(
        /^rediss:\/\//i,
        "https://",
      ),
    );
    return {
      usesTls: redisNeedsTls(env.REDIS_URL, u.hostname),
      hostHint: u.hostname,
    };
  } catch {
    return {
      usesTls: /^rediss:\/\//i.test(env.REDIS_URL),
      hostHint: "invalid",
    };
  }
}

/**
 * BullMQ workers / SSE subscribers — long-lived connections.
 * maxRetriesPerRequest: null is required by BullMQ.
 */
export function createRedisClient(lazyConnect = false): Redis {
  const { usesTls } = redisUrlMeta();
  const client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: lazyConnect ? 3 : null,
    enableReadyCheck: false,
    lazyConnect,
    connectTimeout: 10_000,
    ...(usesTls ? { tls: {} } : {}),
    retryStrategy: lazyConnect
      ? (times) => (times > 3 ? null : Math.min(times * 200, 2_000))
      : undefined,
  });

  client.on("error", (err) => {
    logger.error({ err }, "Redis client error");
  });

  return client;
}

/** Vercel serverless — fresh client when the previous socket was closed. */
function createWebRedisClient(): Redis {
  const { usesTls } = redisUrlMeta();
  const client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: false,
    lazyConnect: true,
    connectTimeout: 10_000,
    ...(usesTls ? { tls: {} } : {}),
    retryStrategy: (times) =>
      times > 4 ? null : Math.min(times * 200, 2_000),
  });

  client.on("error", (err) => {
    logger.error({ err }, "Redis web client error");
  });

  client.on("close", () => {
    debugRedisLog(
      "lib/redis.ts:webClient",
      "web redis connection closed",
      { status: client.status },
      "H1",
    );
  });

  return client;
}

let _webClient: Redis | null = null;
let _webConnectPromise: Promise<Redis> | null = null;

function resetWebRedisClient(): void {
  _webClient = null;
  globalRedis.__repliqWebRedis = undefined;
  _webConnectPromise = null;
}

function isRedisInFlight(status: Redis["status"]): boolean {
  return (
    status === "connecting" ||
    status === "connect" ||
    status === "reconnecting"
  );
}

function canStartConnect(status: Redis["status"]): boolean {
  return status === "wait" || status === "end";
}

export function getWebRedis(): Redis {
  const existing = _webClient ?? globalRedis.__repliqWebRedis;
  if (existing && existing.status !== "end" && existing.status !== "close") {
    return existing;
  }

  if (existing) {
    debugRedisLog(
      "lib/redis.ts:getWebRedis",
      "discarding closed web redis client",
      { priorStatus: existing.status },
      "H1",
    );
    try {
      existing.disconnect(false);
    } catch {
      /* ignore */
    }
  }

  const client = createWebRedisClient();
  _webClient = client;
  globalRedis.__repliqWebRedis = client;
  return client;
}

function waitForRedisReady(redis: Redis, ms: number): Promise<void> {
  if (redis.status === "ready") return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          "Redis connection timed out. On Vercel use Upstash REDIS_URL (rediss://…) in environment variables.",
        ),
      );
    }, ms);

    const onReady = () => {
      clearTimeout(timer);
      redis.off("error", onError);
      resolve();
    };
    const onError = (err: Error) => {
      clearTimeout(timer);
      redis.off("ready", onReady);
      reject(err);
    };

    redis.once("ready", onReady);
    redis.once("error", onError);
  });
}

function connectTimeoutError(): Error {
  return new Error(
    "Redis connection timed out. Add REDIS_URL on Vercel (Upstash rediss:// URL) and redeploy.",
  );
}

async function connectWebRedis(redis: Redis, depth: number): Promise<Redis> {
  if (redis.status === "ready") {
    return redis;
  }

  if (redis.status === "end" || redis.status === "close") {
    resetWebRedisClient();
    return ensureWebRedisConnected(depth + 1);
  }

  if (isRedisInFlight(redis.status)) {
    await waitForRedisReady(redis, WEB_REDIS_CONNECT_MS);
    return redis;
  }

  if (!canStartConnect(redis.status)) {
    await waitForRedisReady(redis, WEB_REDIS_CONNECT_MS);
    return redis;
  }

  try {
    await Promise.race([
      redis.connect(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(connectTimeoutError()), WEB_REDIS_CONNECT_MS);
      }),
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    if (/already connecting\/connected/i.test(msg)) {
      await waitForRedisReady(redis, WEB_REDIS_CONNECT_MS);
      return redis;
    }

    resetWebRedisClient();

    if (
      depth < 2 &&
      (msg.includes("Connection is closed") ||
        msg.includes("ECONNRESET") ||
        msg.includes("ENOTCONN"))
    ) {
      return ensureWebRedisConnected(depth + 1);
    }

    throw err instanceof Error ? err : new Error(msg);
  }

  await waitForRedisReady(redis, WEB_REDIS_CONNECT_MS);
  return redis;
}

/**
 * Serverless-safe: one in-flight connect per isolate; wait instead of double .connect().
 */
export async function ensureWebRedisConnected(
  depth = 0,
): Promise<Redis> {
  if (depth > 2) {
    throw new Error("Redis could not reconnect after multiple attempts");
  }

  const redis = getWebRedis();
  const meta = redisUrlMeta();

  debugRedisLog(
    "lib/redis.ts:ensureWebRedisConnected",
    "ensure connect",
    { status: redis.status, hostHint: meta.hostHint, usesTls: meta.usesTls, depth },
    "H2",
  );

  if (redis.status === "ready") {
    return redis;
  }

  if (!_webConnectPromise) {
    _webConnectPromise = connectWebRedis(redis, depth).finally(() => {
      _webConnectPromise = null;
    });
  }

  return _webConnectPromise;
}
