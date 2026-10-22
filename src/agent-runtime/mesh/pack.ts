/**
 * Packs a folder on this computer for a nearby transfer: every file it may
 * send, hashed with BLAKE3 per 4 MiB chunk and per file while streaming (no
 * file is held in memory), and everything left out with its reason. The
 * same screening as a workspace import decides what stays: credentials
 * files, `.env` files and keys, dependency and build folders, links, and
 * text that looks like a secret. Binary files may travel between computers.
 * Detection is pattern-based and not guaranteed; the window says so.
 */
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { checkAgentPath } from "@/core/agent/paths";
import { CAPSULE_FORMAT, ChunkHasher, manifestDigest, type CapsuleFileEntry, type CapsuleManifest } from "@/core/mesh/capsule";
import { TRANSFER_LIMITS } from "@/core/mesh/protocol";
import { IGNORED_FOLDERS, containsSecret, screenPath } from "@/core/workspace/files";
import { ProjectFolder } from "../fs-guard";

/** Text files up to this size are scanned for secrets. */
const SCAN_TEXT_BYTES = 1024 * 1024;
const utf8 = new TextDecoder("utf-8", { fatal: true });

export type PackSkipReason = "invalid_path" | "ignored_folder" | "secret_file" | "secret_content" | "too_large" | "link";

export interface PackedFolder {
  root: string;
  name: string;
  manifest: CapsuleManifest;
  digest: string;
}

export class PackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PackError";
  }
}

async function looksLikeSecret(folder: ProjectFolder, rel: string, size: number): Promise<boolean> {
  if (size > SCAN_TEXT_BYTES) return false;
  const { handle } = await folder.openRead(rel);
  try {
    const bytes = await handle.readFile();
    if (bytes.includes(0)) return false;
    let text: string;
    try {
      text = utf8.decode(bytes);
    } catch {
      return false;
    }
    return containsSecret(text);
  } finally {
    await handle.close();
  }
}

async function hashFile(folder: ProjectFolder, rel: string): Promise<CapsuleFileEntry> {
  const { handle } = await folder.openRead(rel);
  const hasher = new ChunkHasher();
  try {
    for await (const piece of handle.createReadStream({ highWaterMark: 1024 * 1024, autoClose: false })) hasher.update(piece as Buffer);
  } finally {
    await handle.close();
  }
  const { bytes, blake3, chunks } = hasher.digest();
  return { path: rel, bytes, blake3, chunks };
}

/**
 * Walks and hashes `root`. Folders and files are visited in sorted order, so
 * the same folder packs to the same manifest (apart from its id and time).
 */
export async function packFolder(root: string, options: { onProgress?: (filesDone: number) => void } = {}): Promise<PackedFolder> {
  const folder = await ProjectFolder.open(root);
  const files: CapsuleFileEntry[] = [];
  const excluded: { path: string; reason: PackSkipReason }[] = [];
  let total = 0;
  const queue: string[] = [""];

  while (queue.length > 0) {
    const dir = queue.shift()!;
    const dirents = await fs.readdir(dir === "" ? folder.root : path.join(folder.root, ...dir.split("/")), { withFileTypes: true });
    for (const d of dirents.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      if (d.name.startsWith(".farbaek-")) continue;
      const rel = (dir === "" ? d.name : `${dir}/${d.name}`).normalize("NFC");
      if (d.isSymbolicLink()) {
        excluded.push({ path: rel.slice(0, 300), reason: "link" });
        continue;
      }
      if (!checkAgentPath(rel).ok) {
        excluded.push({ path: rel.slice(0, 300), reason: "invalid_path" });
        continue;
      }
      if (d.isDirectory()) {
        if (IGNORED_FOLDERS.has(d.name)) excluded.push({ path: `${rel}/`.slice(0, 300), reason: "ignored_folder" });
        else queue.push(rel);
        continue;
      }
      if (!d.isFile()) continue;
      const screened = screenPath(rel);
      if (!screened.ok) {
        excluded.push({ path: rel.slice(0, 300), reason: screened.reason === "binary" ? "invalid_path" : screened.reason });
        continue;
      }
      const stat = await fs.lstat(path.join(folder.root, ...rel.split("/")));
      if (stat.size > TRANSFER_LIMITS.maxFileBytes) {
        excluded.push({ path: rel.slice(0, 300), reason: "too_large" });
        continue;
      }
      if (await looksLikeSecret(folder, rel, stat.size)) {
        excluded.push({ path: rel.slice(0, 300), reason: "secret_content" });
        continue;
      }
      if (files.length >= TRANSFER_LIMITS.maxFiles) throw new PackError(`This folder has more than ${TRANSFER_LIMITS.maxFiles.toLocaleString("en-US")} files to send. Choose a smaller folder.`);
      const entry = await hashFile(folder, rel);
      total += entry.bytes;
      if (total > TRANSFER_LIMITS.maxTotalBytes) throw new PackError("This folder holds more than 4 GB to send. Choose a smaller folder.");
      files.push(entry);
      options.onProgress?.(files.length);
    }
  }

  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const name = path.basename(folder.root).slice(0, 120) || "Folder";
  const manifest: CapsuleManifest = {
    format: CAPSULE_FORMAT,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    source: { projectId: null, projectName: name },
    files,
    excluded: excluded.slice(0, 50_000),
    totals: { files: files.length, bytes: total },
  };
  return { root: folder.root, name, manifest, digest: manifestDigest(manifest) };
}
