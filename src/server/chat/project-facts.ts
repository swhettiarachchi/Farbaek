/**
 * Reads what Chat is told about a project (stage 282, ADR 0290): its name, what it is, its files' paths, its tasks and their
 * states, and whether a site published from it is live. Everything is read as the signed-in person, so a project they can't
 * open gives nothing. No file's contents are read here.
 */
import type { ProjectFacts } from "@/core/chat/project-brief";
import type { WorkspaceReader } from "@/server/workspace/types";

/** The most tasks read for a brief: it names ten and counts the rest. */
const TASKS_READ = 40;

export async function readProjectFacts(
  reader: Pick<WorkspaceReader, "getProject" | "listFiles" | "listTasks">,
  isLive: (projectId: string) => Promise<boolean>,
  orgId: string,
  projectId: string,
): Promise<ProjectFacts | null> {
  const project = await reader.getProject(orgId, projectId);
  if (!project) return null;
  // Each part stands alone, and one that can't be read is null: the brief then says it is unread, never that there is none.
  const [paths, tasks, live] = await Promise.all([
    reader
      .listFiles(orgId, projectId)
      .then((files) => files.map((f) => f.path))
      .catch(() => null),
    reader
      .listTasks(orgId, { projectId, limit: TASKS_READ })
      .then((list) => list.map((t) => ({ title: t.title, state: t.state })))
      .catch(() => null),
    isLive(projectId).catch(() => null),
  ]);
  return {
    name: project.name,
    description: project.description,
    archived: project.archivedAt !== null,
    paths,
    tasks,
    // As many as were asked for: there may be more, so the count of earlier ones is the least there are.
    moreTasks: tasks !== null && tasks.length >= TASKS_READ,
    live,
  };
}
