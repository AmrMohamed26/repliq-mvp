import React from "react";
import {
  AbsoluteFill,
  Img,
  Video,
  useCurrentFrame,
  interpolate,
  staticFile,
} from "remotion";
import { z } from "zod";

export const loomVideoSchema = z.object({
  screenshotPath: z.string(),
  talkingHeadPath: z.string(),
  leadName: z.string(),
  /** Used by calculateMetadata in Root.tsx to derive durationInFrames. */
  durationSec: z.number().positive().optional(),
});

export type LoomVideoProps = z.infer<typeof loomVideoSchema>;

// ── Webcam overlay geometry (fixed — no per-frame computation) ──────────────
const CAM_SIZE = 270;
const CAM_PAD_X = 40;
const CAM_PAD_Y = 40;
const CAM_TOP = 1080 - CAM_SIZE - CAM_PAD_Y; // 770

// Fade-in lasts 20 frames (~0.67 s at 30 fps)
const FADE_FRAMES = 20;

/**
 * LoomVideo
 *
 * Layer 1 — Background
 *   Static viewport website screenshot covering the 1920×1080 canvas.
 *
 * Layer 2 — Webcam overlay
 *   Talking-head video pinned to the bottom-left corner.  Circular 1:1 crop,
 *   soft drop-shadow, subtle white border ring, and a gentle opacity fade-in
 *   over the first 20 frames.
 *
 * Pure and deterministic — no API calls, no filesystem writes.
 */
export const LoomVideo: React.FC<LoomVideoProps> = ({
  screenshotPath,
  talkingHeadPath,
}) => {
  const frame = useCurrentFrame();

  // ── Webcam fade-in ────────────────────────────────────────────────────────
  const camOpacity = interpolate(frame, [0, FADE_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Resolve asset URLs via Remotion's staticFile helper (served from bundle/public/)
  const screenshotUrl = staticFile(screenshotPath);
  const webcamUrl = staticFile(talkingHeadPath);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000", overflow: "hidden" }}>
      {/* ── Background: static website screenshot ──────────────────────── */}
      <AbsoluteFill>
        <Img
          src={screenshotUrl}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "top center",
          }}
        />
      </AbsoluteFill>

      {/* ── Foreground: Webcam overlay ──────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          left: CAM_PAD_X,
          top: CAM_TOP,
          width: CAM_SIZE,
          height: CAM_SIZE,
          opacity: camOpacity,
          borderRadius: "50%",
          overflow: "hidden",
          // Soft drop-shadow + subtle white border ring
          boxShadow:
            "0 8px 48px rgba(0,0,0,0.65), 0 0 0 1.5px rgba(255,255,255,0.14)",
        }}
      >
        <Video
          src={webcamUrl}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          volume={1}
          playbackRate={1}
        />
      </div>
    </AbsoluteFill>
  );
};
