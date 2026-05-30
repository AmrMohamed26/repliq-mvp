"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Stepper } from "@/components/shared/Stepper";
import { StepLeads } from "./StepLeads";
import { StepVideo } from "./StepVideo";
import { StepReview } from "./StepReview";
import { useLocalSession } from "@/hooks/useLocalSession";
import type { Lead } from "@/types/lead";

const STEPS = [
  { label: "Leads" },
  { label: "Video" },
  { label: "Review" },
];

const SLIDE = {
  initial: (dir: number) => ({
    opacity: 0,
    x: dir > 0 ? 24 : -24,
    filter: "blur(4px)",
  }),
  animate: { opacity: 1, x: 0, filter: "blur(0px)" },
  exit: (dir: number) => ({
    opacity: 0,
    x: dir > 0 ? -24 : 24,
    filter: "blur(4px)",
  }),
};

export function WizardClient() {
  const router = useRouter();
  const { sessionId, isReady, sessionError, retrySession } = useLocalSession();

  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [durationSec, setDurationSec] = useState(0);

  function goNext() {
    setDirection(1);
    setStep((s) => s + 1);
  }
  function goBack() {
    setDirection(-1);
    setStep((s) => s - 1);
  }

  function handleLeadsNext(parsedLeads: Lead[]) {
    setLeads(parsedLeads);
    goNext();
  }

  function handleVideoNext(duration: number) {
    setDurationSec(duration);
    goNext();
  }

  function handleStarted(sid: string) {
    router.push(`/results/${sid}`);
  }

  if (!isReady) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="size-6 animate-spin rounded-full border-2 border-border border-t-foreground" />
          <p className="text-sm text-muted-foreground">Starting session…</p>
        </div>
      </div>
    );
  }

  if (sessionError && !sessionId) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
        <div className="max-w-md space-y-2">
          <p className="text-sm font-medium text-foreground">Could not start a session</p>
          <p className="text-sm text-muted-foreground">{sessionError}</p>
          <p className="text-xs text-muted-foreground">
            On Vercel, set <code className="rounded bg-secondary px-1">REDIS_URL</code>{" "}
            (e.g. Upstash) and{" "}
            <code className="rounded bg-secondary px-1">NEXT_PUBLIC_APP_URL</code>{" "}
            to <code className="rounded bg-secondary px-1">https://repliq-mvp.vercel.app</code>,
            then redeploy.
          </p>
        </div>
        <div className="flex gap-3">
          <Button onClick={() => retrySession()}>Retry</Button>
          <Link
            href="/"
            className="inline-flex h-9 items-center justify-center rounded-full border border-border px-5 text-sm font-medium transition-colors hover:bg-foreground/[0.05]"
          >
            Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <div className="grid size-7 place-items-center rounded-md bg-foreground text-background">
          <Sparkles className="size-4" strokeWidth={2.4} />
        </div>
        <span className="text-sm font-medium tracking-tight">Repliq</span>
      </div>

      {/* Stepper */}
      <Stepper steps={STEPS} currentStep={step} />

      {/* Step panel */}
      <div className="relative min-h-[400px]">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={SLIDE}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            {step === 1 && (
              <StepLeads sessionId={sessionId} onNext={handleLeadsNext} />
            )}
            {step === 2 && (
              <StepVideo
                sessionId={sessionId}
                onNext={handleVideoNext}
                onBack={goBack}
              />
            )}
            {step === 3 && (
              <StepReview
                sessionId={sessionId}
                leads={leads}
                durationSec={durationSec}
                onBack={goBack}
                onStarted={handleStarted}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
