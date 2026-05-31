import { getQueue } from "@/lib/queue";
import { ensureWebRedisConnected } from "@/lib/redis";
import { isSupabaseStorageConfigured } from "@/lib/storage";
import { ok, handleError } from "@/lib/api";

/**
 * GET /api/health
 * Production checklist — Vercel UI + shared Redis + Supabase + worker activity.
 */
export async function GET() {
  try {
    const redis = await ensureWebRedisConnected();
    await redis.ping();

    const queue = getQueue();
    const counts = await queue.getJobCounts(
      "waiting",
      "active",
      "delayed",
      "failed",
    );
    const waiting = counts.waiting ?? 0;
    const active = counts.active ?? 0;

    const supabaseOk = isSupabaseStorageConfigured();
    const workerLikelyDown = waiting > 0 && active === 0;
    const onVercel = process.env.VERCEL === "1";

    const deploySha =
      process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
      process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ??
      "local";

    const ready =
      supabaseOk && !workerLikelyDown && (active > 0 || waiting === 0);

    return ok({
      status: ready ? "ok" : "degraded",
      deploySha,
      host: onVercel ? "vercel" : "node",
      redis: "connected",
      supabase: supabaseOk ? "configured" : "missing",
      queue: { waiting, active, delayed: counts.delayed ?? 0 },
      workerLikelyDown,
      hints: [
        ...(onVercel
          ? [
              "UI runs on Vercel; redeploy after git push to origin/main.",
            ]
          : []),
        ...(workerLikelyDown
          ? [
              "Jobs are waiting but none are active — deploy/restart the Railway worker (npm run worker).",
            ]
          : []),
        ...(!supabaseOk
          ? [
              "Set SUPABASE_* on Vercel and Railway so talking-head and outputs sync.",
            ]
          : []),
        "Run a NEW batch on the public site after both Vercel and Railway are on latest main (poster thumbnails need new worker).",
      ],
    });
  } catch (err) {
    return handleError(err);
  }
}
