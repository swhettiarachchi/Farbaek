/**
 * The app's side of the page reader (stage 205, ADR 0222): asks the reader service to read one page and waits no longer than
 * the time left. The app never fetches a page address itself. Server-only.
 */
import { PICTURE_MAX_BYTES } from "@/core/web/pictures";
import type { FeedItem, ReadResult } from "@/server/web/reader/read.mjs";

export interface ReaderClient {
  read(url: string, options: { timeoutMs: number; hintedDate: string | null; signal: AbortSignal }): Promise<ReadResult>;
  /** A picture's bytes and kind (stage 278), or null when the reader couldn't or wouldn't fetch it. */
  picture(url: string, options: { timeoutMs: number; signal: AbortSignal }): Promise<{ bytes: Uint8Array; contentType: string } | null>;
  /** A newsroom's feed as its newest stories (stage 280), or null when it couldn't be read. Only ever asked for an address from Farbaek's own list. */
  feed(url: string, options: { timeoutMs: number; signal: AbortSignal }): Promise<FeedItem[] | null>;
}

/** What a feed's item must be to be used: text of a sane length and an address. Anything else in the answer is dropped. */
function feedItems(body: unknown): FeedItem[] | null {
  if (!body || typeof body !== "object" || (body as { ok?: unknown }).ok !== true || !Array.isArray((body as { items?: unknown }).items)) return null;
  const out: FeedItem[] = [];
  for (const raw of (body as { items: unknown[] }).items.slice(0, 40)) {
    if (!raw || typeof raw !== "object") continue;
    const i = raw as Record<string, unknown>;
    if (typeof i.title !== "string" || typeof i.url !== "string" || !/^https?:\/\//i.test(i.url)) continue;
    out.push({
      title: i.title.slice(0, 300),
      url: i.url.slice(0, 700),
      published: typeof i.published === "string" ? i.published.slice(0, 40) : null,
      summary: typeof i.summary === "string" ? i.summary.slice(0, 700) : "",
      image: typeof i.image === "string" ? i.image.slice(0, 500) : null,
    });
  }
  return out.length > 0 ? out : null;
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
    async feed(url, { timeoutMs, signal }) {
      try {
        const response = await fetcher(`${baseUrl}/feed`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url, timeoutMs }),
          signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs + 500)]),
          redirect: "error",
        });
        if (!response.ok) return null;
        return feedItems(await response.json());
      } catch {
        return null;
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
