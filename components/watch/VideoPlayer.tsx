"use client";

import { useRef, useState } from "react";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

interface VideoPlayerProps {
  videoUrl: string;
  posterUrl?: string;
  className?: string;
}

export function VideoPlayer({ videoUrl, posterUrl, className }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);

  function handlePlayClick() {
    const el = videoRef.current;
    if (!el) return;
    void el.play();
    setStarted(true);
  }

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl shadow-black/50",
        className,
      )}
    >
      <video
        ref={videoRef}
        className="block aspect-video w-full bg-black object-contain"
        src={videoUrl}
        poster={posterUrl}
        controls={started}
        playsInline
        preload="metadata"
        onPlay={() => setStarted(true)}
      />
      {!started && (
        <button
          type="button"
          onClick={handlePlayClick}
          className="absolute inset-0 flex cursor-pointer items-center justify-center border-0 bg-black/25 p-0 transition-colors hover:bg-black/35"
          aria-label="Play video"
        >
          <span className="flex size-[4.5rem] items-center justify-center rounded-full bg-white/95 shadow-[0_8px_32px_rgba(0,0,0,0.45)] ring-1 ring-white/30 sm:size-20">
            <Play className="size-8 translate-x-0.5 fill-[#0a0a0a] text-[#0a0a0a] sm:size-9" />
          </span>
        </button>
      )}
    </div>
  );
}
