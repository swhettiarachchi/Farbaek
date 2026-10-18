"use server";

import { z } from "zod";
import { sandboxForPage } from "@/server/sandbox/page-context";
import { loadAppContext } from "@/server/workspace/context";

export type PreviewState = { status: "error"; message: string } | { status: "done"; url: string };

/** Opens a private preview of a project's current files and returns its one-use link (ADR 0023). */
export async function openProjectPreviewAction(projectId: string): Promise<PreviewState> {
  if (!z.uuid().safeParse(projectId).success) return { status: "error", message: "That project doesn't exist." };
  const ctx = await loadAppContext();
  if (!ctx) return { status: "error", message: "Sign in again." };
  const sandbox = await sandboxForPage(ctx);
  if (!sandbox.ok) return { status: "error", message: sandbox.reason };
  const opened = await sandbox.value.service.openProjectPreview(sandbox.value.actor, projectId);
  return opened.ok ? { status: "done", url: opened.value.url } : { status: "error", message: opened.message };
}
