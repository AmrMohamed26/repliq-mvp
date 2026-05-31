export interface LeadJobData {
  sessionId: string;
  leadId: string;
  name: string;
  email: string;
  website: string;
  talkingHeadPath: string;
  talkingHeadStorageKey?: string;
  durationSec: number;
}

export interface ProgressEvent {
  sessionId: string;
  leadId: string;
  status:
    | "pending"
    | "screenshotting"
    | "rendering"
    | "uploading"
    | "done"
    | "failed";
  message?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  posterThumbnailUrl?: string;
  error?: string;
  timestamp: number;
  startedAt?: number;
  finishedAt?: number;
  renderTime?: number;
}
