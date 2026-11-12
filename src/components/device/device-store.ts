/**
 * Projects kept in this browser (ADR 0192), in its private file storage
 * (the origin private file system). Browser-only: import it from client
 * components.
 *
 * farbaek/
 *   owner.json             the account the copies belong to
 *   u-<user>/
 *     queue.json           saves waiting for the network, one per file
 *     p-<project>/
 *       manifest.json      the files kept and their revisions, written last
 *       c-<sha256>         each kept file's bytes, named by their hash
 *
 * One account at a time: the device page shows only the owner's copies.
 * Signing out, or another account signing in, removes the previous account's
 * project copies. Its saves still waiting stay, unseen, until it signs in
 * here again; nothing typed offline is lost, and nobody else sees it.
 */
import { z } from "zod";
import {
  AccountId,
  DEVICE_COPY_VERSION,
  DeviceQueueSchema,
  blobName,
  readManifest,
  readQueue,
  sha256Hex,
  userFolder,
  projectFolder,
  type DeviceCopyFile,
  type DeviceCopyManifest,
  type DeviceCopyPayload,
  type QueuedSave,
} from "@/core/workspace/device-copy";
import { checkPath } from "@/core/workspace/files";

type Dir = FileSystemDirectoryHandle;
type Entries = { entries(): AsyncIterable<[string, FileSystemHandle]> };

const ROOT = "farbaek";
const LOCK = "farbaek-device";

/** Whether this browser can keep files for offline use, and why not. */
export function deviceStorageSupport(): { ok: true } | { ok: false; reason: string } {
  if (typeof navigator === "undefined" || !navigator.storage || typeof navigator.storage.getDirectory !== "function") {
    return { ok: false, reason: "This browser can't keep files for offline use. Chrome on Android can, and so does Farbaek's Android app." };
  }
  if (typeof FileSystemFileHandle === "undefined" || !("createWritable" in FileSystemFileHandle.prototype)) {
    return { ok: false, reason: "This browser can't save files for offline use yet. Chrome on Android can, and so does Farbaek's Android app." };
  }
  return { ok: true };
}

/** One change at a time across this browser's tabs, so two tabs can't overwrite each other's queue. */
async function locked<T>(fn: () => Promise<T>): Promise<T> {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  return locks ? (locks.request(LOCK, fn) as Promise<T>) : fn();
}

async function rootDir(create: boolean): Promise<Dir | null> {
  try {
    const opfs = await navigator.storage.getDirectory();
    return await opfs.getDirectoryHandle(ROOT, { create });
  } catch {
    return null;
  }
}

async function child(dir: Dir, name: string, create: boolean): Promise<Dir | null> {
  try {
    return await dir.getDirectoryHandle(name, { create });
  } catch {
    return null;
  }
}

async function readText(dir: Dir, name: string): Promise<string | null> {
  try {
    return await (await (await dir.getFileHandle(name)).getFile()).text();
  } catch {
    return null;
  }
}

async function readBytes(dir: Dir, name: string): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await (await (await dir.getFileHandle(name)).getFile()).arrayBuffer());
  } catch {
    return null;
  }
}

