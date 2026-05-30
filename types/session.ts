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
  talkingHeadDurationSec?: number;
}
