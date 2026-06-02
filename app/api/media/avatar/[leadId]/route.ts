import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { NextResponse } from "next/server";
import ffmpeg from "fluent-ffmpeg";
import { resolveFfmpegPath } from "@/lib/ffmpeg-bin";
import { getSession, getVideoIndex } from "@/lib/session";
import { ensureTalkingHeadLocal } from "@/lib/talking-head";

type Params = { params: Promise<{ leadId: string }> };

const AVATAR_PX = 128;

ffmpeg.setFfmpegPath(resolveFfmpegPath());

function extractAvatarJpeg(videoPath: string, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .outputOptions([
        "-ss 00:00:00.5",
        "-frames:v 1",
        "-vf",
        `scale=${AVATAR_PX}:${AVATAR_PX}:force_original_aspect_ratio=increase,crop=${AVATAR_PX}:${AVATAR_PX},format=yuv420p`,
        "-q:v",
        "3",
        "-f",
        "image2",
      ])
      .output(outPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });
}

/**
 * GET /api/media/avatar/[leadId]
 * Circular-cropped talking-head frame for email HTML overlay.
 */
export async function GET(
  _req: Request,
  { params }: Params,
): Promise<NextResponse> {
  const { leadId } = await params;
  const index = await getVideoIndex(leadId);
  if (!index?.sessionId) {
    return new NextResponse("Not found", { status: 404 });
  }

  const session = await getSession(index.sessionId);
  if (!session?.talkingHeadPath && !session?.talkingHeadStorageKey) {
    return new NextResponse("Avatar source unavailable", { status: 404 });
  }

  let tmpDir: string | undefined;
  try {
    const localVideo = await ensureTalkingHeadLocal(
      index.sessionId,
      session.talkingHeadPath ?? "",
      session.talkingHeadStorageKey,
    );
    tmpDir = await mkdtemp(join(tmpdir(), "repliq-avatar-"));
    const outPath = join(tmpDir, "avatar.jpg");
    await extractAvatarJpeg(localVideo, outPath);
    const body = await readFile(outPath);

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Disposition": "inline",
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return new NextResponse("Failed to load avatar", { status: 502 });
  } finally {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
