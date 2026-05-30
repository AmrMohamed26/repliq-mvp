import { NextResponse } from "next/server";
import { UploadError } from "./upload";
import { logger } from "./logger";

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function created<T>(data: T): NextResponse {
  return NextResponse.json(data, { status: 201 });
}

export function notFound(message = "Not found"): NextResponse {
  return NextResponse.json({ error: message, code: "NOT_FOUND" }, { status: 404 });
}

export function badRequest(message: string, code = "BAD_REQUEST"): NextResponse {
  return NextResponse.json({ error: message, code }, { status: 400 });
}

export function conflict(message: string, code = "CONFLICT"): NextResponse {
  return NextResponse.json({ error: message, code }, { status: 409 });
}

export function unprocessable(message: string, code = "UNPROCESSABLE"): NextResponse {
  return NextResponse.json({ error: message, code }, { status: 422 });
}

/**
 * Catches any thrown error and converts it to an appropriate JSON response.
 * UploadError includes a status code. Everything else → 500.
 */
export function handleError(err: unknown): NextResponse {
  if (err instanceof UploadError) {
    logger.warn({ code: err.code, message: err.message }, "upload error");
    return NextResponse.json(
      { error: err.message, code: err.code },
      { status: err.status },
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  logger.error({ err }, "unhandled route error");
  return NextResponse.json(
    { error: message, code: "INTERNAL_ERROR" },
    { status: 500 },
  );
}
