"use client";

import { useRef, useState } from "react";
import Image from "next/image";
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

  const showPoster = Boolean(posterUrl && !started);

  return (
    <div
      className={cn(
        "relative aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl shadow-black/50",
        className,
      )}
    >
      {showPoster && posterUrl && (
        <Image
          src={posterUrl}
          alt=""
          fill
          priority
          quality={95}
          sizes="(max-width: 960px) 92vw, 960px"
          className="object-cover"
        />
      )}

      <video
        ref={videoRef}
        className={cn(
          "absolute inset-0 h-full w-full bg-black object-contain",
          showPoster ? "opacity-0" : "opacity-100",
        )}
        src={videoUrl}
        controls={started}
        playsInline
        preload={showPoster ? "none" : "metadata"}
        onPlay={() => setStarted(true)}
      />

      {showPoster && (
        <button
          type="button"
          onClick={handlePlayClick}
          className="absolute inset-0 z-10 flex cursor-pointer items-center justify-center border-0 bg-black/20 p-0 transition-colors hover:bg-black/30"
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
