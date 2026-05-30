"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

export interface VideoUploadState {
  progress: number;
  isUploading: boolean;
  durationSec: number | null;
  error: string | null;
  upload: (file: File) => Promise<number | null>;
  reset: () => void;
}

export function useVideoUpload(sessionId: string | null): VideoUploadState {
  const [progress, setProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    (file: File): Promise<number | null> => {
      if (!sessionId) {
        toast.error("No active session — please refresh");
        return Promise.resolve(null);
      }

      setIsUploading(true);
      setProgress(0);
      setError(null);

      return new Promise<number | null>((resolve) => {
        const xhr = new XMLHttpRequest();
        const formData = new FormData();
        formData.append("file", file);

        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            setProgress(Math.round((e.loaded / e.total) * 100));
          }
        });

        xhr.addEventListener("load", () => {
          setIsUploading(false);
          if (xhr.status >= 200 && xhr.status < 300) {
            const data = JSON.parse(xhr.responseText) as {
              durationSec: number;
            };
            setDurationSec(data.durationSec);
            setProgress(100);
            toast.success(
              `Video ready — ${data.durationSec.toFixed(1)} s`,
            );
            resolve(data.durationSec);
          } else {
            const data = JSON.parse(xhr.responseText) as { error: string };
            const msg = data.error ?? "Upload failed";
            setError(msg);
            toast.error(msg);
            resolve(null);
          }
        });

        xhr.addEventListener("error", () => {
          setIsUploading(false);
          const msg = "Network error during video upload";
          setError(msg);
          toast.error(msg);
          resolve(null);
        });

        xhr.open("POST", `/api/upload/video?sessionId=${sessionId}`);
        xhr.send(formData);
      });
    },
    [sessionId],
  );

  const reset = useCallback(() => {
    setProgress(0);
    setDurationSec(null);
    setError(null);
  }, []);

  return { progress, isUploading, durationSec, error, upload, reset };
}
