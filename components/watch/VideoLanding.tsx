"use client";

import {
  CAL_BOOKING_URL,
  firstNameFromName,
  personalizedVideoIntroBody,
  VIDEO_NEAR_HINT,
} from "@/lib/personalized-message";
import { VideoPlayer } from "./VideoPlayer";

interface VideoLandingProps {
  name: string;
  videoUrl: string;
  /** High-res frame without baked-in play icon (watch poster). */
  posterUrl?: string;
}

export function VideoLanding({ name, videoUrl, posterUrl }: VideoLandingProps) {
  const firstName = firstNameFromName(name);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] px-5 py-12 text-center text-[#fafafa]">
      <div className="flex w-full max-w-[min(960px,92vw)] flex-col items-center gap-7">
        <header className="flex flex-col items-center gap-4">
          <h1 className="m-0 text-[2rem] font-semibold leading-tight tracking-[-0.02em] sm:text-[2.35rem]">
            Hi {firstName}
          </h1>
          <p className="m-0 max-w-[480px] text-base leading-relaxed text-[#a3a3a3] sm:text-[1.05rem]">
            {personalizedVideoIntroBody()}
          </p>
        </header>

        <div className="flex w-full flex-col items-center gap-2">
          <p className="m-0 text-[11px] leading-snug text-[#737373]">
            {VIDEO_NEAR_HINT}
          </p>
          <VideoPlayer videoUrl={videoUrl} posterUrl={posterUrl} />
        </div>

        <a
          href={CAL_BOOKING_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-full bg-white px-8 py-3.5 text-[15px] font-semibold text-[#0a0a0a] no-underline transition-colors hover:bg-[#e8e8e8] sm:text-base"
        >
          Book a Call
        </a>
      </div>
    </div>
  );
}
