"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BlurFade } from "@/components/shared/BlurFade";
import { LeadInputToggle, type LeadInputMode } from "./LeadInputToggle";
import { StepCsv } from "./StepCsv";
import { StepManualEntry } from "./StepManualEntry";
import { useCsvUpload } from "@/hooks/useCsvUpload";
import { useManualLeads } from "@/hooks/useManualLeads";
import type { Lead } from "@/types/lead";
import { toast } from "sonner";

interface StepLeadsProps {
  sessionId: string | null;
  onNext: (leads: Lead[]) => void;
}

async function persistLeads(
  sessionId: string,
  leads: Lead[],
): Promise<Lead[] | null> {
  const res = await fetch("/api/upload/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, leads }),
  });
  const data = await res.json();
  if (!res.ok) {
    toast.error(data.error ?? "Failed to save leads");
    return null;
  }
  return data.leads as Lead[];
}

export function StepLeads({ sessionId, onNext }: StepLeadsProps) {
  const [mode, setMode] = useState<LeadInputMode>("csv");
  const csv = useCsvUpload(sessionId);
  const manual = useManualLeads(sessionId);
  const [isContinuing, setIsContinuing] = useState(false);

  const canContinueCsv =
    csv.leads.length > 0 && !csv.isUploading && !isContinuing;
  const canContinueManual =
    manual.contacts.length > 0 && !manual.isSaving && !isContinuing;

  async function handleContinue() {
    if (!sessionId) {
      toast.error("No active session — please refresh");
      return;
    }

    setIsContinuing(true);
    try {
      if (mode === "csv") {
        if (csv.leads.length === 0) {
          toast.error("Upload a CSV with at least one valid lead");
          return;
        }
        const saved = await persistLeads(sessionId, csv.leads);
        if (!saved) return;
        onNext(saved);
        return;
      }

      const leads = manual.validateAndGetLeads();
      if (!leads) return;

      const saved = await manual.saveLeads(leads);
      if (!saved) return;
      onNext(saved);
    } finally {
      setIsContinuing(false);
    }
  }

  const canContinue = mode === "csv" ? canContinueCsv : canContinueManual;

  return (
    <div className="flex flex-col gap-8">
      <BlurFade delay={0}>
        <div className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-xl font-medium tracking-tight">Add your leads</h2>
            <p className="text-sm text-muted-foreground">
              Upload a CSV or enter contacts manually — both use the same pipeline.
            </p>
          </div>
          <LeadInputToggle mode={mode} onChange={setMode} />
        </div>
      </BlurFade>

      <div className={mode !== "csv" ? "hidden" : "contents"} aria-hidden={mode !== "csv"}>
        <StepCsv
          leads={csv.leads}
          parseErrors={csv.parseErrors}
          isUploading={csv.isUploading}
          error={csv.error}
          onFile={csv.upload}
        />
      </div>

      <div
        className={mode !== "manual" ? "hidden" : "contents"}
        aria-hidden={mode !== "manual"}
      >
        <StepManualEntry manual={manual} />
      </div>

      <div className="flex justify-end">
        <Button
          onClick={handleContinue}
          disabled={!canContinue}
          size="lg"
        >
          {isContinuing || csv.isUploading || manual.isSaving ? (
            <>
              <div className="size-4 animate-spin rounded-full border-2 border-background/30 border-t-background" />
              {mode === "manual" ? "Saving…" : "Continuing…"}
            </>
          ) : (
            <>
              Continue
              <ChevronRight className="size-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
