/**
 * The app's side of the page reader (stage 205, ADR 0222): asks the reader service to read one page and waits no longer than
 * the time left. The app never fetches a page address itself. Server-only.
 */
import { PICTURE_MAX_BYTES } from "@/core/web/pictures";
import type { ReadResult } from "@/server/web/reader/read.mjs";

export interface ReaderClient {
  read(url: string, options: { timeoutMs: number; hintedDate: string | null; signal: AbortSignal }): Promise<ReadResult>;
  /** A picture's bytes and kind (stage 278), or null when the reader couldn't or wouldn't fetch it. */
  picture(url: string, options: { timeoutMs: number; signal: AbortSignal }): Promise<{ bytes: Uint8Array; contentType: string } | null>;
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
          signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs + 500)]),
          redirect: "error",
        });
        if (!response.ok) return { ok: false, reason: "the page reader answered with an error" };
        const body = (await response.json()) as ReadResult;
        return body && typeof body === "object" && "ok" in body ? body : { ok: false, reason: "the page reader gave an answer Farbaek couldn't read" };
      } catch {
        return { ok: false, reason: signal.aborted ? "stopped" : "the page reader didn't answer in time" };
      }
    },
    async picture(url, { timeoutMs, signal }) {
      try {
        const response = await fetcher(`${baseUrl}/picture`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url, timeoutMs }),
          signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs + 500)]),
          redirect: "error",
        });
        if (!response.ok) return null;
        const contentType = response.headers.get("content-type") ?? "";
        // The reader caps what it fetches; this is the app's own word on how much it will hold.
        if (Number(response.headers.get("content-length") ?? 0) > PICTURE_MAX_BYTES) return null;
        const bytes = new Uint8Array(await response.arrayBuffer());
        return bytes.byteLength > 0 && bytes.byteLength <= PICTURE_MAX_BYTES ? { bytes, contentType } : null;
      } catch {
        return null;
      }
    },
  };
}
