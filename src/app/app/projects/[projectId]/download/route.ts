import { zipFiles } from "@/core/workspace/zip";
import { loadAppContext } from "@/server/workspace/context";

/**
 * Downloads a project's current files as a .zip. Read through Row Level
 * Security, so only members of the project's workspace get it. Exporting
 * stays available in every billing state (project.export).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const ctx = await loadAppContext();
  if (!ctx?.current) return new Response("Not found", { status: 404 });
  const project = await ctx.reader.getProject(ctx.current.id, projectId);
  if (!project) return new Response("Not found", { status: 404 });
  const files = await ctx.reader.getProjectContents(ctx.current.id, project.id);
  const name = project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "project";
  return new Response(zipFiles(files), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${name}.zip"`,
      "cache-control": "private, no-store",
    },
  });
}
