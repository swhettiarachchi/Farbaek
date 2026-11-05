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

const PickInput = z.object({ projectId: z.uuid(), sessionId: z.uuid(), port: z.number().int().min(1024).max(65535) });

/**
 * Opens the project's running app from one of its sandbox sessions, for the
 * component editor to pick elements in (ADR 0149). The session must be this
 * project's and running; the preview is private to the person, as always.
 */
export async function openPickPreviewAction(input: { projectId: string; sessionId: string; port: number }): Promise<PreviewState> {
  const parsed = PickInput.safeParse(input);
  if (!parsed.success) return { status: "error", message: "Choose a running session and the port your app listens on, from 1024 to 65535." };
  const ctx = await loadAppContext();
  if (!ctx) return { status: "error", message: "Sign in again." };
  const sandbox = await sandboxForPage(ctx);
  if (!sandbox.ok) return { status: "error", message: sandbox.reason };
  const session = await sandbox.value.store.getSession(parsed.data.sessionId).catch(() => null);
  if (!session || session.orgId !== sandbox.value.actor.orgId || session.projectId !== parsed.data.projectId) return { status: "error", message: "That session isn't one of this project's." };
  if (session.state !== "ready") return { status: "error", message: "That session isn't running. Start or resume it from the Test space page." };
  const opened = await sandbox.value.service.openPreview(sandbox.value.actor, session.id, parsed.data.port, { pick: true });
  return opened.ok ? { status: "done", url: opened.value.url } : { status: "error", message: opened.message };
}
