/**
 * Write use cases for project files. The browser screens an import to show a
 * preview, but the decision is made here: every path and file is screened
 * again, then the database applies the change in one transaction and
 * re-checks paths and limits.
 */
import { WORKSPACE_LIMITS } from "@/config/workspace";
import { checkPath, screenFile, type SkipReason } from "@/core/workspace/files";
import { IMAGE_LIMITS, checkImage, isImagePath } from "@/core/workspace/images";
import { codeFromDatabaseError, fail, requireContributor, type RpcResult, type WriteDeps, type WriteResult } from "./use-cases";

export interface ImportCounts {
  created: number;
  updated: number;
  unchanged: number;
}

export interface FileDeps {
  importFiles(input: { projectId: string; actor: string; files: { path: string; content: string }[] }): Promise<RpcResult<ImportCounts>>;
  saveFile(input: { projectId: string; actor: string; path: string; content: string; expectedRevision: number }): Promise<RpcResult<number>>;
  /** An image (ADR 0108): base64 in; the database hashes and sizes the decoded bytes. */
  saveImage(input: { projectId: string; actor: string; path: string; base64: string; expectedRevision: number }): Promise<RpcResult<number>>;
  deleteFile(input: { projectId: string; actor: string; path: string; expectedRevision: number }): Promise<RpcResult<null>>;
}

export interface ImportSummary extends ImportCounts {
  skipped: { path: string; reason: SkipReason }[];
}

const utf8Length = (s: string) => new TextEncoder().encode(s).length;

export async function importProjectFiles(
  deps: WriteDeps & FileDeps,
  input: { orgId: string; userId: string; projectId: string; files: { path: string; content: string }[] },
): Promise<WriteResult<ImportSummary>> {
  const role = await requireContributor(deps, input.orgId);
  if (!role.ok) return role;
  if (input.files.length > WORKSPACE_LIMITS.maxProjectFiles) return fail("PROJECT_TOO_LARGE");

  const accepted: { path: string; content: string }[] = [];
  const skipped: ImportSummary["skipped"] = [];
  const seen = new Set<string>();
  let bytes = 0;
  for (const file of input.files) {
    const size = utf8Length(file.content);
    const screened = screenFile(file.path, file.content, size, WORKSPACE_LIMITS.maxFileBytes);
    if (!screened.ok) {
      skipped.push({ path: file.path.slice(0, 300), reason: screened.reason });
      continue;
    }
    if (seen.has(screened.path)) continue;
    seen.add(screened.path);
    accepted.push({ path: screened.path, content: file.content });
    bytes += size;
  }

  if (accepted.length === 0) return fail("NOTHING_TO_IMPORT");
  if (bytes > WORKSPACE_LIMITS.maxImportBytes) return fail("IMPORT_TOO_LARGE");

  const result = await deps.importFiles({ projectId: input.projectId, actor: input.userId, files: accepted });
  if (!result.ok) return fail(codeFromDatabaseError(result.error));
  return { ok: true, value: { ...result.value, skipped } };
}

export async function saveProjectFile(
  deps: WriteDeps & FileDeps,
  input: { orgId: string; userId: string; projectId: string; path: string; content: string; expectedRevision: number },
): Promise<WriteResult<number>> {
  const role = await requireContributor(deps, input.orgId);
  if (!role.ok) return role;
  const path = checkPath(input.path);
  if (!path.ok) return fail("INVALID_PATH", `That file path isn't allowed. ${path.reason}`);
  if (isImagePath(path.path)) return fail("IMAGE_PATH");
  const screened = screenFile(path.path, input.content, utf8Length(input.content), WORKSPACE_LIMITS.maxFileBytes);
  if (!screened.ok) {
    if (screened.reason === "too_large") return fail("FILE_TOO_LARGE");
    if (screened.reason === "secret_content") return fail("SECRET_IN_CONTENT");
    if (screened.reason === "secret_file") return fail("INVALID_PATH", "Files that hold keys and passwords, such as .env or a private key, can't be stored in a project. Keep keys and passwords in your host's settings, not in the code.");
    if (screened.reason === "binary") return fail("INVALID_PATH", "Only text files can be saved.");
    return fail("INVALID_PATH", "Files can't be saved inside dependency or build folders.");
  }
  const result = await deps.saveFile({ projectId: input.projectId, actor: input.userId, path: path.path, content: input.content, expectedRevision: input.expectedRevision });
  if (!result.ok) return fail(codeFromDatabaseError(result.error));
  return result;
}

/**
 * Saves an image into a project (ADR 0108): an image path, bytes that are the
 * kind the extension names, up to 2 MB. The database checks the path, hashes
 * the bytes and applies the project's limits again.
 */
export async function saveProjectImage(
  deps: WriteDeps & FileDeps,
  input: { orgId: string; userId: string; projectId: string; path: string; bytes: Uint8Array; expectedRevision: number },
): Promise<WriteResult<number>> {
  const role = await requireContributor(deps, input.orgId);
  if (!role.ok) return role;
  const path = checkPath(input.path);
  if (!path.ok) return fail("INVALID_PATH", `That file path isn't allowed. ${path.reason}`);
  const image = checkImage(path.path, input.bytes);
  if (!image.ok) return image.reason === "too_large" ? fail("FILE_TOO_LARGE", image.detail) : fail("INVALID_IMAGE", image.detail);
  if (input.bytes.length > IMAGE_LIMITS.maxImageBytes) return fail("FILE_TOO_LARGE");
  const result = await deps.saveImage({ projectId: input.projectId, actor: input.userId, path: path.path, base64: Buffer.from(input.bytes).toString("base64"), expectedRevision: input.expectedRevision });
  if (!result.ok) return fail(codeFromDatabaseError(result.error));
  return result;
}

export async function deleteProjectFile(
  deps: WriteDeps & FileDeps,
  input: { orgId: string; userId: string; projectId: string; path: string; expectedRevision: number },
): Promise<WriteResult<null>> {
  const role = await requireContributor(deps, input.orgId);
  if (!role.ok) return role;
  const path = checkPath(input.path);
  if (!path.ok) return fail("NOT_FOUND");

  const result = await deps.deleteFile({ projectId: input.projectId, actor: input.userId, path: path.path, expectedRevision: input.expectedRevision });
  if (!result.ok) return fail(codeFromDatabaseError(result.error));
  return result;
}
