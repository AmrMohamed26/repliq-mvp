import type { Lead } from "./lead";

export type SessionStage =
  | "created"
  | "csv_uploaded"
  | "video_uploaded"
  | "processing"
  | "completed"
  | "cancelled";

export interface Session {
  id: string;
  createdAt: number;
  stage: SessionStage;
  leads: Lead[];
  talkingHeadPath?: string;
  /** Supabase object key when the talking head was uploaded from Vercel/serverless. */
  talkingHeadStorageKey?: string;
  talkingHeadDurationSec?: number;
}
