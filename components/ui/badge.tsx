import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-foreground/10 text-foreground",
        muted: "bg-muted text-muted-foreground",
        outline: "border border-border text-muted-foreground",
        pending: "bg-white/[0.04] text-white/40",
        screenshotting: "bg-sky-400/10 text-sky-400",
        rendering: "bg-amber-400/10 text-amber-400",
        uploading: "bg-cyan-400/10 text-cyan-400",
        done: "bg-foreground/[0.08] text-foreground",
        failed: "bg-red-400/10 text-red-400",
        cancelled: "bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
