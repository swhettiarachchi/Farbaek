import { createSupabaseServerClient } from "@/server/supabase/server";
import { readSketchPhoto } from "@/server/survey/sketch-photos";

export const dynamic = "force-dynamic";

/**
 * A sketch photo kept with a plan (stage 230, ADR 0240), read as the person through row-level security: only a workspace they're in.
 * Served with the type checked when it was kept, never sniffed, and sandboxed, as the studios serve their pictures.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string; id: string }> }) {
  const { projectId, id } = await params;
  const client = await createSupabaseServerClient();
  if (!client) return new Response("Not found", { status: 404 });
  const photo = await readSketchPhoto(client, projectId, id);
  if (!photo || !["image/jpeg", "image/png", "image/webp"].includes(photo.mime)) return new Response("Not found", { status: 404 });
  const bytes = Buffer.from(photo.content, "base64");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": photo.mime,
      "content-length": String(bytes.length),
      "content-disposition": "inline",
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox; default-src 'none'",
      "referrer-policy": "no-referrer",
      "cache-control": "private, max-age=300",
    },
  });
}
