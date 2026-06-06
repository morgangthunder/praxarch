export type ContentChannel = "meta" | "google" | "tiktok" | "linkedin" | "email";
export type ContentStatus = "draft" | "awaiting" | "scheduled" | "published" | "rejected";

export interface ContentDraftRecord {
  id: string;
  channel: ContentChannel;
  title: string;
  body: string;
  status: ContentStatus;
  createdAt: string;
}
