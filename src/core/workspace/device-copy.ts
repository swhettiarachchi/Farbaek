/**
 * Projects kept on a phone (ADR 0192): what a copy on the device holds, and
 * the saves made there that wait for the network. Framework-free, so the
 * browser's device page, its tests and a native app can share it.
 *
 * - A copy belongs to one account. Its manifest names the person, the
 *   workspace and the project, and each file's revision when it was kept.
 * - A save made on the device waits in a queue, one per file: saving the
 *   same file again replaces the waiting save and keeps the revision the
 *   edit started from, so the server can still tell whether someone else
 *   changed the file in between.
 * - The server decides. A save whose starting revision is stale comes back
 *   as a conflict; if the server's file already matches, it settles itself.
 */
import { z } from "zod";
import { diffLines, splitLines } from "../realityloop/line-diff";
import { checkPath } from "./files";

export const DEVICE_COPY_VERSION = 1;

const Uuid = z.uuid();
/** An account's id: a uuid for real accounts, "demo-user" in the demo. Only letters, digits and hyphens, so it's always a safe folder name. */
export const AccountId = z.string().regex(/^[A-Za-z0-9-]{1,64}$/);
const Revision = z.number().int().min(0);

export const DeviceCopyFileSchema = z.object({
  path: z.string().min(1).max(1000),
  revision: Revision,
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  kind: z.enum(["text", "image"]),
});
export type DeviceCopyFile = z.infer<typeof DeviceCopyFileSchema>;

export const DeviceCopyManifestSchema = z.object({
  v: z.literal(DEVICE_COPY_VERSION),
  userId: AccountId,
  orgId: Uuid,
  projectId: Uuid,
  projectName: z.string().min(1).max(200),
  keptAt: z.iso.datetime(),
  /** Why this person can't save changes to the project (a viewer, an archived project, a paused workspace); null when they can. */
  saveReason: z.string().min(1).max(500).nullable(),
  files: z.array(DeviceCopyFileSchema).max(5_000),
});
export type DeviceCopyManifest = z.infer<typeof DeviceCopyManifestSchema>;

export const QueuedSaveSchema = z.object({
  /** The workspace the project was kept from: the save goes there, whichever workspace is open in the browser. */
  orgId: Uuid,
  projectId: Uuid,
  path: z.string().min(1).max(1000),
  content: z.string(),
  /** The server's revision the edit started from: 0 for a new file. */
  baseRevision: Revision,
  savedAt: z.iso.datetime(),
});
export type QueuedSave = z.infer<typeof QueuedSaveSchema>;

export const DeviceQueueSchema = z.object({ v: z.literal(DEVICE_COPY_VERSION), userId: AccountId, saves: z.array(QueuedSaveSchema).max(5_000) });
export type DeviceQueue = z.infer<typeof DeviceQueueSchema>;

/** Reads a manifest from the device's storage, which a person or another page could have changed: anything odd is no copy. */
export function readManifest(raw: unknown, expected: { userId: string; projectId: string }): DeviceCopyManifest | null {
  const parsed = DeviceCopyManifestSchema.safeParse(raw);
  if (!parsed.success) return null;
  const m = parsed.data;
  if (m.userId !== expected.userId || m.projectId !== expected.projectId) return null;
  // Every path must be a plain path inside the project (as an image's may be, even under build/), and appear once.
  const seen = new Set<string>();
  for (const f of m.files) {
    const checked = checkPath(f.path);
    if (!checked.ok || checked.path !== f.path || seen.has(f.path)) return null;
    seen.add(f.path);
  }
  return m;
}

/** Reads the queue for this account; another account's queue, or a damaged one, reads as empty. */
export function readQueue(raw: unknown, userId: string): QueuedSave[] {
  const parsed = DeviceQueueSchema.safeParse(raw);
  if (!parsed.success || parsed.data.userId !== userId) return [];
  return parsed.data.saves.filter((s) => {
    const checked = checkPath(s.path);
    return checked.ok && checked.path === s.path;
  });
}

const sameFile = (a: Pick<QueuedSave, "projectId" | "path">, b: Pick<QueuedSave, "projectId" | "path">) => a.projectId === b.projectId && a.path === b.path;

/**
 * Adds a save to the queue. A save already waiting for that file is replaced,
 * keeping its starting revision: the edit still began from that one.
 */
export function enqueue(queue: readonly QueuedSave[], save: QueuedSave): QueuedSave[] {
  const waiting = queue.find((q) => sameFile(q, save));
  const next = waiting ? { ...save, baseRevision: waiting.baseRevision } : save;
  return [...queue.filter((q) => !sameFile(q, save)), next];
}

