import { NextResponse } from "next/server";
import { loadAppContext } from "@/server/workspace/context";
import { UUID } from "@/core/workbench/key";

export const dynamic = "force-dynamic";

const HEADERS = { "cache-control": "no-store", "x-content-type-options": "nosniff" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: HEADERS });

/**
 * One file of a project, for the Code pane of Build's workspace (stage 202, ADR 0219). Read as the signed-in person with
 * their own reader, so the database's row rules decide what they may see, exactly as on the Files page. Always JSON and
 * never cached: a file's text is data to show in the editor, never a document this origin serves.
 */
export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const ctx = await loadAppContext();
  if (!ctx?.current) return json({ error: "Sign in to read this file." }, 401);
  const { projectId } = await params;
  const path = new URL(request.url).searchParams.get("path") ?? "";
  if (!UUID.test(projectId) || path.length === 0 || path.length > 1_000) return json({ error: "That file doesn't exist." }, 404);

  const project = await ctx.reader.getProject(ctx.current.id, projectId);
  if (!project) return json({ error: "That file doesn't exist." }, 404);
  const file = await ctx.reader.getFile(ctx.current.id, projectId, path).catch(() => null);
  if (!file) return json({ error: "That file doesn't exist." }, 404);

  return json({ data: { path: file.path, revision: file.revision, sizeBytes: file.sizeBytes, image: file.encoding === "base64", content: file.content } });
}
