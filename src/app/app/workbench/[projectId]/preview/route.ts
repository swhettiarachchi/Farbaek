import { NextResponse } from "next/server";
import { loadAppContext } from "@/server/workspace/context";
import { UUID } from "@/core/workbench/key";
import { loadRunPreview } from "@/server/workspace/run-preview";

export const dynamic = "force-dynamic";

const HEADERS = { "cache-control": "no-store", "x-content-type-options": "nosniff" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: HEADERS });

/**
 * What the Preview pane of Build's workspace shows (stage 202, ADR 0219): the site as it is and, while a change waits for
 * review, the site with that change laid over it; or the plain reason there is nothing to show here. The same reader the run
 * page uses (`loadRunPreview`), asked only when the files or the waiting change have changed. Read as the signed-in person.
 */
export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const ctx = await loadAppContext();
  if (!ctx?.current) return json({ error: "Sign in to see the preview." }, 401);
  const { projectId } = await params;
  if (!UUID.test(projectId)) return json({ error: "That project doesn't exist." }, 404);
  const project = await ctx.reader.getProject(ctx.current.id, projectId);
  if (!project) return json({ error: "That project doesn't exist." }, 404);

  // The waiting change is only laid over the site when the task asked for really is this project's.
  const wanted = new URL(request.url).searchParams.get("task") ?? "";
  let taskId = "";
  let proposalId: string | null = null;
  if (UUID.test(wanted)) {
    const found = await ctx.reader.getTask(ctx.current.id, wanted).catch(() => null);
    if (found && found.task.projectId === projectId) {
      taskId = wanted;
      const proposal = await ctx.reader.getLatestProposal(ctx.current.id, wanted).catch(() => null);
      proposalId = proposal?.status === "pending" ? proposal.id : null;
    }
  }
  const preview = await loadRunPreview(ctx.reader, ctx.current.id, { projectId, taskId, proposalId });
  if (preview.kind !== "static") return json({ data: preview });
  // Both versions share the site's pictures: they travel once, and the pane gives them back to each version.
  return json({ data: { kind: "static", versions: preview.versions.map((v) => ({ id: v.id, label: v.label, files: v.files })), images: preview.versions[0]?.images ?? {} } });
}
