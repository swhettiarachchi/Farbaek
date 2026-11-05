/**
 * What the run page's Preview pane shows (ADR 0027): for a static site, the
 * project as it is and, while the agent's change waits for review, the
 * project with that change laid over it. Apps with a server preview in a
 * sandbox instead, which needs the preview domain.
 */
import { runProfile } from "@/content/starters";
import { overlayChanges } from "@/core/workspace/static-preview";
import { previewUnavailableReason, readSandboxConfig } from "@/server/sandbox/config";
import { previewImages } from "./preview-images";
import type { WorkspaceReader } from "./types";

/** Keeps the page light: larger sites open their preview from the project instead. */
const MAX_PREVIEW_BYTES = 3 * 1024 * 1024;

export type RunPreview =
  | { kind: "static"; versions: { id: string; label: string; files: Record<string, string>; images?: Record<string, string> }[] }
  | { kind: "unavailable"; reason: string };

export async function loadRunPreview(reader: WorkspaceReader, orgId: string, run: { projectId: string; taskId: string; proposalId: string | null }): Promise<RunPreview> {
  const contents = await reader.getProjectContents(orgId, run.projectId).catch(() => null);
  if (!contents) return { kind: "unavailable", reason: "The project's files couldn't be read for a preview right now." };
  const paths = contents.map((f) => f.path);
  const profile = runProfile(paths, contents.find((f) => f.path === "package.json")?.content ?? null);
  if (profile.kind === "node") {
    const off = previewUnavailableReason(readSandboxConfig());
    return { kind: "unavailable", reason: off ? `This is an app with a server, so it previews in a test space. ${off}` : "This is an app with a server: open it with Preview on its project page, which runs it in a sandbox." };
  }
  if (profile.kind !== "static") {
    const reason = paths.includes("index.html")
      ? "It has an index.html, but its package.json installs or runs something, so Farbaek can't tell how to preview it here."
      : "There's no index.html yet, so there's nothing to preview.";
    return { kind: "unavailable", reason };
  }
  const bytes = contents.reduce((n, f) => n + f.content.length, 0);
  if (bytes > MAX_PREVIEW_BYTES) return { kind: "unavailable", reason: "This site is too large to preview here. Open it from the project instead." };

  const now = Object.fromEntries(contents.map((f) => [f.path, f.content]));
  // The site's own images (ADR 0108); the agent changes text only, so both versions share them.
  const images = await previewImages(reader, orgId, run.projectId);
  const proposal = run.proposalId ? await reader.getLatestProposal(orgId, run.taskId).catch(() => null) : null;
  if (proposal && proposal.id === run.proposalId && proposal.status === "pending") {
    const after = overlayChanges(now, proposal.changes.map((c) => ({ path: c.path, content: c.content })));
    return { kind: "static", versions: [{ id: "before", label: "Before", files: now, images }, { id: "after", label: "With this change", files: after, images }] };
  }
  return { kind: "static", versions: [{ id: "now", label: proposal?.status === "applied" ? "Applied" : "Current", files: now, images }] };
}
