/**
 * Rescue import (Phase D): "check an app you built elsewhere". The files
 * were unpacked and screened in the browser; here they become a new project
 * through the same rules as any project and import (screened again on the
 * server), and a security check starts on them straight away.
 *
 * Partial success is reported, not hidden: the project is kept when the
 * import fails, and a check that can't start says why.
 */
import { importProjectFiles, type FileDeps } from "./files";
import { createProject, type WriteDeps, type WriteResult } from "./use-cases";

export interface RescueResult {
  projectId: string;
  /** Files stored, or why none were. */
  imported: { files: number } | { error: string };
  /** The security check, or why it didn't start. */
  check: { reportId: string } | { reason: string };
}

export type StartCheck = (projectId: string) => Promise<WriteResult<{ reportId: string }>>;

export async function rescueImport(
  deps: WriteDeps & FileDeps,
  startCheck: StartCheck | { unavailable: string },
  input: { orgId: string; userId: string; name: string; files: { path: string; content: string }[] },
): Promise<WriteResult<RescueResult>> {
  const project = await createProject(deps, {
    orgId: input.orgId,
    userId: input.userId,
    name: input.name,
    description: "Imported from a zip for a security check.",
  });
  if (!project.ok) return project;

  const stored = await importProjectFiles(deps, { orgId: input.orgId, userId: input.userId, projectId: project.value, files: input.files });
  const imported = stored.ok ? { files: stored.value.created + stored.value.updated + stored.value.unchanged } : { error: stored.message };
  if (!stored.ok) return { ok: true, value: { projectId: project.value, imported, check: { reason: "There are no files to check yet." } } };

  if ("unavailable" in startCheck) return { ok: true, value: { projectId: project.value, imported, check: { reason: startCheck.unavailable } } };
  const started = await startCheck(project.value);
  return { ok: true, value: { projectId: project.value, imported, check: started.ok ? started.value : { reason: started.message } } };
}
