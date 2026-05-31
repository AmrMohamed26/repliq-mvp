import type { NextRequest } from "next/server";
import { getSession, updateSession } from "@/lib/session";
import { receiveFileUpload, UploadError } from "@/lib/upload";
import { probeDuration } from "@/lib/ffprobe";
import { ensureSessionDir, talkingHeadPath } from "@/lib/files";
import { uploadTalkingHeadToStorage } from "@/lib/talking-head";
import { isSupabaseStorageConfigured } from "@/lib/storage";
import { ok, notFound, badRequest, conflict, handleError } from "@/lib/api";
import { logger } from "@/lib/logger";
import { VIDEO_MAX_BYTES, VIDEO_ALLOWED_TYPES } from "@/lib/validators";

/**
 * POST /api/upload/video?sessionId=xxx
 * Body: multipart/form-data with field `file` (MP4/MOV/WebM).
 *
 * The talking head video is streamed directly to disk via busboy — it is
 * never accumulated in a memory buffer. The same file on disk is referenced
 * by every lead job; it is NOT copied per lead.
 *
 * After saving, ffprobe reads the file metadata to extract duration.
 * Duration is stored in the session and passed to each lead job.
 */
export async function POST(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get("sessionId");
    if (!sessionId) return badRequest("Missing sessionId query param");

    const session = await getSession(sessionId);
    if (!session) return notFound("Session not found");
    if (session.stage === "processing" || session.stage === "completed") {
      return conflict("Cannot replace video while processing is active");
    }
    if (session.stage === "cancelled") {
      return conflict("Session is cancelled");
    }

    // Ensure /tmp/repliq/{sessionId}/ exists before streaming
    await ensureSessionDir(sessionId);
    const destPath = talkingHeadPath(sessionId);

    // Stream multipart body → disk (never into memory)
    const uploaded = await receiveFileUpload(request, "file", destPath, {
      maxBytes: VIDEO_MAX_BYTES,
      allowedTypes: VIDEO_ALLOWED_TYPES,
    });

    // Probe duration from the saved file
    let durationSec: number;
    try {
      durationSec = await probeDuration(uploaded.savedPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return badRequest(msg, "INVALID_VIDEO");
    }

    let talkingHeadStorageKey: string | undefined;
    try {
      talkingHeadStorageKey = await uploadTalkingHeadToStorage(
        sessionId,
        destPath,
      );
    } catch (err) {
      logger.error({ err, sessionId }, "talking head Supabase upload failed");
    }

    if (process.env.VERCEL === "1" && !talkingHeadStorageKey) {
      return badRequest(
        isSupabaseStorageConfigured()
          ? "Video saved but could not upload to Supabase for background processing. Check Supabase env vars and bucket permissions on Vercel."
          : "On Vercel, set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_BUCKET, and SUPABASE_PUBLIC_BASE_URL so the worker can access your talking-head video.",
        "STORAGE_UPLOAD_FAILED",
      );
    }

    // Persist talking head metadata in the session
    // Stage advances to video_uploaded (or stays at video_uploaded if re-uploaded)
    const nextStage =
      session.stage === "created" ? ("video_uploaded" as const) : session.stage;
    await updateSession(sessionId, {
      talkingHeadPath: destPath,
      talkingHeadStorageKey,
      talkingHeadDurationSec: durationSec,
      stage:
        session.stage === "csv_uploaded" || session.stage === "video_uploaded"
          ? "video_uploaded"
          : nextStage,
    });

    return ok({
      durationSec,
      savedPath: destPath,
    });
  } catch (err) {
    if (err instanceof UploadError) return handleError(err);
    return handleError(err);
  }
}
