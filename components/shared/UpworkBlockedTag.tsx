import { Ban } from "lucide-react";
import { cn } from "@/lib/utils";

interface UpworkBlockedTagProps {
  className?: string;
  compact?: boolean;
}

export function UpworkBlockedTag({ className, compact }: UpworkBlockedTagProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-red-500/50 bg-red-500/10 font-medium text-red-600 dark:text-red-400",
        compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
        className,
      )}
    >
      <Ban className={compact ? "size-2.5" : "size-3"} />
      Upwork private — skipped
    </span>
  );
}
