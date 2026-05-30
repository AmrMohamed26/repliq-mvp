"use client";

import { useEffect, useRef, useState } from "react";
import type { LeadResult } from "@/types/lead";
import type { ProgressEvent } from "@/types/job";

export interface SSEState {
  results: LeadResult[];
  stage: string;
  totalLeads: number;
  doneCount: number;
  failedCount: number;
  activeCount: number;
  isBatchDone: boolean;
  isConnected: boolean;
}

/**
 * Subscribes to the SSE progress stream for a session.
 * Merges initial results (from SSR) with live updates from the stream.
 */
export function useSSEProgress(
  sessionId: string,
  initialResults: LeadResult[] = [],
  initialStage = "processing",
  initialTotalLeads = 0,
): SSEState {
  const [resultsMap, setResultsMap] = useState<Map<string, LeadResult>>(() => {
    const m = new Map<string, LeadResult>();
    for (const r of initialResults) m.set(r.id, r);
    return m;
  });
  const [stage, setStage] = useState(initialStage);
  const [totalLeads, setTotalLeads] = useState(initialTotalLeads);
  const [isBatchDone, setIsBatchDone] = useState(
    initialStage === "completed" || initialStage === "cancelled",
  );
  const [isConnected, setIsConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const pollTickRef = useRef(0);

  // Poll Redis-backed results so UI updates even if SSE misses events.
  useEffect(() => {
    if (isBatchDone) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/results/${sessionId}`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          stage: string;
          totalLeads: number;
          results: LeadResult[];
        };
        pollTickRef.current += 1;
        // #region agent log
        const active = data.results.filter((r) =>
          ["screenshotting", "rendering", "uploading"].includes(r.status),
        ).length;
        const done = data.results.filter((r) => r.status === "done").length;
        if (pollTickRef.current <= 3 || active > 0 || done > 0) {
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
                runId: "post-fix",
                hypothesisId: "H2",
                location: "hooks/useSSEProgress.ts:poll",
                message: "poll merge",
                data: {
                  sessionId,
                  tick: pollTickRef.current,
                  stage: data.stage,
                  pending: data.results.filter((r) => r.status === "pending")
                    .length,
                  active,
                  done,
                },
                timestamp: Date.now(),
              }),
            },
          ).catch(() => {});
        }
        // #endregion
        setStage(data.stage);
        setTotalLeads(data.totalLeads);
        setResultsMap((prev) => {
          const m = new Map(prev);
          for (const r of data.results) {
            const existing = m.get(r.id);
            m.set(r.id, { ...existing, ...r, id: r.id });
          }
          return m;
        });
        if (data.stage === "completed" || data.stage === "cancelled") {
          setIsBatchDone(true);
        }
      } catch {
        /* ignore */
      }
    };

    void poll();
    const id = setInterval(poll, 4000);
    return () => clearInterval(id);
  }, [sessionId, isBatchDone]);

  useEffect(() => {
    if (isBatchDone) return;

    const es = new EventSource(`/api/status/${sessionId}`);
    esRef.current = es;

    es.addEventListener("open", () => {
      setIsConnected(true);
    });

    es.addEventListener("init", (e: MessageEvent) => {
      const data = JSON.parse(e.data as string) as {
        sessionId: string;
        stage: string;
        totalLeads: number;
        results: LeadResult[];
      };
      setStage(data.stage);
      setTotalLeads(data.totalLeads);
      setResultsMap((prev) => {
        const m = new Map(prev);
        for (const r of data.results) m.set(r.id, r);
        return m;
      });
      setIsConnected(true);
    });

    es.addEventListener("progress", (e: MessageEvent) => {
      const ev = JSON.parse(e.data as string) as ProgressEvent;
      setResultsMap((prev) => {
        const next = new Map(prev);
        const existing = next.get(ev.leadId);
        next.set(ev.leadId, {
          id: ev.leadId,
          name: existing?.name ?? "",
          email: existing?.email ?? "",
          website: existing?.website ?? "",
          status: ev.status as LeadResult["status"],
          videoUrl: ev.videoUrl ?? existing?.videoUrl,
          thumbnailUrl: ev.thumbnailUrl ?? existing?.thumbnailUrl,
          shortUrl: existing?.shortUrl,
          error: ev.error ?? existing?.error,
          startedAt: existing?.startedAt ?? ev.timestamp,
          finishedAt:
            ev.status === "done" || ev.status === "failed"
              ? ev.timestamp
              : existing?.finishedAt,
        });
        return next;
      });
    });

    es.addEventListener("batch_done", (e: MessageEvent) => {
      const data = JSON.parse(e.data as string) as { stage: string };
      setStage(data.stage);
      setIsBatchDone(true);
      setIsConnected(false);
      es.close();
    });

    // Do not call es.close() here — EventSource auto-reconnects on transient errors.
    es.onerror = () => {
      setIsConnected(false);
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [sessionId, isBatchDone]);

  const results = Array.from(resultsMap.values());
  const doneCount = results.filter((r) => r.status === "done").length;
  const failedCount = results.filter((r) => r.status === "failed").length;
  const activeCount = results.filter((r) =>
    ["screenshotting", "rendering", "uploading"].includes(r.status),
  ).length;

  return {
    results,
    stage,
    totalLeads,
    doneCount,
    failedCount,
    activeCount,
    isBatchDone,
    isConnected,
  };
}
