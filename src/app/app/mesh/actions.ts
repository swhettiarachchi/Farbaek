"use server";

import { packProject, projectHashes } from "@/server/mesh/capsules";
import { loadAppContext } from "@/server/workspace/context";

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

/** `encoding` is "base64" for an image (ADR 0108), whose content is then its bytes in base64. */
export type FileResult = { status: "ok"; content: string; encoding?: "base64" } | { status: "missing" } | { status: "error"; message: string };

/** One file of the destination project, to compare with the Capsule's version. Read under RLS like any file. */
export async function destinationFileAction(projectId: string, path: string): Promise<FileResult> {
  if (typeof projectId !== "string" || typeof path !== "string" || projectId.length > 64 || path.length > 300) return { status: "error", message: "That file can't be compared." };
  const ctx = await loadAppContext();
  if (!ctx?.current) return { status: "error", message: "Sign in and choose a workspace first." };
  const file = await ctx.reader.getFile(ctx.current.id, projectId, path);
  return file ? { status: "ok", content: file.content, ...(file.encoding ? { encoding: file.encoding } : {}) } : { status: "missing" };
}

// Opening an uploaded Capsule moved to POST /app/mesh/import (stage 179), so a Capsule with images can be larger than server actions accept.
export type { CapsuleImportState } from "@/server/mesh/import-form";
