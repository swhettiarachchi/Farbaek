/**
 * A phone's kept copy of a project, and the saves made on it that waited for
 * the network (ADR 0192). Both act as the signed-in person: the copy is read
 * through Row Level Security, and a save goes through saveProjectFile, so the
 * path, content and revision checks are the web editor's own.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { WORKSPACE_LIMITS } from "@/config/workspace";
import { AccountId, type DeviceCopyFile } from "@/core/workspace/device-copy";
import { MESSAGES, type WriteErrorCode, type WriteResult } from "./use-cases";
import type { Project, WorkspaceReader } from "./types";

/** What the device keeps: each file's revision and hash, with its text or its image bytes in base64. */
export interface DeviceCopy {
  orgId: string;
  projectId: string;
  projectName: string;
  userId: string;
  /** Why this person can't save changes to the project; null when they can. */
  saveReason: string | null;
  files: (DeviceCopyFile & ({ kind: "text"; content: string } | { kind: "image"; base64: string }))[];
}

const sha256 = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");

/**
 * Reads the whole project for the device. The list and the contents are read
 * separately, so each file's content is checked against the listed hash: a
 * save landing in between is refused, to try again, rather than kept with the
 * wrong revision. (Not retried here: the request's reader keeps the list it
 * already read.)
 */
export async function readDeviceCopy(
  reader: WorkspaceReader,
  input: { orgId: string; projectId: string; userId: string; saveReason: (project: Project) => string | null },
): Promise<{ ok: true; copy: DeviceCopy } | { ok: false; status: 404 | 409; message: string }> {
  const project = await reader.getProject(input.orgId, input.projectId);
  if (!project) return { ok: false, status: 404, message: "That project doesn't exist or isn't in this workspace." };
  const [listed, texts, images] = await Promise.all([
    reader.listFiles(input.orgId, project.id),
    reader.getProjectContents(input.orgId, project.id),
    reader.getProjectImages(input.orgId, project.id),
  ]);
  const text = new Map(texts.map((t) => [t.path, t.content]));
  const image = new Map(images.map((i) => [i.path, i.base64]));
  const files: DeviceCopy["files"] = [];
  let consistent = true;
  for (const f of listed) {
    const base = { path: f.path, revision: f.revision, sha256: f.sha256 };
    if (f.encoding === "base64") {
      const b64 = image.get(f.path);
      if (b64 === undefined || sha256(Buffer.from(b64, "base64")) !== f.sha256) consistent = false;
      else files.push({ ...base, kind: "image", base64: b64 });
    } else {
      const content = text.get(f.path);
      if (content === undefined || sha256(content) !== f.sha256) consistent = false;
      else files.push({ ...base, kind: "text", content });
    }
    if (!consistent) break;
  }
  if (consistent) return { ok: true, copy: { orgId: input.orgId, projectId: project.id, projectName: project.name, userId: input.userId, saveReason: input.saveReason(project), files } };
  return { ok: false, status: 409, message: "The project changed while it was being copied. Try again in a moment." };
}

export const DeviceSaveInput = z.object({
  /** The account the save was made by on the device: it must be the one signed in. */
  owner: AccountId,
  /** The workspace the copy came from. */
  orgId: z.uuid(),
  path: z.string().min(1).max(1000),
  // Four times the byte limit, as the editor's own action allows: the limit itself is checked in UTF-8 bytes.
  content: z.string().max(WORKSPACE_LIMITS.maxFileBytes * 4),
  expectedRevision: z.number().int().min(0),
});
export type DeviceSaveInput = z.infer<typeof DeviceSaveInput>;

/** The largest request body a device save reads: a full-size file, escaped as JSON. */
export const DEVICE_SAVE_MAX_BODY = 3 * 1024 * 1024;

export type DeviceSaveAnswer =
  | { status: 200; body: { revision: number } }
  | { status: 409; body: { code: "FILE_CHANGED"; message: string; server: { revision: number; content: string | null } } }
  | { status: 503; body: { code: "UNREADABLE"; message: string } }
  | { status: 400 | 401 | 402 | 403 | 404 | 409 | 413 | 422 | 503; body: { code: string; message: string } };

const STATUS: Partial<Record<WriteErrorCode, 402 | 403 | 404 | 409>> = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  BILLING_SUSPENDED: 402,
  PROJECT_ARCHIVED: 409,
};

export interface DeviceSaveDeps {
  save(input: DeviceSaveInput): Promise<WriteResult<number>>;
  /** The file on the server now, as the person reads it; revision 0 when it isn't there, null when it couldn't be read. */
  current(path: string): Promise<{ revision: number; content: string | null } | null>;
}

/** Sends one waiting save. A stale revision comes back with the server's file, so the device can compare. */
export async function saveFromDevice(deps: DeviceSaveDeps, input: DeviceSaveInput): Promise<DeviceSaveAnswer> {
  const saved = await deps.save(input);
  if (saved.ok) return { status: 200, body: { revision: saved.value } };
  if (saved.code === "FILE_CHANGED") {
    const server = await deps.current(input.path.trim().replace(/^\.\//, ""));
    // Never "deleted" when it only couldn't be read: the device would offer to let the change go.
    if (!server) return { status: 503, body: { code: "UNREADABLE", message: "Farbaek couldn't read its own version of this file just now. Your change is still here; send it again in a minute." } };
    return { status: 409, body: { code: "FILE_CHANGED", message: MESSAGES.FILE_CHANGED, server } };
  }
  return { status: STATUS[saved.code] ?? 422, body: { code: saved.code, message: saved.message } };
}

/** The server file for a conflict, read as the person: images and missing files carry no text. */
export async function currentFile(reader: WorkspaceReader, orgId: string, projectId: string, path: string): Promise<{ revision: number; content: string | null } | null> {
  let file: Awaited<ReturnType<WorkspaceReader["getFile"]>>;
  try {
    file = await reader.getFile(orgId, projectId, path);
  } catch {
    return null;
  }
  if (!file) return { revision: 0, content: null };
  return { revision: file.revision, content: file.encoding === "base64" ? null : file.content };
}
