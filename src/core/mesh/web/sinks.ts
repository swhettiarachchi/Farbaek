/**
 * Where a browser keeps files it receives over Mesh (ADR 0097), until the
 * person saves them with a download or clears them. The Origin Private File
 * System when the browser can write to it, so large files never sit in
 * memory; otherwise memory, for transfers up to 200 MB. A transfer is sealed
 * only once every file matched its hash: after a reload, sealed ones are
 * offered again and anything half-received is removed. Nothing received is
 * ever opened or run here.
 */

export class SinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SinkError";
  }
}

export interface SinkFile {
  write(bytes: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

export interface ReceivedMeta {
  name: string;
  from: string;
  at: string;
}

export interface FileSink {
  /** Where the files are kept: in this page's memory, or in the browser's storage until cleared. */
  readonly kind: "memory" | "browser";
  /** Says whether this many bytes fit; throws a SinkError in words when they don't. */
  reserve(bytes: number): Promise<void>;
  open(path: string): Promise<SinkFile>;
  /** Marks the transfer complete: called only after every file matched. */
  seal(meta: ReceivedMeta): Promise<void>;
  /** Everything kept, to save with a download. */
  files(): Promise<{ path: string; file: File }[]>;
  /** Removes everything kept. */
  clear(): Promise<void>;
}

export const MEMORY_LIMIT = 200 * 1024 * 1024;
const MARGIN = 64 * 1024 * 1024;
const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/** Files held in memory: for browsers that can't write their private file system, and for tests. */
export function memorySink(maxBytes = MEMORY_LIMIT): FileSink {
  const kept = new Map<string, Uint8Array[]>();
  return {
    kind: "memory",
    async reserve(bytes) {
      if (bytes > maxBytes) throw new SinkError(`This browser can receive up to ${Math.round(maxBytes / 1024 / 1024)} MB at a time. Send fewer files at once, or receive them on a computer.`);
    },
    async open(path) {
      const parts: Uint8Array[] = [];
      kept.set(path, parts);
      return {
        async write(bytes) {
          parts.push(new Uint8Array(bytes));
        },
        async close() {},
      };
    },
    async seal() {},
    async files() {
      return [...kept.entries()].map(([path, parts]) => ({ path, file: new File(parts as BlobPart[], baseName(path)) }));
    },
    async clear() {
      kept.clear();
    },
  };
}

/** Whether this browser can write files to its private file system. */
export function opfsAvailable(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.storage?.getDirectory === "function" && typeof FileSystemFileHandle !== "undefined" && "createWritable" in FileSystemFileHandle.prototype;
}

const ROOT = "farbaek-received";
const ID = /^[0-9a-f-]{36}$/;
const root = async () => (await navigator.storage.getDirectory()).getDirectoryHandle(ROOT, { create: true });

async function walk(dir: FileSystemDirectoryHandle, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  for await (const [name, handle] of (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
    if (handle.kind === "directory") out.push(...(await walk(handle as FileSystemDirectoryHandle, `${prefix}${name}/`)));
    else out.push(`${prefix}${name}`);
  }
  return out.sort();
}

/** Files in the browser's private file system, in a folder of their own for this transfer. */
export function opfsSink(transferId: string, known: string[] = []): FileSink {
  if (!ID.test(transferId)) throw new SinkError("That transfer can't be kept here.");
  const folder = async () => (await root()).getDirectoryHandle(transferId, { create: true });
  const paths: string[] = [...known];
  return {
    kind: "browser",
    async reserve(bytes) {
      const { quota = 0, usage = 0 } = await navigator.storage.estimate();
      if (quota > 0 && quota - usage < bytes + MARGIN) throw new SinkError("This browser doesn't have room for these files. Free some space, or receive them on a computer.");
    },
    async open(path) {
      let dir = await folder();
      const parts = path.split("/");
      for (const name of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(name, { create: true });
      const handle = await dir.getFileHandle(parts.at(-1)!, { create: true });
      const writable = await handle.createWritable();
      if (!paths.includes(path)) paths.push(path);
      return {
        async write(bytes) {
          await writable.write(new Uint8Array(bytes));
        },
        async close() {
          await writable.close();
        },
      };
    },
    async seal(meta) {
      const handle = await (await root()).getFileHandle(`${transferId}.json`, { create: true });
      const writable = await handle.createWritable();
      await writable.write(JSON.stringify(meta));
      await writable.close();
    },
    async files() {
      const out: { path: string; file: File }[] = [];
      for (const path of paths) {
        let dir = await folder();
        const parts = path.split("/");
        for (const name of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(name);
        out.push({ path, file: await (await dir.getFileHandle(parts.at(-1)!)).getFile() });
      }
      return out;
    },
    async clear() {
      const r = await root();
      await r.removeEntry(`${transferId}.json`).catch(() => undefined);
      await r.removeEntry(transferId, { recursive: true }).catch(() => undefined);
      paths.length = 0;
    },
  };
}

/**
 * Transfers this browser kept before the page was last closed: the sealed
 * ones, ready to save. Folders that were never sealed weren't checked to the
 * end, so they're removed.
 */
export async function opfsKept(): Promise<{ id: string; meta: ReceivedMeta; sink: FileSink }[]> {
  if (!opfsAvailable()) return [];
  const r = await root();
  const names: { name: string; kind: string }[] = [];
  for await (const [name, handle] of (r as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) names.push({ name, kind: handle.kind });
  const kept: { id: string; meta: ReceivedMeta; sink: FileSink }[] = [];
  for (const { name, kind } of names) {
    if (kind !== "directory") continue;
    const meta = await r
      .getFileHandle(`${name}.json`)
      .then((h) => h.getFile())
      .then((f) => f.text())
      .then((t) => JSON.parse(t) as ReceivedMeta)
      .catch(() => null);
    if (!meta || !ID.test(name) || typeof meta.name !== "string" || typeof meta.from !== "string" || typeof meta.at !== "string") {
      await r.removeEntry(name, { recursive: true }).catch(() => undefined);
      await r.removeEntry(`${name}.json`).catch(() => undefined);
      continue;
    }
    kept.push({ id: name, meta, sink: opfsSink(name, await walk(await r.getDirectoryHandle(name))) });
  }
  return kept.sort((a, b) => b.meta.at.localeCompare(a.meta.at));
}
