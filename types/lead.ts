export type LeadStatus =
  | "pending"
  | "screenshotting"
  | "rendering"
  | "uploading"
  | "done"
  | "failed";

export interface LeadMetadata {
  companyName?: string;
  blocked?: boolean;
  blockedReason?: string;
  upworkPrivate?: boolean;
  [key: string]: unknown;
}

export interface Lead {
  id: string;
  /** Stable public path segment for /v/[slug] (assigned at creation, never changes). */
  slug?: string;
  name: string;
  email: string;
  website: string;
  metadata?: LeadMetadata;
}

export interface LeadResult extends Lead {
  status: LeadStatus;
  videoUrl?: string;
  thumbnailUrl?: string;
  /** High-res poster for watch UI (no baked play icon). */
  posterThumbnailUrl?: string;
  /** Watch page share link (/v/[id]) for email and CSV when status=done. */
  shortUrl?: string;
  error?: string;
  startedAt?: number;   // epoch ms when job started
  finishedAt?: number;  // epoch ms when job completed (success or failure)
  renderTime?: number;  // ms spent exclusively in the Remotion render stage
}
