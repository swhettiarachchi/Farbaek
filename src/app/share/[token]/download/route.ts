import { zipFiles } from "@/core/workspace/zip";
import { shareContentVisible, sharePathVisible } from "@/core/workspace/sharing";
import { openShare, readSharedFiles } from "@/server/workspace/share-access";

export const dynamic = "force-dynamic";

/**
 * GET /share/<token>/download (ADR 0188): the project's current files as a
 * .zip, only when whoever made the link allowed it. One read checks the link
 * and returns every file, so a link turned off midway never gives half a
 * project. The same screening as the page: credentials files and text that
 * looks like a key are left out.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const opened = await openShare(token, "download");
  if (opened.kind === "limited") return text(429, "Too many downloads from your network. Try again later.");
  if (opened.kind === "unavailable") return text(503, "Shared links aren't available right now.");
  const view = opened.lookup;
  if (view.state !== "live" || !view.allowDownload) return text(404, "Not found");

  const read = await readSharedFiles(token);
  if (!read) return text(503, "The files couldn't be read just now. Try again in a moment.");
  const files: { path: string; content: string | Uint8Array }[] = [];
  for (const f of read) {
    if (!sharePathVisible(f.path).visible) continue;
    if (f.encoding === "base64") files.push({ path: f.path, content: new Uint8Array(Buffer.from(f.content, "base64")) });
    else if (shareContentVisible(f.path, f.content).visible) files.push({ path: f.path, content: f.content });
  }
  const name = view.project.name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "project";
  return new Response(zipFiles(files), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${name}.zip"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "x-robots-tag": "noindex",
    },
  });
}

function text(status: number, message: string): Response {
  return new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}
