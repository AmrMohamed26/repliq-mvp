"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Video, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { DropZone } from "@/components/shared/DropZone";
import { BlurFade } from "@/components/shared/BlurFade";
import { useVideoUpload } from "@/hooks/useVideoUpload";

interface StepVideoProps {
  sessionId: string | null;
  onNext: (durationSec: number) => void;
  onBack: () => void;
}

export function StepVideo({ sessionId, onNext, onBack }: StepVideoProps) {
  const { progress, isUploading, durationSec, error, upload } =
    useVideoUpload(sessionId);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | undefined>();
  const videoRef = useRef<HTMLVideoElement>(null);

  async function handleFile(file: File) {
    // Show preview immediately using a local object URL
    if (localUrl) URL.revokeObjectURL(localUrl);
    const url = URL.createObjectURL(file);
    setLocalUrl(url);
    setFileName(file.name);
    await upload(file);
  }

  // Seek to 1s for a better thumbnail frame
  useEffect(() => {
    if (localUrl && videoRef.current) {
      videoRef.current.currentTime = 1;
    }
  }, [localUrl]);

  const canContinue = durationSec !== null;

  return (
    <div className="flex flex-col gap-8">
      <BlurFade delay={0}>
        <div className="space-y-1">
          <h2 className="text-xl font-medium tracking-tight">
            Upload your talking head
          </h2>
          <p className="text-sm text-muted-foreground">
            MP4 or MOV · max 200 MB · max 5 minutes. This video is reused
            across every lead — record once.
          </p>
        </div>
      </BlurFade>

      <BlurFade delay={0.06}>
        <DropZone
          onFile={handleFile}
          accept={{
            "video/mp4": [".mp4"],
            "video/quicktime": [".mov"],
            "video/webm": [".webm"],
          }}
          maxSize={200 * 1024 * 1024}
          label="Drop your video here, or click to browse"
          sublabel="MP4 · MOV · WebM · max 200 MB"
          disabled={isUploading}
          fileName={!localUrl ? fileName : undefined}
          error={error}
          icon={<Video className="size-5" />}
        />
      </BlurFade>

      {/* Upload progress */}
      <AnimatePresence>
        {isUploading && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Uploading…</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Video preview */}
      <AnimatePresence>
        {localUrl && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="relative overflow-hidden rounded-2xl border border-border bg-black"
          >
            <video
              ref={videoRef}
              src={localUrl}
              controls
              className="aspect-video w-full"
              preload="metadata"
            />

            {/* Duration badge — shows after server confirms */}
            <AnimatePresence>
              {durationSec !== null && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm"
                >
                  <Clock className="size-3.5" />
                  {durationSec.toFixed(1)} s
                </motion.div>
              )}
            </AnimatePresence>

            {/* Uploading overlay */}
            <AnimatePresence>
              {isUploading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm"
                >
                  <div className="flex flex-col items-center gap-3">
                    <div className="size-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                    <span className="text-xs text-white/60">Processing video…</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ChevronLeft className="size-4" />
          Back
        </Button>
        <Button
          onClick={() => durationSec !== null && onNext(durationSec)}
          disabled={!canContinue || isUploading}
          size="lg"
        >
          Continue
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
