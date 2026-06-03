"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ExternalLink,
  Download,
  AlertCircle,
  Globe,
  RefreshCw,
  Link2,
  Mail,
  Play,
  Check,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { resolveThumbnailUrlForDisplay } from "@/lib/media-url";
import { fetchAndCopyEmailForLead } from "@/lib/copy-email-clipboard";
import type { LeadResult } from "@/types/lead";
import { toast } from "sonner";

interface LeadCardProps {
  result: LeadResult;
  compact?: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  screenshotting: "Screenshotting",
  rendering: "Rendering",
  uploading: "Uploading",
  done: "Done",
  failed: "Failed",
};

const STATUS_DOT: Record<string, string> = {
  pending: "bg-white/20",
  screenshotting: "bg-sky-400",
  rendering: "bg-amber-400",
  uploading: "bg-cyan-400",
  done: "bg-emerald-400",
  failed: "bg-red-400",
};

export function LeadCard({ result, compact = false }: LeadCardProps) {
  const [copied, setCopied] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);
  const [copyingEmail, setCopyingEmail] = useState(false);

  const isActive = ["screenshotting", "rendering", "uploading"].includes(result.status);
  const isDone = result.status === "done";
  const isFailed = result.status === "failed";

  const hasPublicVideo = result.videoUrl?.startsWith("https://") ?? false;
  const hasNonPublicVideo = Boolean(result.videoUrl) && !hasPublicVideo;

  const videoUrl = hasPublicVideo ? result.videoUrl : undefined;
  const watchUrl =
    result.shortUrl && !result.shortUrl.includes(".mp4")
      ? result.shortUrl
      : `/v/${result.slug ?? result.id}`;
  const thumbnailUrl = resolveThumbnailUrlForDisplay(
    result.id,
    result.posterThumbnailUrl ?? result.thumbnailUrl,
  );

  async function copyLink() {
    const link =
      typeof window !== "undefined" && watchUrl.startsWith("/")
        ? `${window.location.origin}${watchUrl}`
        : watchUrl;
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  }

  async function copyEmail() {
    if (!hasPublicVideo || copyingEmail) return;
    setCopyingEmail(true);
    try {
      const mode = await fetchAndCopyEmailForLead(result.id);
      setEmailCopied(true);
      setTimeout(() => setEmailCopied(false), 2500);
      toast.success(
        mode === "rich" || mode === "legacy"
          ? "Email copied — paste into Gmail"
          : "Copied as plain text — use Chrome for rich thumbnail paste",
      );
    } catch {
      toast.error("Clipboard blocked — allow access and try again");
    } finally {
      setCopyingEmail(false);
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border bg-card transition-colors",
        isDone && "border-white/[0.12]",
        isFailed && "border-red-400/20",
      )}
    >
      <AnimatePresence>
        {isActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent"
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isDone && thumbnailUrl && !compact && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="relative aspect-video w-full overflow-hidden bg-black"
          >
            {watchUrl ? (
              <a
                href={watchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group/thumb block h-full w-full"
                aria-label={`Watch video for ${result.name}`}
              >
                <img
                  src={thumbnailUrl}
                  alt={`${result.name} thumbnail`}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover/thumb:scale-[1.03]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex size-14 items-center justify-center rounded-full bg-white/90 shadow-2xl ring-1 ring-white/20 transition-transform duration-200 group-hover/thumb:scale-110">
                    <Play className="size-5 translate-x-0.5 fill-black text-black" />
                  </div>
                </div>
              </a>
            ) : (
              <>
                <img
                  src={thumbnailUrl}
                  alt={`${result.name} thumbnail`}
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className={cn("flex flex-col gap-3 p-4", compact && "gap-2")}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{result.name}</p>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Globe className="size-3 shrink-0" />
              <span className="truncate">
                {result.website.replace(/^https?:\/\//, "")}
              </span>
            </div>
          </div>
          <motion.div layout>
            <Badge
              variant={result.status as Parameters<typeof Badge>[0]["variant"]}
              className="shrink-0"
            >
              <motion.span
                className={cn("size-1.5 rounded-full", STATUS_DOT[result.status])}
                animate={isActive ? { opacity: [1, 0.3, 1] } : {}}
                transition={
                  isActive ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" } : {}
                }
              />
              {STATUS_LABELS[result.status] ?? result.status}
            </Badge>
          </motion.div>
        </div>

        <AnimatePresence>
          {isFailed && result.error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="flex items-start gap-2 rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-xs text-red-400">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                <span className="line-clamp-2">{result.error}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isDone && hasNonPublicVideo && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-300">
                This result was generated before public storage was configured.
                Re-run the batch with Supabase credentials to get shareable links.
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isDone && hasPublicVideo && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-2">
                <a
                  href={watchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-transparent px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-foreground/[0.05]"
                >
                  <ExternalLink className="size-3" />
                  View
                </a>
                <a
                  href={videoUrl!}
                  download
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-transparent px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-foreground/[0.05]"
                >
                  <Download className="size-3" />
                  Download
                </a>
              </div>

              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={copyLink}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-transparent px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
                >
                  {copied ? (
                    <>
                      <Check className="size-3 text-emerald-400" />
                      <span className="text-emerald-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Link2 className="size-3" />
                      Copy link
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={copyEmail}
                  disabled={copyingEmail}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-transparent px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground disabled:opacity-50"
                >
                  {emailCopied ? (
                    <>
                      <Check className="size-3 text-emerald-400" />
                      <span className="text-emerald-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Mail className="size-3" />
                      Copy Email
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isFailed && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs opacity-40"
                disabled
                title="Retry is available in a future release"
              >
                <RefreshCw className="size-3" />
                Retry (coming soon)
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
