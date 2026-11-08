"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ImportChoice } from "@/core/mesh/capsule";
import { importCapsule, OPEN_LIMITS, packProject, projectHashes, recordCapsule } from "@/server/mesh/capsules";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { loadAppContext } from "@/server/workspace/context";
import { createSupabaseWriteDeps } from "@/server/workspace/supabase-writer";

export type CapsulePreview =
  | { status: "ok"; files: number; bytes: number; excludedCount: number; excluded: { path: string; reason: string }[] }
  | { status: "error"; message: string };

/** What a project's Capsule would hold and leave out, before downloading it. */
export async function previewCapsuleAction(projectId: string): Promise<CapsulePreview> {
  if (typeof projectId !== "string" || projectId.length === 0 || projectId.length > 64) return { status: "error", message: "Choose a project." };
  const ctx = await loadAppContext();
  if (!ctx?.current) return { status: "error", message: "Sign in and choose a workspace first." };
  const packed = await packProject(ctx.reader, ctx.current.id, projectId);
  if (!packed) return { status: "error", message: "That project isn't in this workspace." };
  return { status: "ok", files: packed.files, bytes: packed.totalBytes, excludedCount: packed.excluded.length, excluded: packed.excluded.slice(0, 200) };
}

export type HashesResult = { status: "ok"; files: { path: string; blake3: string }[] } | { status: "error"; message: string };

/** The destination project's file hashes, so the browser can show what a Capsule would change. */
export async function destinationHashesAction(projectId: string): Promise<HashesResult> {
  if (typeof projectId !== "string" || projectId.length === 0 || projectId.length > 64) return { status: "error", message: "Choose a project." };
  const ctx = await loadAppContext();
  if (!ctx?.current) return { status: "error", message: "Sign in and choose a workspace first." };
  const project = await ctx.reader.getProject(ctx.current.id, projectId);
  if (!project) return { status: "error", message: "That project isn't in this workspace." };
  return { status: "ok", files: await projectHashes(ctx.reader, ctx.current.id, project.id) };
}

export type FileResult = { status: "ok"; content: string } | { status: "missing" } | { status: "error"; message: string };

/** One file of the destination project, to compare with the Capsule's version. Read under RLS like any file. */
export async function destinationFileAction(projectId: string, path: string): Promise<FileResult> {
  if (typeof projectId !== "string" || typeof path !== "string" || projectId.length > 64 || path.length > 300) return { status: "error", message: "That file can't be compared." };
  const ctx = await loadAppContext();
  if (!ctx?.current) return { status: "error", message: "Sign in and choose a workspace first." };
  const file = await ctx.reader.getFile(ctx.current.id, projectId, path);
  return file ? { status: "ok", content: file.content } : { status: "missing" };
}

export type CapsuleImportState =
  | { status: "idle" }
  | { status: "done"; projectId: string; written: number; unchanged: number; kept: number; recorded: boolean }
  | { status: "error"; message: string; problems?: string[] };

const Choice = z.enum(["take", "keep_mine", "keep_both", "skip"]);
const Fields = z.object({
  destination: z.string().min(1).max(64),
  name: z.string().trim().max(80).optional(),
  choices: z.string().max(400_000).optional(),
});

/** Opens an uploaded Capsule on the server, checks it again and writes what the person chose. */
export async function importCapsuleAction(_prev: CapsuleImportState, form: FormData): Promise<CapsuleImportState> {
  const file = form.get("capsule");
  if (!(file instanceof File) || file.size === 0) return { status: "error", message: "Choose a Capsule file first." };
  if (file.size > OPEN_LIMITS.maxTotalBytes + 512 * 1024) return { status: "error", message: "Capsules up to 5 MB can be opened here. Larger ones arrive with nearby transfer." };
  const fields = Fields.safeParse({ destination: form.get("destination"), name: form.get("name") ?? undefined, choices: form.get("choices") ?? undefined });
  if (!fields.success) return { status: "error", message: "Choose where the Capsule's files should go." };

  let choices: Record<string, ImportChoice> = {};
  if (fields.data.choices) {
    const parsed = z.record(z.string().max(300), Choice).safeParse(safeJson(fields.data.choices));
    if (!parsed.success) return { status: "error", message: "The choices for the differing files couldn't be read. Try again." };
    choices = parsed.data;
  }

  const ctx = await loadAppContext();
  if (!ctx?.current) return { status: "error", message: "Sign in and choose a workspace first." };
  if (ctx.mode === "demo") return { status: "error", message: "The demo workspace is read-only. Sign in to open a Capsule into your own workspace." };
  if (!ctx.writes.enabled) return { status: "error", message: ctx.writes.reason };
  if (!ctx.role) return { status: "error", message: "Create or join a workspace first." };
  const [user, admin] = [await createSupabaseServerClient(), createSupabaseAdminClient()];
  if (!user || !admin) return { status: "error", message: "Farbaek's server isn't set up to save changes yet. Write to support@farbaek.com." };

  const destination =
    fields.data.destination === "new"
      ? { kind: "new" as const, name: (fields.data.name ?? "").trim() || "Opened Capsule" }
      : { kind: "existing" as const, projectId: fields.data.destination };

  const result = await importCapsule(createSupabaseWriteDeps(user, admin, ctx.user.id), ctx.reader, {
    orgId: ctx.current.id,
    userId: ctx.user.id,
    data: new Uint8Array(await file.arrayBuffer()),
    destination,
    choices,
  });
  if (!result.ok) return { status: "error", message: result.message, problems: result.problems };

  const project = await ctx.reader.getProject(ctx.current.id, result.projectId);
  const recorded = await recordCapsule(admin, {
    orgId: ctx.current.id,
    userId: ctx.user.id,
    projectId: result.projectId,
    direction: "import",
    digest: result.digest!,
    projectName: project?.name ?? "Opened Capsule",
    files: result.files ?? 0,
    bytes: result.bytes ?? 0,
    excluded: result.excluded ?? 0,
  });
  revalidatePath("/app", "layout");
  return { status: "done", projectId: result.projectId, written: result.written, unchanged: result.unchanged, kept: result.kept, recorded };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
