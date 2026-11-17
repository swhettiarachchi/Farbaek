/**
 * Where a build's steps return to (stage 202, ADR 0219). Starting from a prompt, approving a plan and starting a run each end
 * by opening the next screen. From the plan and run pages that is the next page; from Build's workspace it is the workspace
 * itself, so the whole flow stays on one screen.
 *
 * The browser only ever says which surface it is on, one word from a fixed list. The address is always built here on the
 * server from ids the server already holds, so a form can never send someone to an address of its choosing.
 */
import { UUID } from "@/core/workbench/key";

export const BUILD_SURFACES = ["page", "workbench"] as const;
export type BuildSurface = (typeof BUILD_SURFACES)[number];

/** Anything that isn't exactly "workbench" is the ordinary pages. */
export function readSurface(value: unknown): BuildSurface {
  return value === "workbench" ? "workbench" : "page";
}

/** Build's workspace for a project, optionally opened at one of its tasks. Ids that aren't ids open the picker instead. */
export function workbenchPath(projectId: string, taskId?: string | null): string {
  if (!UUID.test(projectId)) return "/app/workbench";
  return taskId && UUID.test(taskId) ? `/app/workbench/${projectId}?task=${taskId}` : `/app/workbench/${projectId}`;
}

/** After a prompt became a task with a drafted plan. */
export function planPath(surface: BuildSurface, ids: { projectId: string; taskId: string }): string {
  return surface === "workbench" ? workbenchPath(ids.projectId, ids.taskId) : `/app/new/${ids.taskId}`;
}

/** After a run started. */
export function runPath(surface: BuildSurface, ids: { projectId: string; taskId: string; runId: string }): string {
  return surface === "workbench" ? workbenchPath(ids.projectId, ids.taskId) : `/app/build/${ids.runId}`;
}
