import { z } from "zod";

// ─── Shared ────────────────────────────────────────────────────────────────

export const apiErrorSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.unknown().optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

// ─── Session ───────────────────────────────────────────────────────────────

export const sessionStageSchema = z.enum([
  "created",
  "csv_uploaded",
  "video_uploaded",
  "processing",
  "completed",
  "cancelled",
]);

export const sessionResponseSchema = z.object({
  sessionId: z.string(),
  stage: sessionStageSchema,
  createdAt: z.number(),
  leadCount: z.number(),
});

export type SessionResponse = z.infer<typeof sessionResponseSchema>;

// ─── CSV Upload ────────────────────────────────────────────────────────────

export const parseErrorSchema = z.object({
  row: z.number(),
  message: z.string(),
});

export const leadSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  website: z.string(),
});

export const csvUploadResponseSchema = z.object({
  count: z.number(),
  leads: z.array(leadSchema),
  errors: z.array(parseErrorSchema),
});

export type CsvUploadResponse = z.infer<typeof csvUploadResponseSchema>;

// Limits
export const CSV_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const CSV_ALLOWED_TYPES = [
  "text/csv",
  "application/csv",
  "text/plain",
  "application/vnd.ms-excel",
];

// ─── Video Upload ──────────────────────────────────────────────────────────

export const videoUploadResponseSchema = z.object({
  durationSec: z.number(),
  savedPath: z.string(),
});

export type VideoUploadResponse = z.infer<typeof videoUploadResponseSchema>;

export const VIDEO_MAX_BYTES = 200 * 1024 * 1024; // 200 MB
export const VIDEO_ALLOWED_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
];
export const VIDEO_MIN_DURATION_SEC = 1;
export const VIDEO_MAX_DURATION_SEC = 300; // 5 min

// ─── Process Batch ─────────────────────────────────────────────────────────

export const processRequestSchema = z.object({
  sessionId: z.string().min(1),
});

export const processResponseSchema = z.object({
  enqueuedCount: z.number(),
  sessionId: z.string(),
});

export type ProcessRequest = z.infer<typeof processRequestSchema>;
export type ProcessResponse = z.infer<typeof processResponseSchema>;

export const MAX_LEADS_PER_BATCH = 1000;

// ─── Results ───────────────────────────────────────────────────────────────

export const leadStatusSchema = z.enum([
  "pending",
  "screenshotting",
  "rendering",
  "uploading",
  "done",
  "failed",
]);

export const leadResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  website: z.string(),
  status: leadStatusSchema,
  videoUrl: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  error: z.string().optional(),
  startedAt: z.number().optional(),
  finishedAt: z.number().optional(),
});

export const resultsResponseSchema = z.object({
  sessionId: z.string(),
  stage: sessionStageSchema,
  totalLeads: z.number(),
  results: z.array(leadResultSchema),
  completedCount: z.number(),
  failedCount: z.number(),
});

export type LeadResultResponse = z.infer<typeof leadResultSchema>;
export type ResultsResponse = z.infer<typeof resultsResponseSchema>;
