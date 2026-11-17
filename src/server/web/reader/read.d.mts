import type { ExtractedPage } from "./extract.mjs";
import type { fetchPage, ReaderNet } from "./fetch.mjs";

export type ReadResult = ({ ok: true; url: string } & ExtractedPage) | { ok: false; reason: string };

export function createReader(options?: {
  net?: ReaderNet;
  now?: () => number;
  maxConcurrent?: number;
  perHost?: number;
  pageTtlMs?: number;
  robotsTtlMs?: number;
  fetcher?: typeof fetchPage;
}): {
  read(url: string, options?: { timeoutMs?: number; hintedDate?: string | null; signal?: AbortSignal }): Promise<ReadResult>;
  stats(): { active: number; waiting: number };
};
