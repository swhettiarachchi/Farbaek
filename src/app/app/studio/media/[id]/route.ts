import { readStudioBytes } from "@/server/studio/studio";
import { createSupabaseServerClient } from "@/server/supabase/server";

export const dynamic = "force-dynamic";

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "video/mp4": "mp4" };

/**
 * A studio picture or video (stage 201, ADR 0216), read as the person through row level security: only their own, in a workspace
 * they're in. Served with the type checked when it was saved, never sniffed, sandboxed, and with byte ranges so a video plays and
 * seeks in every browser. ?download saves it, named as AI-made.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const client = await createSupabaseServerClient();
  if (!client) return new Response("Not found", { status: 404 });
  const file = await readStudioBytes(client, id);
  if (!file) return new Response("Not found", { status: 404 });
  const bytes = Buffer.from(file.content, "base64");
  const download = new URL(request.url).searchParams.has("download");
  const name = `farbaek-ai-${file.kind === "upload" ? "upload" : "made"}-${id.slice(0, 8)}.${EXT[file.mime] ?? "bin"}`;
  const headers: Record<string, string> = {
    "content-type": file.mime,
    "content-disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
    "x-content-type-options": "nosniff",
    "content-security-policy": "sandbox; default-src 'none'",
    "referrer-policy": "no-referrer",
    "accept-ranges": "bytes",
    // Kept briefly: a deleted picture shouldn't linger in a shared browser for a day.
    "cache-control": "private, max-age=300",
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    const size = bytes.length;
    const start = Math.max(0, range[1] ? Number(range[1]) : size - Number(range[2]));
    const end = Math.min(size - 1, range[1] && range[2] ? Number(range[2]) : size - 1);
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    const part = bytes.subarray(start, end + 1);
    return new Response(new Uint8Array(part), { status: 206, headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(part.length) } });
  }
  return new Response(new Uint8Array(bytes), { headers: { ...headers, "content-length": String(bytes.length) } });
}
