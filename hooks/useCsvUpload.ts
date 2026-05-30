"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { Lead } from "@/types/lead";

interface ParseError {
  row: number;
  message: string;
}

export interface CsvUploadState {
  leads: Lead[];
  parseErrors: ParseError[];
  isUploading: boolean;
  error: string | null;
  upload: (file: File) => Promise<Lead[] | null>;
  reset: () => void;
}

export function useCsvUpload(sessionId: string | null): CsvUploadState {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [parseErrors, setParseErrors] = useState<ParseError[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File): Promise<Lead[] | null> => {
      if (!sessionId) {
        toast.error("No active session — please refresh");
        return null;
      }
      setIsUploading(true);
      setError(null);

      const formData = new FormData();
      formData.append("file", file);

      try {
        const res = await fetch(
          `/api/upload/csv?sessionId=${sessionId}`,
          { method: "POST", body: formData },
        );
        const data = await res.json();
        if (!res.ok) {
          const msg = data.error ?? "Upload failed";
          setError(msg);
          toast.error(msg);
          return null;
        }
        const parsedLeads = data.leads as Lead[];
        const rowErrors = (data.errors ?? []) as ParseError[];
        setLeads(parsedLeads);
        setParseErrors(rowErrors);
        if (rowErrors.length > 0) {
          toast.warning(
            `${parsedLeads.length} lead(s) imported · ${rowErrors.length} row(s) skipped (see below)`,
          );
        } else {
          toast.success(`${data.count} lead(s) imported`);
        }
        return parsedLeads;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Network error";
        setError(msg);
        toast.error(msg);
        return null;
      } finally {
        setIsUploading(false);
      }
    },
    [sessionId],
  );

  const reset = useCallback(() => {
    setLeads([]);
    setParseErrors([]);
    setError(null);
  }, []);

  return { leads, parseErrors, isUploading, error, upload, reset };
}
