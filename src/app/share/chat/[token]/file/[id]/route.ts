import { chatFileResponse } from "@/server/chat/http";
import { openSharedChatFile } from "@/server/chat/share";

export const dynamic = "force-dynamic";

/** A file of a shared chat's branch (stage 199): only while the link is live, and only files of the messages it shares. */
export async function GET(request: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const file = await openSharedChatFile(token, id);
  if (!file) return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  return chatFileResponse(file, { download: new URL(request.url).searchParams.has("download"), cache: "none" });
}
