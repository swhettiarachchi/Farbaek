import type { ExtractedPage } from "./extract.mjs";
import type { fetchPage, fetchPicture, PictureResult, ReaderNet } from "./fetch.mjs";

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
}): {
  read(url: string, options?: { timeoutMs?: number; hintedDate?: string | null; signal?: AbortSignal }): Promise<ReadResult>;
  picture(url: string, options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<PictureResult>;
  stats(): { active: number; waiting: number; pictures: number; pictureBytes: number; picturesActive: number; picturesWaiting: number };
};
