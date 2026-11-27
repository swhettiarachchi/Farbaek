/**
 * Where a build's steps return to (stage 202, ADR 0219). Starting from a prompt, approving a plan and starting a run each end
 * by opening the next screen. From the plan and run pages that is the next page; from Build's workspace it is the workspace
 * itself, so the whole flow stays on one screen.
 *
 * The browser only ever says which surface it is on, one word from a fixed list. The address is always built here on the
 * server from ids the server already holds, so a form can never send someone to an address of its choosing.
 */
import { UUID } from "@/core/workbench/key";

/**
 * Where every build starts (stage 286, ADR 0294): one page, in the app's own frame. "Build" in every menu, the New build
 * button, Chat's hand-over, the templates and a share from another app all open it.
 */
export const BUILD_START = "/app/build";

/** What an address may carry to Build's start: a chosen template, a prompt kept through sign-in, and a share from another app. */
const START_KEYS = ["template", "resume", "title", "text", "url"] as const;
const START_VALUE_MAX = 4_000;

/**
 * Build's start, carrying what an older address carried (`/app/new?template=blog`, a share's title, text and url). Only
 * the names above are kept, each once and within a size; the path is fixed here, so an old link can only ever lead to
 * Build's start.
 */
export function buildStartPath(query: Record<string, string | string[] | undefined> = {}): string {
  const kept = new URLSearchParams();
  for (const key of START_KEYS) {
    const given = Object.hasOwn(query, key) ? query[key] : undefined;
    const value = Array.isArray(given) ? given[0] : given;
    if (typeof value === "string" && value !== "") kept.set(key, value.slice(0, START_VALUE_MAX));
  }
  const carried = kept.toString();
  return carried ? `${BUILD_START}?${carried}` : BUILD_START;
}

/**
 * Where one of the two older ways into Build leads now, or null for every other path: the New build page's address, with
 * what it carried, and the workspace's address without a project. The proxy answers these with a redirect before a page
 * is drawn, so a share or an old link is one load, not two.
 */
export function olderBuildStart(pathname: string, search: URLSearchParams): string | null {
  if (pathname === "/app/workbench") return BUILD_START;
  if (pathname !== "/app/new") return null;
  const carried: Record<string, string> = {};
  for (const key of START_KEYS) {
    const value = search.get(key);
    if (value !== null) carried[key] = value;
  }
  return buildStartPath(carried);
}

export const BUILD_SURFACES = ["page", "workbench"] as const;
export type BuildSurface = (typeof BUILD_SURFACES)[number];

/** Anything that isn't exactly "workbench" is the ordinary pages. */
export function readSurface(value: unknown): BuildSurface {
  return value === "workbench" ? "workbench" : "page";
}

/** Build's workspace for a project, optionally opened at one of its tasks. Ids that aren't ids open Build's start instead. */
export function workbenchPath(projectId: string, taskId?: string | null): string {
  if (!UUID.test(projectId)) return BUILD_START;
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
