import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { extname, join, normalize } from "node:path";
import type { NextRequest } from "next/server";
import { env } from "@/lib/env";

type Params = { params: Promise<{ key: string[] }> };

const LOCAL_ASSET_ROOT = join(env.TMP_DIR, "local-assets");

function contentTypeFor(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".mp4":
      return "video/mp4";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    default:
      return "application/octet-stream";
  }
}

/**
 * Legacy local development delivery for assets generated before public storage
 * was required.
 *
 * New worker outputs use Supabase Storage public HTTPS URLs. This route only
 * serves pre-existing /tmp/repliq/local-assets files and blocks path traversal.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const { key } = await params;
  const relativeKey = key.join("/");
  const safeRelative = normalize(relativeKey).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = join(LOCAL_ASSET_ROOT, safeRelative);

  if (!filePath.startsWith(LOCAL_ASSET_ROOT)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      return new Response("Not found", { status: 404 });
    }

    const download = _request.nextUrl.searchParams.get("download") === "1";
    const headers = new Headers({
      "Content-Type": contentTypeFor(filePath),
      "Content-Length": String(fileStat.size),
      "Cache-Control": "private, max-age=3600",
      "Accept-Ranges": "bytes",
    });
    if (download) {
      headers.set(
        "Content-Disposition",
        `attachment; filename="${safeRelative.split("/").at(-1) ?? "asset"}"`,
      );
    }

    const range = _request.headers.get("range");
    if (range?.startsWith("bytes=")) {
      const [startRaw, endRaw] = range.replace("bytes=", "").split("-");
      const start = Number.parseInt(startRaw, 10);
      const end = endRaw
        ? Number.parseInt(endRaw, 10)
        : Math.min(start + 1024 * 1024 - 1, fileStat.size - 1);
      if (
        Number.isInteger(start) &&
        Number.isInteger(end) &&
        start >= 0 &&
        end >= start &&
        start < fileStat.size
      ) {
        const chunkEnd = Math.min(end, fileStat.size - 1);
        headers.set("Content-Length", String(chunkEnd - start + 1));
        headers.set("Content-Range", `bytes ${start}-${chunkEnd}/${fileStat.size}`);
        const stream = Readable.toWeb(createReadStream(filePath, { start, end: chunkEnd }));
        return new Response(stream as ReadableStream, {
          status: 206,
          headers,
        });
      }
    }

    const stream = Readable.toWeb(createReadStream(filePath));
    return new Response(stream as ReadableStream, {
      headers,
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
