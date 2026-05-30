"use client";

import { motion } from "framer-motion";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ManualContactFieldErrors, ManualContactInput } from "@/lib/manual-leads";
import { cn } from "@/lib/utils";

interface ManualContactCardProps {
  contact: ManualContactInput;
  index: number;
  errors: ManualContactFieldErrors;
  canRemove: boolean;
  onChange: (patch: Partial<ManualContactInput>) => void;
  onRemove: () => void;
}

const fieldClass =
  "w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-foreground/40 focus:ring-1 focus:ring-foreground/10";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-red-600 dark:text-red-400">{message}</p>;
}

export function ManualContactCard({
  contact,
  index,
  errors,
  canRemove,
  onChange,
  onRemove,
}: ManualContactCardProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-2xl border border-border bg-secondary/10 p-5"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <span className="text-xs font-medium text-muted-foreground">
          Contact {index + 1}
        </span>
        {canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onRemove}
            aria-label="Remove contact"
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-xs font-medium text-muted-foreground">
            Name <span className="text-foreground">*</span>
          </label>
          <input
            className={cn(fieldClass, errors.name && "border-red-500/50")}
            value={contact.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Jane Smith"
            autoComplete="name"
          />
          <FieldError message={errors.name} />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Email <span className="text-muted-foreground/70">(optional)</span>
          </label>
          <input
            type="email"
            className={cn(fieldClass, errors.email && "border-red-500/50")}
            value={contact.email}
            onChange={(e) => onChange({ email: e.target.value })}
            placeholder="jane@company.com"
            autoComplete="email"
          />
          <FieldError message={errors.email} />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Website URL <span className="text-foreground">*</span>
          </label>
          <input
            className={cn(fieldClass, errors.website && "border-red-500/50")}
            value={contact.website}
            onChange={(e) => onChange({ website: e.target.value })}
            placeholder="https://company.com"
            autoComplete="url"
          />
          <FieldError message={errors.website} />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-xs font-medium text-muted-foreground">
            Company name <span className="text-muted-foreground/70">(optional)</span>
          </label>
          <input
            className={fieldClass}
            value={contact.companyName ?? ""}
            onChange={(e) => onChange({ companyName: e.target.value })}
            placeholder="Acme Inc."
          />
        </div>
      </div>
    </motion.div>
  );
}
