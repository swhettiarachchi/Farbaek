import { packProject, recordCapsule } from "@/server/mesh/capsules";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { loadAppContext } from "@/server/workspace/context";

/**
 * Downloads a project as a Workspace Capsule (ADR 0037): its current files
 * with a BLAKE3 manifest, secrets and build output left out. Read through Row
 * Level Security, so only members of the project's workspace get it, in
 * every billing state, like the plain zip download. Live workspaces record
 * each Capsule; a record that fails doesn't stop the download.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const ctx = await loadAppContext();
  if (!ctx?.current) return new Response("Not found", { status: 404 });
  const packed = await packProject(ctx.reader, ctx.current.id, projectId);
  if (!packed) return new Response("Not found", { status: 404 });

  if (ctx.mode === "live") {
    const admin = createSupabaseAdminClient();
    const project = await ctx.reader.getProject(ctx.current.id, projectId);
    if (admin && project) {
      await recordCapsule(admin, {
        orgId: ctx.current.id,
        userId: ctx.user.id,
        projectId,
        direction: "export",
        digest: packed.digest,
        projectName: project.name,
        files: packed.files,
        bytes: packed.totalBytes,
        excluded: packed.excluded.length,
      });
    }
  }

  return new Response(packed.bytes, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${packed.fileName}"`,
      "cache-control": "private, no-store",
      "x-capsule-digest": packed.digest,
    },
  });
}
