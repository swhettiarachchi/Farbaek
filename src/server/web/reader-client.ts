/**
 * The app's side of the page reader (stage 205, ADR 0222): asks the reader service to read one page and waits no longer than
 * the time left. The app never fetches a page address itself. Server-only.
 */
import type { ReadResult } from "@/server/web/reader/read.mjs";

export interface ReaderClient {
  read(url: string, options: { timeoutMs: number; hintedDate: string | null; signal: AbortSignal }): Promise<ReadResult>;
}

export function createReaderClient(baseUrl: string, fetcher: typeof fetch = fetch): ReaderClient {
  return {
    async read(url, { timeoutMs, hintedDate, signal }) {
      try {
        const response = await fetcher(`${baseUrl}/read`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url, timeoutMs, hintedDate }),
          // A little longer than the reader's own limit, so its answer (even "timed out") arrives.
          signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs + 750)]),
          redirect: "error",
        });
        if (!response.ok) return { ok: false, reason: "the page reader answered with an error" };
        const body = (await response.json()) as ReadResult;
        return body && typeof body === "object" && "ok" in body ? body : { ok: false, reason: "the page reader gave an answer Farbaek couldn't read" };
      } catch {
        return { ok: false, reason: signal.aborted ? "stopped" : "the page reader didn't answer in time" };
      }
    },
  };
}
