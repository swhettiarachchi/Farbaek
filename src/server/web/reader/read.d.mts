import type { ExtractedPage } from "./extract.mjs";
import type { fetchPage, fetchPicture, PictureResult, ReaderNet } from "./fetch.mjs";

/** One story as a newsroom's feed gives it (stage 280). */
export interface FeedItem {
  title: string;
  url: string;
  published: string | null;
  summary: string;
  image: string | null;
}
export type FeedResult = { ok: true; items: FeedItem[] } | { ok: false; reason: string };

export type ReadResult = ({ ok: true; url: string } & ExtractedPage) | { ok: false; reason: string };

export function createReader(options?: {
  net?: ReaderNet;
  now?: () => number;
  maxConcurrent?: number;
  perHost?: number;
  pageTtlMs?: number;
  robotsTtlMs?: number;
  fetcher?: typeof fetchPage;
  pictureFetcher?: typeof fetchPicture;
  pictureTtlMs?: number;
  pictureRoomBytes?: number;
  maxPictures?: number;
  maxFeeds?: number;
}): {
  read(url: string, options?: { timeoutMs?: number; hintedDate?: string | null; signal?: AbortSignal }): Promise<ReadResult>;
  picture(url: string, options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<PictureResult>;
  feed(url: string, options?: { timeoutMs?: number; ttlMs?: number }): Promise<FeedResult>;
  stats(): { active: number; waiting: number; pictures: number; pictureBytes: number; picturesActive: number; picturesWaiting: number; feedsActive: number; feedsWaiting: number };
};
