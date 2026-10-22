/**
 * The agent's only way to touch the disk: one project folder, fixed by
 * realpath when it opens. Every path is checked lexically first
 * (../core/agent/paths.ts), then walked one name at a time with lstat:
 * symlinks and Windows junctions are refused wherever they appear, and the
 * final path is resolved with realpath again and must still be inside the
 * root. Files with more than one hard link are refused too, since a hard
 * link can name a file outside the folder without looking like a link.
 *
 * Time-of-check races are narrowed, not eliminated:
 * - reads open the file and compare the handle's identity (device and inode)
 *   with the lstat taken during the walk, and refuse on a mismatch;
 * - writes go to a new temporary file created exclusively ("wx", which never
 *   follows an existing link) and are renamed over the target, so a target
 *   swapped for a link is replaced, not followed;
 * - on POSIX, opens also pass O_NOFOLLOW. Windows has no equivalent flag in
 *   Node, so a folder swapped for a junction between the parent check and
 *   the rename is the remaining window. Only the agent and the commands a
 *   person approves write inside this folder.
 */
import { randomUUID } from "node:crypto";
import { constants, promises as fs, type BigIntStats } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";
import { checkAgentDir, checkAgentPath } from "@/core/agent/paths";
import { IGNORED_FOLDERS } from "@/core/workspace/files";

export type GuardErrorCode = "INVALID_PATH" | "OUTSIDE_ROOT" | "LINK" | "NOT_FOUND" | "NOT_A_FILE" | "NOT_A_FOLDER" | "TOO_LARGE" | "BINARY" | "CHANGED";

export class FolderGuardError extends Error {
  constructor(
    readonly code: GuardErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "FolderGuardError";
  }
}

export interface GuardLimits {
  maxReadBytes: number;
  maxListEntries: number;
  maxWalkFiles: number;
  maxSearchMatches: number;
  maxSearchFileBytes: number;
}

export const DEFAULT_GUARD_LIMITS: GuardLimits = {
  maxReadBytes: 512 * 1024,
  maxListEntries: 500,
  maxWalkFiles: 5_000,
  maxSearchMatches: 100,
  maxSearchFileBytes: 1024 * 1024,
};

export type EntryKind = "file" | "folder" | "link" | "other";
export interface Listing {
  dir: string;
  entries: { name: string; kind: EntryKind }[];
  truncated: boolean;
}
export interface SearchResult {
  matches: { path: string; line: number; text: string }[];
  truncated: boolean;
  filesSearched: number;
}

const NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const utf8 = new TextDecoder("utf-8", { fatal: true });

function isMissing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}

/** Whether `candidate` is `root` or inside it. Both must be absolute and resolved. */
export function isInside(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate);
  return rel === "" || (rel.split(path.sep)[0] !== ".." && !path.isAbsolute(rel));
}

interface Resolved {
  abs: string;
  rel: string;
  stat: BigIntStats | null;
}

export class ProjectFolder {
  private constructor(
    readonly root: string,
    readonly limits: GuardLimits,
  ) {}

  static async open(root: string, limits: Partial<GuardLimits> = {}): Promise<ProjectFolder> {
    const real = await fs.realpath(root);
    const stat = await fs.lstat(real);
    if (!stat.isDirectory()) throw new FolderGuardError("NOT_A_FOLDER", "The project folder isn't a folder.");
    return new ProjectFolder(real, { ...DEFAULT_GUARD_LIMITS, ...limits });
  }

  /** Walks `rel` one name at a time. Links anywhere on the way are refused; missing names end the walk. */
  private async resolve(rel: string, mustExist: boolean): Promise<Resolved> {
    const checked = checkAgentPath(rel);
    if (!checked.ok) throw new FolderGuardError("INVALID_PATH", `${rel}: ${checked.reason}`);
    const parts = checked.path.split("/");
    let current = this.root;
    let stat: BigIntStats | null = null;
    for (const [i, part] of parts.entries()) {
      current = path.join(current, part);
      try {
        stat = await fs.lstat(current, { bigint: true });
      } catch (error) {
        if (!isMissing(error)) throw error;
        if (mustExist) throw new FolderGuardError("NOT_FOUND", `${checked.path} doesn't exist.`);
        return { abs: path.join(this.root, ...parts), rel: checked.path, stat: null };
      }
      if (stat.isSymbolicLink()) throw new FolderGuardError("LINK", `${parts.slice(0, i + 1).join("/")} is a link, and the agent doesn't follow links.`);
      if (i < parts.length - 1 && !stat.isDirectory()) throw new FolderGuardError("NOT_A_FOLDER", `${parts.slice(0, i + 1).join("/")} isn't a folder.`);
    }
    const real = await fs.realpath(current);
    if (!isInside(this.root, real)) throw new FolderGuardError("OUTSIDE_ROOT", `${checked.path} resolves outside the project folder.`);
    return { abs: current, rel: checked.path, stat };
  }