async function readJson(dir: Dir, name: string): Promise<unknown> {
  const text = await readText(dir, name);
  if (text === null) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** A write lands whole or not at all: the browser swaps the file in when the stream closes. */
async function write(dir: Dir, name: string, data: string | Uint8Array): Promise<void> {
  const stream = await (await dir.getFileHandle(name, { create: true })).createWritable();
  try {
    await stream.write(data as FileSystemWriteChunkType);
    await stream.close();
  } catch (e) {
    await stream.abort().catch(() => undefined);
    throw e;
  }
}

async function names(dir: Dir): Promise<{ name: string; kind: FileSystemHandleKind }[]> {
  const out: { name: string; kind: FileSystemHandleKind }[] = [];
  for await (const [name, handle] of (dir as unknown as Entries).entries()) out.push({ name, kind: handle.kind });
  return out;
}

const Owner = z.object({ userId: AccountId });

/** The account whose copies are here, from the last time someone signed in on this browser. */
export async function deviceOwner(): Promise<string | null> {
  const root = await rootDir(false);
  if (!root) return null;
  const parsed = Owner.safeParse(await readJson(root, "owner.json"));
  return parsed.success ? parsed.data.userId : null;
}

/** An account steps away from this browser: its project copies go; its folder too, unless saves are still waiting in it. */
async function release(root: Dir, folder: string): Promise<void> {
  const user = await child(root, folder, false);
  if (!user) return;
  for (const entry of await names(user)) {
    if (entry.kind === "directory" && entry.name.startsWith("p-")) await user.removeEntry(entry.name, { recursive: true }).catch(() => undefined);
  }
  // Any save at all keeps the folder: when in doubt, nothing typed offline is thrown away.
  const queue = DeviceQueueSchema.safeParse(await readJson(user, "queue.json"));
  if (!queue.success || queue.data.saves.length === 0) await root.removeEntry(folder, { recursive: true }).catch(() => undefined);
}

async function claimUnlocked(root: Dir, userId: string): Promise<void> {
  const mine = userFolder(userId);
  if (!mine) return;
  for (const entry of await names(root)) {
    if (entry.kind === "directory" && entry.name.startsWith("u-") && entry.name !== mine) await release(root, entry.name);
  }
  if ((await deviceOwner()) !== userId) await write(root, "owner.json", JSON.stringify({ userId }));
}

/**
 * Called when someone signed in opens the app: they become the device's
 * owner, and another account's project copies are removed (its waiting
 * saves stay hidden until it signs in here again). Does nothing in a browser
 * that never kept a copy.
 */
export async function claimDevice(userId: string): Promise<void> {
  if (!userFolder(userId) || !deviceStorageSupport().ok) return;
  await locked(async () => {
    const root = await rootDir(false);
    if (root) await claimUnlocked(root, userId);
  });
}

/**
 * Signing out: the account's project copies are removed and the device has
 * no owner, so the device page shows nothing to whoever has the phone next.
 * Saves still waiting stay hidden until the account signs in here again.
 * Deleting the account removes everything, waiting saves too.
 */
export async function forgetDevice(options: { evenWaiting?: boolean } = {}): Promise<"removed" | "kept_waiting" | "nothing"> {
  if (!deviceStorageSupport().ok) return "nothing";
  return locked(async () => {
    const root = await rootDir(false);
    if (!root) return "nothing";
    const opfs = await navigator.storage.getDirectory();
    if (options.evenWaiting) {
      await opfs.removeEntry(ROOT, { recursive: true }).catch(() => undefined);
      return "removed";
    }
    const owner = await deviceOwner();
    const waiting = owner ? (await readSavesUnlocked(owner)).length > 0 : false;
    for (const entry of await names(root)) {
      if (entry.kind === "directory" && entry.name.startsWith("u-")) await release(root, entry.name);
    }
    await root.removeEntry("owner.json").catch(() => undefined);
    return waiting ? "kept_waiting" : "removed";
  });
}

async function projectDir(userId: string, projectId: string, create: boolean): Promise<Dir | null> {
  const u = userFolder(userId);
  const p = projectFolder(projectId);
  if (!u || !p) return null;
  const root = await rootDir(create);
  const user = root ? await child(root, u, create) : null;
  return user ? child(user, p, create) : null;
}

/** The projects kept for this account, newest first. */
export async function keptProjects(userId: string): Promise<DeviceCopyManifest[]> {
  const u = userFolder(userId);
  const root = u ? await rootDir(false) : null;
  const user = root && u ? await child(root, u, false) : null;
  if (!user) return [];
  const out: DeviceCopyManifest[] = [];
  for (const entry of await names(user)) {
    if (entry.kind !== "directory" || !entry.name.startsWith("p-")) continue;
    const dir = await child(user, entry.name, false);
    const manifest = dir ? readManifest(await readJson(dir, "manifest.json"), { userId, projectId: entry.name.slice(2) }) : null;
    if (manifest) out.push(manifest);
  }
  return out.sort((a, b) => b.keptAt.localeCompare(a.keptAt));
}

export async function keptProject(userId: string, projectId: string): Promise<DeviceCopyManifest | null> {
  const dir = await projectDir(userId, projectId, false);
  return dir ? readManifest(await readJson(dir, "manifest.json"), { userId, projectId }) : null;
}

const decodeBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** Removes kept contents the manifest no longer names. */
async function sweep(dir: Dir, manifest: DeviceCopyManifest): Promise<void> {
  const wanted = new Set(manifest.files.map((f) => blobName(f.sha256)));
  for (const entry of await names(dir)) {
    if (entry.kind === "file" && entry.name.startsWith("c-") && !wanted.has(entry.name)) await dir.removeEntry(entry.name).catch(() => undefined);
  }
}

/**
 * Keeps (or refreshes) a project from the server's copy. Each file's bytes
 * are checked against its hash before they're stored; the manifest is
 * written last, so a copy cut short keeps the previous one whole.
 */
export async function keepProject(copy: DeviceCopyPayload, now: Date): Promise<DeviceCopyManifest> {
  return locked(async () => {
    const dir = await projectDir(copy.userId, copy.projectId, true);
    if (!dir) throw new Error("This browser's storage couldn't be opened.");
    const root = await rootDir(true);
    if (root) await claimUnlocked(root, copy.userId);
    const files: DeviceCopyFile[] = [];
    for (const f of copy.files) {
      const checked = checkPath(f.path);
      if (!checked.ok || checked.path !== f.path) throw new Error(`${f.path.slice(0, 120)} has a path this device can't keep.`);
      const bytes = f.kind === "text" ? new TextEncoder().encode(f.content) : decodeBase64(f.base64);
      if ((await sha256Hex(bytes)) !== f.sha256) throw new Error(`${f.path} didn't arrive whole. Try again.`);
      const name = blobName(f.sha256)!;
      if ((await readBytes(dir, name)) === null) await write(dir, name, bytes);
      files.push({ path: f.path, revision: f.revision, sha256: f.sha256, kind: f.kind });
    }
    const manifest: DeviceCopyManifest = { v: DEVICE_COPY_VERSION, userId: copy.userId, orgId: copy.orgId, projectId: copy.projectId, projectName: copy.projectName, keptAt: now.toISOString(), saveReason: copy.saveReason, files };
    await write(dir, "manifest.json", JSON.stringify(manifest));
    await sweep(dir, manifest);
    return manifest;
  });
}

/** A kept file's contents, checked against its hash; null when it's missing or damaged. */
export async function readKept(userId: string, projectId: string, file: DeviceCopyFile): Promise<Uint8Array | null> {
  const dir = await projectDir(userId, projectId, false);
  const name = blobName(file.sha256);
  const bytes = dir && name ? await readBytes(dir, name) : null;
  return bytes && (await sha256Hex(bytes)) === file.sha256 ? bytes : null;
}

export async function readKeptText(userId: string, projectId: string, file: DeviceCopyFile): Promise<string | null> {
  const bytes = await readKept(userId, projectId, file);
  // A byte order mark stays, as the web editor keeps it.
  return bytes ? new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes) : null;
}

