"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, AlertCircle } from "lucide-react";
import { DropZone } from "@/components/shared/DropZone";
import { BlurFade } from "@/components/shared/BlurFade";
import type { Lead } from "@/types/lead";

interface ParseError {
  row: number;
  message: string;
}

interface StepCsvProps {
  leads: Lead[];
  parseErrors: ParseError[];
  isUploading: boolean;
  error: string | null;
  onFile: (file: File) => Promise<Lead[] | null>;
}

const CSV_COLUMNS = ["name", "email", "website"] as const;

export function StepCsv({
  leads,
  parseErrors,
  isUploading,
  error,
  onFile,
}: StepCsvProps) {
  const [fileName, setFileName] = useState<string | undefined>();

  async function handleFile(file: File) {
    setFileName(file.name);
    await onFile(file);
  }

  return (
    <div className="flex flex-col gap-8">
      <BlurFade delay={0.06}>
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            CSV columns:{" "}
            {CSV_COLUMNS.map((c) => (
              <code
                key={c}
                className="mx-0.5 rounded bg-secondary px-1.5 py-0.5 font-mono text-xs"
              >
                {c}
              </code>
            ))}
          </p>
        </div>
      </BlurFade>

      <BlurFade delay={0.08}>
        <DropZone
          onFile={handleFile}
          accept={{ "text/csv": [".csv"], "text/plain": [".csv", ".txt"] }}
          maxSize={5 * 1024 * 1024}
          label="Drop your CSV here, or click to browse"
          sublabel="Max 5 MB · website required · name and email optional"
          disabled={isUploading}
          fileName={fileName}
          error={error}
          icon={<FileText className="size-5" />}
        />
      </BlurFade>

      <AnimatePresence>
        {isUploading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-3 text-sm text-muted-foreground"
          >
            <div className="size-4 animate-spin rounded-full border-2 border-border border-t-foreground" />
            Parsing rows…
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {parseErrors.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-amber-400">
                <AlertCircle className="size-3.5" />
                {parseErrors.length} row(s) skipped
              </div>
              <ul className="space-y-1">
                {parseErrors.slice(0, 5).map((e) => (
                  <li key={e.row} className="font-mono text-xs text-muted-foreground">
                    Row {e.row}: {e.message}
                  </li>
                ))}
                {parseErrors.length > 5 && (
                  <li className="text-xs text-muted-foreground">
                    …and {parseErrors.length - 5} more
                  </li>
                )}
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {leads.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="overflow-hidden rounded-2xl border border-border"
          >
            <div className="grid grid-cols-3 border-b border-border bg-secondary/30 px-4 py-2.5 text-xs font-medium text-muted-foreground">
              <span>Name</span>
              <span>Email</span>
              <span>Website</span>
            </div>
            <div className="divide-y divide-border">
              {leads.slice(0, 6).map((lead, i) => (
                <motion.div
                  key={lead.id}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="grid grid-cols-3 px-4 py-3 text-sm"
                >
                  <span className="font-medium">{lead.name}</span>
                  <span className="truncate text-muted-foreground">{lead.email}</span>
                  <span className="truncate text-muted-foreground">
                    {lead.website.replace(/^https?:\/\//, "")}
                  </span>
                </motion.div>
              ))}
            </div>
            <div className="border-t border-border bg-secondary/20 px-4 py-2.5 text-xs text-muted-foreground">
              {leads.length} lead{leads.length !== 1 ? "s" : ""} ready to process
              {parseErrors.length > 0 &&
                ` · ${parseErrors.length} row(s) skipped`}
              {leads.length > 6 && " · showing first 6"}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
