"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  label: string;
}

interface StepperProps {
  steps: Step[];
  currentStep: number; // 1-indexed
  className?: string;
}

export function Stepper({ steps, currentStep, className }: StepperProps) {
  return (
    <nav className={cn("flex items-center gap-0", className)}>
      {steps.map((step, i) => {
        const idx = i + 1;
        const isComplete = idx < currentStep;
        const isActive = idx === currentStep;

        return (
          <div key={step.label} className="flex items-center">
            {/* Node */}
            <div className="flex flex-col items-center gap-1.5">
              <motion.div
                animate={{
                  backgroundColor: isActive
                    ? "hsl(0 0% 98%)"
                    : isComplete
                      ? "hsl(0 0% 15%)"
                      : "transparent",
                  borderColor: isActive
                    ? "hsl(0 0% 98%)"
                    : isComplete
                      ? "hsl(0 0% 15%)"
                      : "hsl(0 0% 20%)",
                  color: isActive
                    ? "hsl(0 0% 4%)"
                    : isComplete
                      ? "hsl(0 0% 60%)"
                      : "hsl(0 0% 30%)",
                }}
                transition={{ duration: 0.25 }}
                className="flex size-7 items-center justify-center rounded-full border text-xs font-medium"
              >
                {isComplete ? (
                  <Check className="size-3.5 text-muted-foreground" strokeWidth={2.5} />
                ) : (
                  <span>{idx}</span>
                )}
              </motion.div>
              <span
                className={cn(
                  "hidden text-[11px] font-medium sm:block",
                  isActive
                    ? "text-foreground"
                    : isComplete
                      ? "text-muted-foreground"
                      : "text-muted-foreground/50",
                )}
              >
                {step.label}
              </span>
            </div>

            {/* Connector */}
            {i < steps.length - 1 && (
              <div className="relative mx-3 mb-4 h-px w-12 bg-border sm:w-20">
                <motion.div
                  className="absolute inset-y-0 left-0 bg-muted-foreground/30"
                  animate={{ width: isComplete ? "100%" : "0%" }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                />
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
