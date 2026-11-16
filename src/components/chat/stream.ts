/**
 * Reads one turn's stream in the browser (stage 199): Server-Sent Events from /app/chat/api/turn, each turned into a TurnEvent.
 * A line that isn't an event is skipped. Resolves when the stream ends (or rejects when it's cut off), so the caller can tell a
 * finished answer from a dropped connection by whether "done" arrived.
 */
import type { TurnEvent } from "@/core/chat/protocol";
import { SseReader } from "@/core/chat/sse";

const TYPES = new Set(["start", "thinking", "route", "text", "image", "title", "done"]);

export async function readTurnStream(body: ReadableStream<Uint8Array>, onEvent: (e: TurnEvent) => void): Promise<{ done: boolean }> {
  const reader = body.getReader();
  const sse = new SseReader();
  let done = false;
  for (;;) {
    const chunk = await reader.read();
    for (const ev of chunk.done ? sse.flush() : sse.push(chunk.value)) {
      let parsed: TurnEvent;
      try {
        parsed = JSON.parse(ev.data) as TurnEvent;
      } catch {
        continue;
      }
      if (!parsed || typeof parsed !== "object" || !TYPES.has((parsed as { type?: string }).type ?? "")) continue;
      if (parsed.type === "done") done = true;
      onEvent(parsed);
    }
    if (chunk.done) return { done };
  }
}
