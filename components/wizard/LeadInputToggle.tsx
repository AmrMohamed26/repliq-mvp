"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type LeadInputMode = "csv" | "manual";

interface LeadInputToggleProps {
  mode: LeadInputMode;
  onChange: (mode: LeadInputMode) => void;
}

export function LeadInputToggle({ mode, onChange }: LeadInputToggleProps) {
  return (
    <div className="inline-flex rounded-full border border-border p-1">
      {(
        [
          { id: "csv" as const, label: "CSV Upload" },
          { id: "manual" as const, label: "Manual Entry" },
        ] as const
      ).map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            "relative rounded-full px-5 py-2 text-sm font-medium transition-colors",
            mode === tab.id
              ? "text-background"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {mode === tab.id && (
            <motion.span
              layoutId="lead-input-toggle"
              className="absolute inset-0 rounded-full bg-foreground"
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            />
          )}
          <span className="relative z-10">{tab.label}</span>
        </button>
      ))}
    </div>
  );
}
