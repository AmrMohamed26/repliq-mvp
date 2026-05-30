"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Cookie, X } from "lucide-react";
import type { PlatformCookieStatus } from "@/lib/site-cookies";

interface CookieStatusResponse {
  platforms: PlatformCookieStatus[];
  needsAttention: boolean;
  error?: string;
}

const POLL_MS = 60_000;

function severity(
  health: PlatformCookieStatus["health"],
): "error" | "warn" | "ok" {
  if (health === "error" || health === "missing") return "error";
  if (health === "warn") return "warn";
  return "ok";
}

export function CookieStatusBanner() {
  const [report, setReport] = useState<CookieStatusResponse | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/cookies/status", { cache: "no-store" });
      const data = (await res.json()) as CookieStatusResponse;
      setReport(data);
      if (!data.needsAttention) setDismissed(false);
    } catch {
      setReport({
        platforms: [],
        needsAttention: false,
      });
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  if (dismissed || !report?.needsAttention) return null;

  const issues = report.platforms.filter(
    (p) => p.health !== "ok",
  );
  const worst = issues.some((p) => severity(p.health) === "error")
    ? "error"
    : "warn";

  const border =
    worst === "error"
      ? "border-destructive/50 bg-destructive/10"
      : "border-amber-500/50 bg-amber-500/10";
  const iconClass =
    worst === "error" ? "text-destructive" : "text-amber-500";

  return (
    <div
      role="alert"
      className={`sticky top-0 z-50 border-b px-4 py-3 ${border}`}
    >
      <div className="mx-auto flex max-w-5xl gap-3">
        <Cookie className={`mt-0.5 size-5 shrink-0 ${iconClass}`} />
        <div className="min-w-0 flex-1 space-y-2 text-sm">
          <p className="font-medium text-foreground">
            {worst === "error"
              ? "Upwork / LinkedIn cookies need your attention"
              : "Upwork / LinkedIn cookies expiring soon"}
          </p>
          <p className="text-muted-foreground">
            Private Upwork jobs and LinkedIn profiles need fresh browser
            cookies. Export new JSON from Cookie-Editor while logged in, save
            to{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              cookies/upwork.json
            </code>{" "}
            and/or{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              cookies/linkedin.json
            </code>
            , then restart{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              npm run worker:dev
            </code>
            . The banner clears once cookies are valid again.
          </p>
          <ul className="space-y-1 text-muted-foreground">
            {issues.map((p) => (
              <li key={p.platform} className="flex gap-2">
                <AlertTriangle
                  className={`mt-0.5 size-3.5 shrink-0 ${iconClass}`}
                />
                <span>{p.message}</span>
              </li>
            ))}
          </ul>
          {report.error ? (
            <p className="text-destructive">{report.error}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Dismiss cookie reminder"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
