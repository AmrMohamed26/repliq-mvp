"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, Rocket, Users, Clock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BlurFade } from "@/components/shared/BlurFade";
import { toast } from "sonner";
import type { Lead } from "@/types/lead";

interface StepReviewProps {
  sessionId: string | null;
  leads: Lead[];
  durationSec: number;
  onBack: () => void;
  onStarted: (sessionId: string) => void;
}

export function StepReview({
  sessionId,
  leads,
  durationSec,
  onBack,
  onStarted,
}: StepReviewProps) {
  const [isStarting, setIsStarting] = useState(false);

  async function handleStart() {
    if (!sessionId) return;
    setIsStarting(true);
    try {
      const res = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to start processing");
        return;
      }
      toast.success(`Enqueued ${data.enqueuedCount} jobs`);
      onStarted(sessionId);
    } catch {
      toast.error("Network error — could not start processing");
    } finally {
      setIsStarting(false);
    }
  }

  const estimatedMin = Math.ceil((leads.length * (durationSec + 30)) / 60);

  return (
    <div className="flex flex-col gap-8">
      <BlurFade delay={0}>
        <div className="space-y-1">
          <h2 className="text-xl font-medium tracking-tight">Ready to process</h2>
          <p className="text-sm text-muted-foreground">
            Review the batch details below, then kick it off.
          </p>
        </div>
      </BlurFade>

      {/* Stat cards */}
      <BlurFade delay={0.05}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard
            icon={<Users className="size-4" />}
            label="Leads"
            value={leads.length.toString()}
          />
          <StatCard
            icon={<Clock className="size-4" />}
            label="Video length"
            value={`${durationSec.toFixed(1)} s`}
          />
          <StatCard
            icon={<Clock className="size-4" />}
            label="Est. time"
            value={`~${estimatedMin} min`}
            className="col-span-2 sm:col-span-1"
          />
        </div>
      </BlurFade>

      {/* Sample leads */}
      <BlurFade delay={0.1}>
        <div className="rounded-2xl border border-border overflow-hidden">
          <div className="border-b border-border bg-secondary/30 px-4 py-2.5 text-xs font-medium text-muted-foreground">
            Leads to process
          </div>
          <div className="divide-y divide-border">
            {leads.slice(0, 4).map((lead, i) => (
              <motion.div
                key={lead.id}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.04 }}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <span className="font-medium">{lead.name}</span>
                <span className="truncate text-muted-foreground max-w-[200px]">
                  {lead.website.replace(/^https?:\/\//, "")}
                </span>
              </motion.div>
            ))}
          </div>
          {leads.length > 4 && (
            <div className="border-t border-border bg-secondary/10 px-4 py-2.5 text-xs text-muted-foreground">
              …and {leads.length - 4} more
            </div>
          )}
        </div>
      </BlurFade>

      {/* Warning for large batches */}
      {leads.length > 50 && (
        <BlurFade delay={0.15}>
          <div className="flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-xs text-amber-400">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Large batch detected. Ensure your worker is running and has
              sufficient disk space.
            </span>
          </div>
        </BlurFade>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} disabled={isStarting}>
          <ChevronLeft className="size-4" />
          Back
        </Button>
        <Button onClick={handleStart} disabled={isStarting} size="lg">
          {isStarting ? (
            <>
              <div className="size-4 animate-spin rounded-full border-2 border-background/30 border-t-background" />
              Starting…
            </>
          ) : (
            <>
              <Rocket className="size-4" />
              Start processing
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl border border-border p-5 ${className ?? ""}`}
    >
      <div className="text-muted-foreground">{icon}</div>
      <div>
        <div className="text-2xl font-medium tracking-tight">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}
