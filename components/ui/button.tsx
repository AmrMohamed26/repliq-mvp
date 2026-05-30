"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 select-none",
  {
    variants: {
      variant: {
        default:
          "rounded-full bg-foreground text-background hover:bg-foreground/90 active:scale-[0.97]",
        outline:
          "rounded-full border border-border bg-transparent text-foreground hover:bg-foreground/[0.05]",
        ghost:
          "rounded-md text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground",
        destructive:
          "rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 active:scale-[0.97]",
        link: "rounded-none text-foreground underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        default: "h-9 px-5",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-7 text-base",
        icon: "h-9 w-9 rounded-full",
        "icon-sm": "h-7 w-7 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export { Button, buttonVariants };
