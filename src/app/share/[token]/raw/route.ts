import { imageMime, isImagePath } from "@/core/workspace/images";
import { sharePathVisible } from "@/core/workspace/sharing";
import { countShareOpen, readSharedFile } from "@/server/workspace/share-access";

export const dynamic = "force-dynamic";

/**
 * GET /share/<token>/raw?path=… (ADR 0188): one image of a shared project,
 * with its exact type. Images only: text is never served on its own from
 * Farbaek's origin, and the answer is sandboxed so nothing in it can run.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const path = new URL(request.url).searchParams.get("path") ?? "";
  const mime = imageMime(path);
  if (!isImagePath(path) || !mime || !sharePathVisible(path).visible) return text(404, "Not found");
  const counted = await countShareOpen("view");
  if (counted === "limited") return text(429, "Too many opens from your network. Try again later.");
  if (counted === "unavailable") return text(503, "Shared links aren't available right now.");
  const file = await readSharedFile(token, path);
  if (!file || file.encoding !== "base64") return text(404, "Not found");
  return new Response(Buffer.from(file.content, "base64"), {
    headers: {
      "content-type": mime,
      "content-disposition": "inline",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox; default-src 'none'",
      "referrer-policy": "no-referrer",
      "x-robots-tag": "noindex",
    },
  });
}

function text(status: number, message: string): Response {
  return new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}