  async exists(rel: string): Promise<boolean> {
    try {
      const r = await this.resolve(rel, false);
      return r.stat?.isFile() ?? false;
    } catch {
      return false;
    }
  }

  async read(rel: string): Promise<string> {
    const r = await this.resolve(rel, true);
    const stat = r.stat!;
    if (!stat.isFile()) throw new FolderGuardError("NOT_A_FILE", `${r.rel} isn't a file.`);
    if (stat.nlink > 1n) throw new FolderGuardError("LINK", `${r.rel} has more than one hard link, so it could be a file outside the project.`);
    if (stat.size > BigInt(this.limits.maxReadBytes)) throw new FolderGuardError("TOO_LARGE", `${r.rel} is larger than ${this.limits.maxReadBytes / 1024} KB.`);
    const handle = await fs.open(r.abs, constants.O_RDONLY | NOFOLLOW);
    try {
      const opened = await handle.stat({ bigint: true });
      if (opened.ino !== stat.ino || opened.dev !== stat.dev) throw new FolderGuardError("CHANGED", `${r.rel} changed while it was being opened.`);
      const bytes = await handle.readFile();
      if (bytes.length > this.limits.maxReadBytes) throw new FolderGuardError("TOO_LARGE", `${r.rel} is larger than ${this.limits.maxReadBytes / 1024} KB.`);
      if (bytes.includes(0)) throw new FolderGuardError("BINARY", `${r.rel} isn't a text file.`);
      try {
        return utf8.decode(bytes);
      } catch {
        throw new FolderGuardError("BINARY", `${r.rel} isn't UTF-8 text.`);
      }
    } finally {
      await handle.close();
    }
  }

  /** Creates the missing folders of `rel`'s parent one at a time, refusing links. Returns the parent's absolute path. */
  private async ensureParent(rel: string): Promise<string> {
    const parts = rel.split("/").slice(0, -1);
    let current = this.root;
    for (const part of parts) {
      current = path.join(current, part);
      let stat;
      try {
        stat = await fs.lstat(current);
      } catch (error) {
        if (!isMissing(error)) throw error;
        await fs.mkdir(current);
        stat = await fs.lstat(current);
      }
      if (stat.isSymbolicLink()) throw new FolderGuardError("LINK", `${path.relative(this.root, current).split(path.sep).join("/")} is a link, and the agent doesn't follow links.`);
      if (!stat.isDirectory()) throw new FolderGuardError("NOT_A_FOLDER", `${path.relative(this.root, current).split(path.sep).join("/")} isn't a folder.`);
    }
    return current;
  }

  async write(rel: string, content: string): Promise<void> {
    const r = await this.resolve(rel, false);
    if (r.stat && !r.stat.isFile()) throw new FolderGuardError("NOT_A_FILE", `${r.rel} isn't a file.`);
    if (r.stat && r.stat.nlink > 1n) throw new FolderGuardError("LINK", `${r.rel} has more than one hard link, so it could be a file outside the project.`);
    const parent = await this.ensureParent(r.rel);
    const tmp = path.join(parent, `.farbaek-${randomUUID()}.tmp`);
    const handle = await fs.open(tmp, "wx");
    try {
      await handle.writeFile(content, "utf8");
    } finally {
      await handle.close();
    }
    try {
      const realParent = await fs.realpath(parent);
      if (!isInside(this.root, realParent)) throw new FolderGuardError("OUTSIDE_ROOT", `${r.rel} resolves outside the project folder.`);
      await fs.rename(tmp, r.abs);
    } catch (error) {
      await fs.rm(tmp, { force: true });
      throw error;
    }
  }

  /**
   * Opens a file of any kind for streaming reads, checked like read() but
   * with no size or text limit. Mesh sends files this way, piece by piece.
   * The caller closes the handle.
   */
  async openRead(rel: string): Promise<{ handle: FileHandle; size: number }> {
    const r = await this.resolve(rel, true);
    const stat = r.stat!;
    if (!stat.isFile()) throw new FolderGuardError("NOT_A_FILE", `${r.rel} isn't a file.`);
    if (stat.nlink > 1n) throw new FolderGuardError("LINK", `${r.rel} has more than one hard link, so it could be a file outside the folder.`);
    const handle = await fs.open(r.abs, constants.O_RDONLY | NOFOLLOW);
    const opened = await handle.stat({ bigint: true });
    if (opened.ino !== stat.ino || opened.dev !== stat.dev) {
      await handle.close();
      throw new FolderGuardError("CHANGED", `${r.rel} changed while it was being opened.`);
    }
    return { handle, size: Number(opened.size) };
  }

