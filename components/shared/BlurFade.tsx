"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface BlurFadeProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
  yOffset?: number;
  blur?: string;
  inView?: boolean;
}

export function BlurFade({
  children,
  className,
  delay = 0,
  duration = 0.35,
  yOffset = 6,
  blur = "4px",
}: BlurFadeProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: yOffset, filter: `blur(${blur})` }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{
        duration,
        delay,
        ease: [0.16, 1, 0.3, 1],
      }}
      className={cn(className)}
    >
      {children}
    </motion.div>
  );
}
