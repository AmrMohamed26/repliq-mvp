import { access } from "node:fs/promises";
import {
  downloadFileToPath,
  isSupabaseStorageConfigured,
  uploadFile,
} from "./storage";
import { ensureSessionDir, talkingHeadPath } from "./files";

export function talkingHeadStorageKey(sessionId: string): string {
  return `talking-heads/${sessionId}/talking.mp4`;
}

async function fileExists(path: string): Promise<boolean> {
  return access(path).then(() => true).catch(() => false);
}

/**
 * After upload on Vercel, copy the talking head to Supabase so workers on other
 * machines can download it before render.
 */
export async function uploadTalkingHeadToStorage(
  sessionId: string,
  localPath: string,
): Promise<string | undefined> {
  if (!isSupabaseStorageConfigured()) return undefined;
  const key = talkingHeadStorageKey(sessionId);
  await uploadFile(key, localPath, "video/mp4");
  return key;
}

/**
 * Resolve a local filesystem path for Remotion/FFmpeg.
 * Vercel only keeps /tmp on the serverless instance — workers must pull from storage.
 */
export async function ensureTalkingHeadLocal(
  sessionId: string,
  pathFromJob: string,
  storageKey?: string,
): Promise<string> {
  if (await fileExists(pathFromJob)) {
    return pathFromJob;
  }

  const dest = talkingHeadPath(sessionId);
  if (await fileExists(dest)) {
    return dest;
  }

  const key = storageKey ?? talkingHeadStorageKey(sessionId);
  if (!isSupabaseStorageConfigured()) {
    throw new Error(
      "Talking head video is not on this machine. Run the worker on the same host as the app, or configure Supabase and upload from the deployed site.",
    );
  }

  await ensureSessionDir(sessionId);
  // #region agent log
  fetch("http://127.0.0.1:7489/ingest/874f54e3-af15-42bb-a33a-e094f9419f9f", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "b8d92c",
    },
    body: JSON.stringify({
      sessionId: "b8d92c",
      runId: "vercel-pending",
      hypothesisId: "H2",
      location: "lib/talking-head.ts:ensureTalkingHeadLocal",
      message: "downloading talking head from storage",
      data: { sessionId, storageKey: key },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  await downloadFileToPath(key, dest);
  return dest;
}
