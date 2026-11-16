/**
 * The studios' browser helpers (stage 201, ADR 0216): reading a request's stream, shrinking a large photo before it's uploaded,
 * and naming the days the library is grouped by.
 */
import { SseReader } from "@/core/chat/sse";
import type { StudioEvent, StudioItem } from "@/core/studio/studio";

const TYPES = new Set(["start", "partial", "item", "failed", "progress", "done"]);

export function mediaUrl(id: string, download = false): string {
  return `/app/studio/media/${id}${download ? "?download" : ""}`;
}

/** Reads a studio stream, one event at a time; resolves with whether "done" arrived. */
export async function readStudioStream(body: ReadableStream<Uint8Array>, onEvent: (e: StudioEvent) => void): Promise<{ done: boolean }> {
  const reader = body.getReader();
  const sse = new SseReader();
  let done = false;
  for (;;) {
    const chunk = await reader.read();
    for (const ev of chunk.done ? sse.flush() : sse.push(chunk.value)) {
      let parsed: StudioEvent;
      try {
        parsed = JSON.parse(ev.data) as StudioEvent;
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

/** Starts a studio request: a JSON refusal comes back as its message; otherwise the stream is read to the end. */
export async function runStudio(url: string, body: unknown, onEvent: (e: StudioEvent) => void, signal: AbortSignal): Promise<{ ok: true; done: boolean } | { ok: false; message: string }> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
  } catch {
    return { ok: false, message: "Farbaek couldn't be reached. Check your connection and try again." };
  }
  if (!res.ok || !(res.headers.get("content-type") ?? "").includes("text/event-stream") || !res.body) {
    const j = (await res.json().catch(() => null)) as { message?: string } | null;
    return { ok: false, message: j?.message ?? "That didn't start. Try again." };
  }
  try {
    const r = await readStudioStream(res.body, onEvent);
    return { ok: true, done: r.done };
  } catch {
    return { ok: true, done: false };
  }
}

const MAX_EDGE = 2048;

/** A picture made smaller in the browser when it's large (2048 px on its longest side), as WebP, keeping its shape. */
async function shrink(file: File): Promise<{ data: string; name: string }> {
  const toBase64 = async (blob: Blob) => {
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = "";
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  };
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= 4 * 1024 * 1024 && /^image\/(png|jpeg|webp)$/.test(file.type)) return { data: await toBase64(file), name: file.name };
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.92));
    if (!blob) return { data: await toBase64(file), name: file.name };
    return { data: await toBase64(blob), name: file.name.replace(/\.[a-z0-9]+$/i, "") + ".webp" };
  } catch {
    return { data: await toBase64(file), name: file.name };
  }
}

/** Uploads a picture to work from; answers with the saved item or the reason it wasn't. */
export async function uploadPicture(file: File): Promise<{ ok: true; item: StudioItem } | { ok: false; message: string }> {
  if (!/^image\//.test(file.type)) return { ok: false, message: `${file.name} isn't a picture.` };
  const { data, name } = await shrink(file);
  try {
    const res = await fetch("/app/studio/api/upload", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, data }) });
    const j = (await res.json().catch(() => null)) as { ok?: boolean; item?: StudioItem; message?: string } | null;
    if (res.ok && j?.ok && j.item) return { ok: true, item: j.item };
    return { ok: false, message: j?.message ?? "That picture couldn't be uploaded." };
  } catch {
    return { ok: false, message: "Farbaek couldn't be reached. Check your connection and try again." };
  }
}

/** "Today", "Yesterday" or the date, for grouping the library. */
export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(now) - start(d)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}
