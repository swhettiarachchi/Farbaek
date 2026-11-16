import { z } from "zod";
import { chatFileResponse } from "@/server/chat/http";
import { readFiles } from "@/server/chat/store";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { loadAppContext } from "@/server/workspace/context";

export const dynamic = "force-dynamic";

/** A chat file's bytes, for its owner only (stage 199): row level security reads it as them. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new Response("Not found", { status: 404 });
  const ctx = await loadAppContext();
  if (!ctx || ctx.mode !== "live") return new Response("Not found", { status: 404 });
  const client = await createSupabaseServerClient();
  if (!client) return new Response("Not found", { status: 404 });
  const [file] = await readFiles(client, [id]);
  if (!file) return new Response("Not found", { status: 404 });
  return chatFileResponse({ name: file.name, mime: file.mime, kind: file.kind, bytes: Buffer.from(file.content, "base64") }, { download: new URL(request.url).searchParams.has("download"), cache: "private" });
}
