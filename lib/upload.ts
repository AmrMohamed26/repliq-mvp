import busboy from "busboy";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { logger } from "./logger";

export interface UploadedFile {
  fieldName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  savedPath: string;
}

export class UploadError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

const FILENAME_SAFE_RE = /[^\w.\-]/g;

/**
 * Streams a multipart/form-data upload directly to `destPath` on disk.
 *
 * At most one stream buffer (~16 kB) is held in memory at any time —
 * the file is never accumulated into a Buffer or string.
 *
 * For `targetField`: the HTML form field name expected to contain the file.
 * Any other file fields are discarded (stream resumed and ignored).
 */
export async function receiveFileUpload(
  request: Request,
  targetField: string,
  destPath: string,
  limits: {
    maxBytes: number;
    allowedTypes: string[];
  },
): Promise<UploadedFile> {
  const ct = request.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    throw new UploadError(
      "Expected Content-Type: multipart/form-data",
      "BAD_CONTENT_TYPE",
      415,
    );
  }
  if (!request.body) {
    throw new UploadError("Empty request body", "EMPTY_BODY");
  }

  return new Promise<UploadedFile>((resolve, reject) => {
    const bb = busboy({
      headers: { "content-type": ct },
      limits: {
        fileSize: limits.maxBytes,
        files: 1, // only one file per request
      },
    });

    let settled = false;
    const done = (v: UploadedFile) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    const fail = (err: Error) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    };

    let sizeBytes = 0;
    let truncated = false;
    let fileHandled = false;

    bb.on("file", (field, stream, info) => {
      if (field !== targetField) {
        stream.resume(); // discard other fields
        return;
      }
      fileHandled = true;

      const { filename, mimeType: rawMime } = info;
      const safeFilename = filename.replace(FILENAME_SAFE_RE, "_");

      // Browsers sometimes send 'application/octet-stream' — infer from extension
      const effectiveMime =
        rawMime === "application/octet-stream"
          ? inferMimeFromFilename(safeFilename)
          : rawMime;

      if (!limits.allowedTypes.includes(effectiveMime)) {
        stream.resume(); // must drain stream before destroying
        fail(
          new UploadError(
            `Invalid file type "${effectiveMime}". Allowed: ${limits.allowedTypes.join(", ")}`,
            "INVALID_MIME_TYPE",
          ),
        );
        return;
      }

      const ws = createWriteStream(destPath);

      stream.on("data", (chunk: Buffer) => {
        sizeBytes += chunk.length;
      });

      stream.on("limit", () => {
        truncated = true;
        logger.warn({ field, destPath, maxBytes: limits.maxBytes }, "upload truncated");
        ws.destroy(
          new UploadError(
            `File exceeds maximum size of ${(limits.maxBytes / 1024 / 1024).toFixed(0)} MB`,
            "FILE_TOO_LARGE",
          ),
        );
      });

      stream.pipe(ws);

      ws.on("finish", () => {
        if (truncated) return; // error already emitted via ws.destroy
        logger.debug({ field, sizeBytes, destPath }, "upload complete");
        done({
          fieldName: field,
          originalName: safeFilename,
          mimeType: effectiveMime,
          sizeBytes,
          savedPath: destPath,
        });
      });

      ws.on("error", (err) => {
        fail(
          err instanceof UploadError
            ? err
            : new UploadError(err.message, "WRITE_ERROR", 500),
        );
      });
    });

    bb.on("finish", () => {
      if (!fileHandled && !settled) {
        fail(
          new UploadError(
            `Field "${targetField}" not found in upload`,
            "MISSING_FIELD",
          ),
        );
      }
    });

    bb.on("error", (err) =>
      fail(new UploadError(String(err), "BUSBOY_ERROR", 400)),
    );

    // Web ReadableStream → Node.js Readable (Node 17+)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodeStream = Readable.fromWeb(request.body as any);
    nodeStream.on("error", (err) =>
      fail(new UploadError(err.message, "STREAM_ERROR", 500)),
    );
    nodeStream.pipe(bb);
  });
}

function inferMimeFromFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    m4v: "video/x-m4v",
    csv: "text/csv",
    txt: "text/plain",
  };
  return map[ext] ?? "application/octet-stream";
}