/** After a save reached the server: the kept copy moves to that revision of that file. */
export async function recordSaved(userId: string, projectId: string, input: { path: string; content: string; revision: number }): Promise<void> {
  await locked(async () => {
    const dir = await projectDir(userId, projectId, false);
    const manifest = dir ? readManifest(await readJson(dir, "manifest.json"), { userId, projectId }) : null;
    if (!dir || !manifest) return;
    const bytes = new TextEncoder().encode(input.content);
    const sha256 = await sha256Hex(bytes);
    await write(dir, blobName(sha256)!, bytes);
    const file: DeviceCopyFile = { path: input.path, revision: input.revision, sha256, kind: "text" };
    const files = [...manifest.files.filter((f) => f.path !== input.path), file].sort((a, b) => a.path.localeCompare(b.path));
    const next = { ...manifest, files };
    await write(dir, "manifest.json", JSON.stringify(next));
    await sweep(dir, next);
  });
}

/** Removes one project's copy and any saves of it still waiting. */
export async function removeKept(userId: string, projectId: string): Promise<void> {
  await locked(async () => {
    const u = userFolder(userId);
    const p = projectFolder(projectId);
    const root = await rootDir(false);
    const user = root && u ? await child(root, u, false) : null;
    if (!user || !p) return;
    await user.removeEntry(p, { recursive: true }).catch(() => undefined);
    const saves = await readSavesUnlocked(userId);
    await writeSavesUnlocked(userId, saves.filter((s) => s.projectId !== projectId));
  });
}

async function readSavesUnlocked(userId: string): Promise<QueuedSave[]> {
  const u = userFolder(userId);
  const root = u ? await rootDir(false) : null;
  const user = root && u ? await child(root, u, false) : null;
  return user ? readQueue(await readJson(user, "queue.json"), userId) : [];
}

async function writeSavesUnlocked(userId: string, saves: readonly QueuedSave[]): Promise<void> {
  const u = userFolder(userId);
  const root = u ? await rootDir(true) : null;
  const user = root && u ? await child(root, u, true) : null;
  if (!user) throw new Error("This browser's storage couldn't be opened.");
  await write(user, "queue.json", JSON.stringify({ v: DEVICE_COPY_VERSION, userId, saves }));
}

export const readSaves = (userId: string) => readSavesUnlocked(userId);

/** Changes the waiting saves in one step, under the lock: `change` gets the current list and returns the new one. */
export async function updateSaves(userId: string, change: (saves: QueuedSave[]) => QueuedSave[]): Promise<QueuedSave[]> {
  return locked(async () => {
    const next = change(await readSavesUnlocked(userId));
    await writeSavesUnlocked(userId, next);
    return next;
  });
}

/** Whether the browser agreed to keep this site's storage when space runs low. */
export async function storagePersisted(): Promise<boolean | null> {
  try {
    return typeof navigator.storage.persisted === "function" ? await navigator.storage.persisted() : null;
  } catch {
    return null;
  }
}

/** Asks the browser to keep the copies even when space runs low. It may still say no. */
export async function askToPersist(): Promise<boolean | null> {
  try {
    return typeof navigator.storage.persist === "function" ? await navigator.storage.persist() : null;
  } catch {
    return null;
  }
}