export function dequeue(queue: readonly QueuedSave[], save: Pick<QueuedSave, "projectId" | "path">): QueuedSave[] {
  return queue.filter((q) => !sameFile(q, save));
}

/** The server's file as it is now, when a save meets a newer revision. Revision 0 means it was deleted there. */
export interface ServerFile {
  revision: number;
  content: string | null;
}

export type Settled =
  /** The server already has exactly these words: nothing to send, and the copy moves to that revision. */
  | { kind: "same"; revision: number }
  /** Someone else changed or deleted the file since the edit began: the person chooses. */
  | { kind: "conflict"; server: ServerFile };

export function settle(save: Pick<QueuedSave, "content">, server: ServerFile): Settled {
  if (server.revision > 0 && server.content === save.content) return { kind: "same", revision: server.revision };
  return { kind: "conflict", server };
}

/**
 * Where "Keep both" puts the device's version, next to the server's:
 * src/app.ts becomes src/app.device.ts, then src/app.device-2.ts.
 */
export function deviceCopyPath(path: string, taken: ReadonlySet<string>): string {
  const slash = path.lastIndexOf("/");
  const dir = path.slice(0, slash + 1);
  const name = path.slice(slash + 1);
  const dot = name.lastIndexOf(".");
  const [base, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  for (let n = 1; n < 1000; n += 1) {
    const candidate = `${dir}${base}.device${n === 1 ? "" : `-${n}`}${ext}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${dir}${base}.device-${taken.size + 1000}${ext}`;
}

/**
 * A kept file's name in the device's storage: its content's SHA-256. Paths
 * never become storage names, so none can reach outside its project's
 * folder, and the manifest, written last, decides which contents count.
 */
export function blobName(sha256: string): string | null {
  return /^[0-9a-f]{64}$/.test(sha256) ? `c-${sha256}` : null;
}

export async function sha256Hex(bytes: Uint8Array | string): Promise<string> {
  const data = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  const digest = await crypto.subtle.digest("SHA-256", data as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * One short hash of which revision of each file a project is at, so a page
 * can tell whether a kept copy is current without sending the whole list.
 */
export function copyVersion(files: readonly { path: string; revision: number }[]): Promise<string> {
  return sha256Hex(
    files
      .map((f) => `${f.path}\u0000${f.revision}`)
      .sort()
      .join("\n"),
  );
}

/** What the server sends for "Keep on this device": checked before anything is stored. */
export const DeviceCopyPayloadSchema = z.object({
  orgId: Uuid,
  projectId: Uuid,
  projectName: z.string().min(1).max(200),
  userId: AccountId,
  saveReason: z.string().min(1).max(500).nullable(),
  files: z
    .array(
      z.discriminatedUnion("kind", [
        DeviceCopyFileSchema.extend({ kind: z.literal("text"), content: z.string() }),
        DeviceCopyFileSchema.extend({ kind: z.literal("image"), base64: z.string() }),
      ]),
    )
    .max(5_000),
});
export type DeviceCopyPayload = z.infer<typeof DeviceCopyPayloadSchema>;

export interface CompareLine {
  kind: "context" | "removed" | "added";
  text: string;
}

/**
 * The server's file against the device's, for a person choosing between
 * them: each changed run with up to two unchanged lines before it, cut off
 * past `max` lines and saying so.
 */
export function compareLines(server: string, mine: string, max = 400): { lines: CompareLine[]; truncated: boolean } {
  const before = splitLines(server);
  const lines: CompareLine[] = [];
  for (const h of diffLines(server, mine)) {
    for (let n = Math.max(1, h.oldStart - 2); n < h.oldStart; n += 1) lines.push({ kind: "context", text: before[n - 1] ?? "" });
    for (const text of h.removed) lines.push({ kind: "removed", text });
    for (const text of h.added) lines.push({ kind: "added", text });
    if (lines.length > max) return { lines: lines.slice(0, max), truncated: true };
  }
  return { lines, truncated: false };
}

/** The storage folder names: one per account, one per project inside it. Only checked ids are ever used. */
export function userFolder(userId: string): string | null {
  return AccountId.safeParse(userId).success ? `u-${userId.toLowerCase()}` : null;
}
export function projectFolder(projectId: string): string | null {
  return Uuid.safeParse(projectId).success ? `p-${projectId.toLowerCase()}` : null;
}
