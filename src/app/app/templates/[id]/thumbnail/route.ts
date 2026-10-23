import { getStarter } from "@/content/starters";
import { buildStaticSrcdoc, pictureSrcdoc } from "@/core/workspace/static-preview";
import { loadAppContext } from "@/server/workspace/context";

/**
 * A template's home page as one document, for the lazy pictures in the
 * gallery and on the new-build page. Templates are Farbaek's own sample
 * content and only change with a deploy, so it caches for an hour. It's
 * JSON, shown only inside a frame that runs no scripts.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadAppContext();
  if (!ctx?.current) return Response.json({ kind: "empty" }, { status: 404 });
  const t = getStarter(id);
  if (!t || t.kind !== "template") return Response.json({ kind: "empty" }, { status: 404 });
  const srcdoc = buildStaticSrcdoc(Object.fromEntries(t.files.map((f) => [f.path, f.content])), "index.html");
  return Response.json(srcdoc ? { kind: "static", srcdoc: pictureSrcdoc(srcdoc) } : { kind: "empty" }, {
    headers: { "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" },
  });
}