  /**
   * Creates a file that doesn't exist yet, for streaming writes. "wx" never
   * replaces or follows anything already there. The caller closes the handle.
   */
  async createNew(rel: string): Promise<FileHandle> {
    const r = await this.resolve(rel, false);
    if (r.stat) throw new FolderGuardError("CHANGED", `${r.rel} already exists.`);
    const parent = await this.ensureParent(r.rel);
    const realParent = await fs.realpath(parent);
    if (!isInside(this.root, realParent)) throw new FolderGuardError("OUTSIDE_ROOT", `${r.rel} resolves outside the folder.`);
    return fs.open(r.abs, "wx", 0o644);
  }

  /** Moves a file to a path that doesn't exist yet, inside the folder. */
  async moveNew(fromRel: string, toRel: string): Promise<void> {
    const from = await this.resolve(fromRel, true);
    if (!from.stat!.isFile()) throw new FolderGuardError("NOT_A_FILE", `${from.rel} isn't a file.`);
    const to = await this.resolve(toRel, false);
    if (to.stat) throw new FolderGuardError("CHANGED", `${to.rel} already exists.`);
    const parent = await this.ensureParent(to.rel);
    const realParent = await fs.realpath(parent);
    if (!isInside(this.root, realParent)) throw new FolderGuardError("OUTSIDE_ROOT", `${to.rel} resolves outside the folder.`);
    await fs.rename(from.abs, to.abs);
  }

  /** Deletes one file. Used to undo a file the agent created; unlink never follows a link. */
  async remove(rel: string): Promise<void> {
    const r = await this.resolve(rel, true);
    if (!r.stat!.isFile()) throw new FolderGuardError("NOT_A_FILE", `${r.rel} isn't a file.`);
    await fs.unlink(r.abs);
  }

  async list(dir: string): Promise<Listing> {
    const checked = checkAgentDir(dir);
    if (!checked.ok) throw new FolderGuardError("INVALID_PATH", `${dir}: ${checked.reason}`);
    let abs = this.root;
    if (checked.path !== "") {
      const r = await this.resolve(checked.path, true);
      if (!r.stat!.isDirectory()) throw new FolderGuardError("NOT_A_FOLDER", `${r.rel} isn't a folder.`);
      abs = r.abs;
    }
    const dirents = await fs.readdir(abs, { withFileTypes: true });
    const entries = dirents
      .filter((d) => !d.name.startsWith(".farbaek-"))
      .map((d) => ({ name: d.name, kind: (d.isSymbolicLink() ? "link" : d.isDirectory() ? "folder" : d.isFile() ? "file" : "other") as EntryKind }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { dir: checked.path, entries: entries.slice(0, this.limits.maxListEntries), truncated: entries.length > this.limits.maxListEntries };
  }

  /**
   * Every file in the project as relative paths, sorted. Dependency and build
   * folders, links and names the path rules refuse are left out.
   */
  async walk(): Promise<{ files: string[]; truncated: boolean }> {
    const files: string[] = [];
    const queue: string[] = [""];
    while (queue.length > 0) {
      const dir = queue.shift()!;
      const dirents = await fs.readdir(dir === "" ? this.root : path.join(this.root, ...dir.split("/")), { withFileTypes: true });
      for (const d of dirents.sort((a, b) => a.name.localeCompare(b.name))) {
        if (d.isSymbolicLink() || d.name.startsWith(".farbaek-")) continue;
        const rel = dir === "" ? d.name : `${dir}/${d.name}`;
        if (!checkAgentPath(rel).ok) continue;
        if (d.isDirectory()) {
          if (!IGNORED_FOLDERS.has(d.name)) queue.push(rel);
        } else if (d.isFile()) {
          files.push(rel);
          if (files.length >= this.limits.maxWalkFiles) return { files: files.sort(), truncated: true };
        }
      }
    }
    return { files: files.sort(), truncated: false };
  }

  /** Case-insensitive plain-text search across the project's text files. */
  async search(query: string): Promise<SearchResult> {
    const needle = query.toLowerCase();
    const { files } = await this.walk();
    const matches: SearchResult["matches"] = [];
    let filesSearched = 0;
    for (const file of files) {
      let content: string;
      try {
        const stat = await fs.lstat(path.join(this.root, ...file.split("/")));
        if (stat.size > this.limits.maxSearchFileBytes) continue;
        content = await this.read(file);
      } catch {
        continue;
      }
      filesSearched += 1;
      const lines = content.split("\n");
      for (const [i, line] of lines.entries()) {
        if (!line.toLowerCase().includes(needle)) continue;
        matches.push({ path: file, line: i + 1, text: line.trim().slice(0, 200) });
        if (matches.length >= this.limits.maxSearchMatches) return { matches, truncated: true, filesSearched };
      }
    }
    return { matches, truncated: false, filesSearched };
  }
}
