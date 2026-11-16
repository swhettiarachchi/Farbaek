/**
 * Server-Sent Events, both ways (stage 199, ADR 0213): Farbaek writes its own stream of an answer to the browser with encodeEvent,
 * and reads a model provider's stream (and the browser reads Farbaek's) with SseReader, which copes with events split anywhere
 * across network chunks.
 */

export interface SseEvent {
  event: string;
  data: string;
}

const encoder = new TextEncoder();

export function encodeEvent(event: string, data: unknown): Uint8Array {
  // JSON never contains a raw newline, so one data line carries it.
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** A comment line: keeps proxies from closing a quiet connection while the model thinks. */
export function encodeKeepAlive(): Uint8Array {
  return encoder.encode(": keep-alive\n\n");
}

export class SseReader {
  private buffer = "";
  private readonly decoder = new TextDecoder();

  /** Adds a chunk and returns the events it completed. */
  push(chunk: Uint8Array | string): SseEvent[] {
    this.buffer += typeof chunk === "string" ? chunk : this.decoder.decode(chunk, { stream: true });
    const events: SseEvent[] = [];
    // Events end with a blank line; \r\n and \r count as line ends too.
    this.buffer = this.buffer.replace(/\r\n?/g, "\n");
    let end = this.buffer.indexOf("\n\n");
    while (end >= 0) {
      const raw = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 2);
      const parsed = parseEvent(raw);
      if (parsed) events.push(parsed);
      end = this.buffer.indexOf("\n\n");
    }
    // A provider that never sends a blank line can't grow the buffer forever.
    if (this.buffer.length > 4_000_000) this.buffer = "";
    return events;
  }

  /** What's left when the stream ends, if it ended without its final blank line. */
  flush(): SseEvent[] {
    const rest = this.buffer + this.decoder.decode();
    this.buffer = "";
    const parsed = rest.trim() ? parseEvent(rest.replace(/\r\n?/g, "\n").replace(/\n+$/, "")) : null;
    return parsed ? [parsed] : [];
  }
}

function parseEvent(raw: string): SseEvent | null {
  let event = "message";
  const data: string[] = [];
  for (const line of raw.split("\n")) {
    if (!line || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
  }
  return data.length === 0 && event === "message" ? null : { event, data: data.join("\n") };
}
