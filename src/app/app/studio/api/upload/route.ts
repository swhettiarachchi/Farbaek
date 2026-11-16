import { z } from "zod";
import { cleanName, imageSize } from "@/core/chat/files";
import type { StudioItem } from "@/core/studio/studio";
import { sha256Hex } from "@/core/workspace/device-copy";
import { readTextCapped } from "@/server/http/body";
import { studioGate, studioJson, studioLimit, studioRefuse } from "@/server/studio/http";
import { createStudioWrites } from "@/server/studio/studio";

export const dynamic = "force-dynamic";

const body = z.object({ name: z.string().max(200), data: z.string().min(8).max(8_400_000) });
// 6 MB, so its base64 stays under the 10 MB a request may carry through the proxy. The studio shrinks large photos first.
const MAX_BYTES = 6 * 1024 * 1024;

/** The picture's type from its first bytes, never from its name. */
function sniff(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null {
  const latin = (a: number, b: number) => new TextDecoder("latin1").decode(bytes.subarray(a, b));
  if (bytes.length > 8 && bytes[0] === 0x89 && latin(1, 4) === "PNG") return "image/png";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 12 && latin(0, 4) === "RIFF" && latin(8, 12) === "WEBP") return "image/webp";
  return null;
}

/** A picture uploaded to work from (stage 201, ADR 0216): checked by its bytes, kept in the person's studio library. */
export async function POST(request: Request) {
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) return studioRefuse("That picture couldn't be read.", 400);
  const gate = await studioGate(request);
  if (!gate.ok) return gate.response;
  const text = await readTextCapped(request, 8_500_000);
  if (text === null) return studioRefuse("That picture is larger than 6 MB.", 413);
  let raw: unknown = null;
  try {
    raw = JSON.parse(text);
  } catch {
    // Read as invalid below.
  }
  const parsed = body.safeParse(raw);
  if (!parsed.success) return studioRefuse("That picture couldn't be read.", 400);
  const allowed = await studioLimit(gate.admin, `studio-upload:${gate.userId}`, 3_600, 120);
  if (!allowed) return studioRefuse("That's a lot of uploads in an hour. Try again later.", 429);

  const bytes = Buffer.from(parsed.data.data, "base64");
  if (bytes.length === 0 || bytes.length > MAX_BYTES) return studioRefuse("That picture is larger than 6 MB.", 413);
  const mime = sniff(bytes);
  if (!mime) return studioRefuse("That isn't a PNG, JPEG or WebP picture.", 415);
  const size = imageSize(bytes);
  const batchId = crypto.randomUUID();
  const name = cleanName(parsed.data.name || "picture");
  const saved = await createStudioWrites(gate.admin).save({
    orgId: gate.orgId,
    actor: gate.userId,
    batchId,
    kind: "upload",
    prompt: name,
    settings: {},
    model: null,
    parentId: null,
    mime,
    size: bytes.length,
    sha256: await sha256Hex(bytes),
    content: bytes.toString("base64"),
    width: size?.width ?? null,
    height: size?.height ?? null,
  });
  if (!saved.ok) {
    const full = saved.error.includes("STORAGE_FULL");
    return studioRefuse(full ? "Your studio library is full (500 MB). Delete some items first." : "That picture couldn't be saved. Try again.", full ? 409 : 503);
  }
  const item: StudioItem = { id: saved.value, batchId, kind: "upload", status: "ready", prompt: name, settings: {}, mime, width: size?.width ?? null, height: size?.height ?? null, durationMs: null, sizeBytes: bytes.length, error: null, parentId: null, createdAt: new Date().toISOString() };
  return studioJson({ ok: true, item });
}
