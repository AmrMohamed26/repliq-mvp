"use client";

import { useCallback } from "react";
import { useDropzone, type Accept } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, X, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface DropZoneProps {
  onFile: (file: File) => void;
  accept: Accept;
  maxSize?: number;
  label: string;
  sublabel?: string;
  disabled?: boolean;
  fileName?: string;
  error?: string | null;
  icon?: React.ReactNode;
}

export function DropZone({
  onFile,
  accept,
  maxSize,
  label,
  sublabel,
  disabled,
  fileName,
  error,
  icon,
}: DropZoneProps) {
  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted[0]) onFile(accepted[0]);
    },
    [onFile],
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } =
    useDropzone({
      onDrop,
      accept,
      maxFiles: 1,
      maxSize,
      disabled,
    });

  const hasError = isDragReject || !!error;

  return (
    <div className="relative">
      {/* motion wrapper for animated border/bg — separate from getRootProps */}
      <motion.div
        animate={{
          borderColor: isDragActive
            ? "hsl(0 0% 70%)"
            : hasError
              ? "hsl(0 84% 60%)"
              : "hsl(0 0% 14%)",
          backgroundColor: isDragActive ? "hsl(0 0% 8%)" : "hsl(0 0% 5%)",
        }}
        transition={{ duration: 0.15 }}
        className="rounded-2xl border border-dashed"
      >
      <div
        {...getRootProps()}
        className={cn(
          "group relative flex cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl p-12 text-center outline-none",
          disabled && "pointer-events-none opacity-50",
          fileName && "py-8",
        )}
      >
        <input {...getInputProps()} />

        {/* Animated background grid on drag */}
        <AnimatePresence>
          {isDragActive && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none absolute inset-0 rounded-2xl bg-grid-fade"
            />
          )}
        </AnimatePresence>

        {/* Icon */}
        <motion.div
          animate={{ scale: isDragActive ? 1.15 : 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
          className={cn(
            "flex size-12 items-center justify-center rounded-2xl border border-border bg-secondary text-muted-foreground",
            isDragActive && "border-foreground/20 text-foreground",
            hasError && "border-destructive/30 text-destructive",
          )}
        >
          {icon ?? <Upload className="size-5" />}
        </motion.div>

        {/* Text */}
        <div className="space-y-1">
          {fileName ? (
            <>
              <p className="text-sm font-medium text-foreground">{fileName}</p>
              <p className="text-xs text-muted-foreground">
                Drop another to replace
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-foreground">
                {isDragActive ? "Release to upload" : label}
              </p>
              {sublabel && (
                <p className="text-xs text-muted-foreground">{sublabel}</p>
              )}
            </>
          )}
        </div>

        {/* Dismiss error */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-2 text-xs text-destructive"
          >
            <AlertCircle className="size-3.5 shrink-0" />
            {error}
          </motion.div>
        )}

        {/* Drag reject indicator */}
        {isDragReject && !error && (
          <div className="flex items-center gap-2 text-xs text-destructive">
            <X className="size-3.5" />
            File type not supported
          </div>
        )}
      </div>
      </motion.div>
    </div>
  );
}
