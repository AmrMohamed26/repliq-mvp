"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Download,
  Wifi,
  WifiOff,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { LeadCard } from "./LeadCard";
import { useSSEProgress } from "@/hooks/useSSEProgress";
import type { LeadResult } from "@/types/lead";
import { toast } from "sonner";

interface ProcessingDashboardProps {
  sessionId: string;
  initialResults: LeadResult[];
  initialStage: string;
  initialTotalLeads: number;
}

export function ProcessingDashboard({
  sessionId,
  initialResults,
  initialStage,
  initialTotalLeads,
}: ProcessingDashboardProps) {
  const router = useRouter();
  const {
    results,
    stage,
    totalLeads,
    doneCount,
    failedCount,
    activeCount,
    isBatchDone,
    isConnected,
  } = useSSEProgress(sessionId, initialResults, initialStage, initialTotalLeads);

  const [isCancelling, setIsCancelling] = useState(false);
  const [workerLikelyDown, setWorkerLikelyDown] = useState(false);
  const [queueBacklog, setQueueBacklog] = useState<{
    waiting: number;
    active: number;
    otherWaiting: number;
  } | null>(null);

  const completedCount = doneCount + failedCount;

  // Weight in-flight stages so the bar moves during screenshot/render/upload
  // (done+failed only stays at 0% for minutes while Remotion renders).
  const STAGE_WEIGHT: Record<string, number> = {
    pending: 0,
    screenshotting: 20,
    rendering: 50,
    uploading: 85,
    done: 100,
    failed: 100,
  };
  const weightedSum = results.reduce(
    (sum, r) => sum + (STAGE_WEIGHT[r.status] ?? 0),
    0,
  );
  const pct =
    totalLeads > 0 ? Math.min(100, weightedSum / totalLeads) : 0;

  const currentLeads = results.filter((r) =>
    ["screenshotting", "rendering", "uploading"].includes(r.status),
  );

  const allPending =
    results.length === 0 ||
    results.every((r) => r.status === "pending");

  const onDeployedSite =
    typeof window !== "undefined" &&
    (window.location.hostname.endsWith(".vercel.app") ||
      window.location.hostname === "repliq-mvp.vercel.app");

  // Detect stopped worker: jobs waiting in BullMQ but nothing active
  useEffect(() => {
    if (isBatchDone || totalLeads === 0) return;

    let cancelled = false;

    async function pollQueue() {
      try {
        const res = await fetch(
          `/api/health/queue?sessionId=${encodeURIComponent(sessionId)}`,
        );
        const data = (await res.json()) as {
          waiting?: number;
          active?: number;
          otherSessionWaiting?: number;
          workerLikelyDown?: boolean;
        };
        if (cancelled) return;
        setQueueBacklog({
          waiting: data.waiting ?? 0,
          active: data.active ?? 0,
          otherWaiting: data.otherSessionWaiting ?? 0,
        });
        if (
          completedCount === 0 &&
          activeCount === 0 &&
          data.workerLikelyDown
        ) {
          setWorkerLikelyDown(true);
        }
      } catch {
        /* ignore */
      }
    }

    const first = setTimeout(pollQueue, 4_000);
    const interval = setInterval(pollQueue, 8_000);

    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [sessionId, isBatchDone, totalLeads, completedCount, activeCount]);

  async function handleCancel() {
    if (!confirm("Cancel processing? Already-running jobs will finish their current stage.")) return;
    setIsCancelling(true);
    try {
      const res = await fetch(`/api/session/${sessionId}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        toast.success("Processing cancelled");
        sessionStorage.removeItem("repliq_session_id");
        router.replace("/new?reset=1");
      } else {
        toast.error(data.error ?? "Could not cancel");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setIsCancelling(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Status header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <AnimatePresence mode="wait">
            {isBatchDone ? (
              <motion.div
                key="done"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2"
              >
                <CheckCircle2 className="size-5 text-emerald-400" />
                <h2 className="text-xl font-medium tracking-tight">
                  {stage === "cancelled" ? "Cancelled" : "Processing complete"}
                </h2>
              </motion.div>
            ) : (
              <motion.h2
                key="processing"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xl font-medium tracking-tight"
              >
                Processing your leads
              </motion.h2>
            )}
          </AnimatePresence>
          <p className="text-sm text-muted-foreground">
            <motion.span
              key={completedCount}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="tabular-nums"
            >
              {completedCount}
            </motion.span>{" "}
            of{" "}
            <span className="tabular-nums">{totalLeads}</span> complete
            {failedCount > 0 && (
              <span className="ml-2 text-red-400">
                · {failedCount} failed
              </span>
            )}
            {activeCount > 0 && !isBatchDone && (
              <span className="ml-2 text-muted-foreground/60">
                · {activeCount} active
              </span>
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Connection indicator */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {isConnected ? (
              <Wifi className="size-3.5 text-emerald-400" />
            ) : isBatchDone ? null : (
              <WifiOff className="size-3.5 text-amber-400" />
            )}
          </div>

          {/* Download CSV */}
          <a
            href={`/api/export/${sessionId}`}
            download
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-transparent px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-foreground/[0.05]"
          >
            <Download className="size-3.5" />
            Export CSV
          </a>

          {/* Cancel */}
          {!isBatchDone && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleCancel}
              disabled={isCancelling}
              title="Cancel processing"
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Global queue backlog (other sessions' waiting jobs) */}
      {queueBacklog &&
        !isBatchDone &&
        allPending &&
        queueBacklog.otherWaiting > 0 && (
          <div className="rounded-xl border border-blue-400/30 bg-blue-400/10 px-4 py-3 text-sm text-blue-100">
            <p className="font-medium">Waiting in queue</p>
            <p className="mt-1 text-xs text-blue-100/80">
              {queueBacklog.otherWaiting} job
              {queueBacklog.otherWaiting === 1 ? "" : "s"} from earlier batches
              are ahead of yours. Start a new batch (wizard → Process) to clear
              stale waiting jobs automatically, or let the worker finish them
              first.
            </p>
          </div>
        )}

      {/* Worker offline warning */}
      {workerLikelyDown && !isBatchDone && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
          <p className="font-medium">Background worker is not running</p>
          <p className="mt-1 text-xs text-amber-200/80">
            Jobs are queued in Redis but nothing is processing them. On your Mac,
            open a terminal in this project and run{" "}
            <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[11px]">
              npm run worker:dev
            </code>
            {onDeployedSite ? (
              <>
                {" "}
                Your <code className="rounded bg-black/40 px-1 font-mono text-[11px]">.env</code>{" "}
                must use the same <code className="rounded bg-black/40 px-1 font-mono text-[11px]">REDIS_URL</code> as
                Vercel (Upstash). Re-upload the talking-head video on this site after deploying the latest code so it
                is stored in Supabase for the worker to download.
              </>
            ) : (
              " (same machine as the app, or same REDIS_URL as production)."
            )}
          </p>
        </div>
      )}

      {/* Progress bar */}
      <div className="space-y-1.5">
        <Progress value={pct} className="h-1" />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            {isBatchDone
              ? "All jobs finished"
              : currentLeads.length > 0
                ? `Working on: ${currentLeads.map((l) => l.name).join(", ")}`
                : allPending
                  ? "Queued…"
                  : "Processing…"}
          </span>
          <span className="tabular-nums">{Math.round(pct)}%</span>
        </div>
      </div>

      {/* Lead grid */}
      <motion.div
        layout
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        <AnimatePresence>
          {results.map((result) => (
            <LeadCard key={result.id} result={result} compact={!isBatchDone} />
          ))}
        </AnimatePresence>

        {/* Skeleton placeholders for not-yet-queued leads */}
        {!isBatchDone &&
          Array.from({
            length: Math.max(0, totalLeads - results.length),
          }).map((_, i) => (
            <div
              key={`skeleton-${i}`}
              className="h-24 animate-pulse rounded-2xl border border-border bg-secondary/20"
            />
          ))}
      </motion.div>
    </div>
  );
}
