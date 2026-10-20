import { loadAppContext } from "@/server/workspace/context";
import { projectThumbnail } from "@/server/workspace/project-thumbnail";

/**
 * The picture on a project's card (src/server/workspace/project-thumbnail.ts).
 * Read through Row Level Security, so only members of the project's
 * workspace get it. It's JSON, not a page: the browser only ever shows the
 * document inside a frame that runs no scripts.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const ctx = await loadAppContext();
  if (!ctx?.current) return Response.json({ kind: "empty" }, { status: 404 });
  const project = await ctx.reader.getProject(ctx.current.id, projectId);
  if (!project) return Response.json({ kind: "empty" }, { status: 404 });
  const thumb = await projectThumbnail(ctx.reader, ctx.current.id, project.id).catch(() => ({ kind: "empty" as const }));
  return Response.json(thumb, { headers: { "cache-control": "private, max-age=30", "x-content-type-options": "nosniff" } });
}
