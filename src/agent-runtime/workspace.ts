/**
 * The agent's working copy of one task's project, on top of the folder
 * guard. It has two write modes:
 *
 * - "patch" (Review Only): writes are kept in memory as a patch. Reads,
 *   listings and searches see the patch, and nothing on disk changes.
 * - "disk" (Controlled Development and Sandboxed Autopilot): writes go to the
 *   folder, so approved commands such as tests see them.
 *
 * Either way, every write is screened like an import (path rules, credentials
 * files, secret-looking content, size) and records a checkpoint first, so any
 * step can be undone. The finished work is the difference from the project
 * snapshot the copy was made from, as ordinary proposed changes.
 */
import { applyEdits, type ProposedChange } from "@/core/realityloop/change-proposal";
import { sha256Hex } from "@/core/trust/canonical-json";
import { checkAgentPath } from "@/core/agent/paths";
import { SKIP_LABELS, screenFile } from "@/core/workspace/files";
import { FolderGuardError, type Listing, type ProjectFolder, type SearchResult } from "./fs-guard";

export type WriteMode = "patch" | "disk";

export interface BaseFile {
  path: string;
  revision: number;
  sha256: string;
}

export interface Checkpoint {
  id: number;
  path: string;
  /** The content before the write; null when the write created the file. */
  before: string | null;
  /** Patch mode only: whether the patch already held this file. */
  hadPatch: boolean;
  reason: string;
}

export type WorkspaceErrorCode = "SCREENED" | "EDIT_FAILED" | "NO_CHANGE";

export class WorkspaceError extends Error {
  constructor(
    readonly code: WorkspaceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "WorkspaceError";
  }
}

export const MAX_FILE_BYTES = 512 * 1024;
const utf8Bytes = (s: string) => new TextEncoder().encode(s).length;

function normalize(raw: string): string {
  const checked = checkAgentPath(raw);
  if (!checked.ok) throw new FolderGuardError("INVALID_PATH", `${raw}: ${checked.reason}`);
  return checked.path;
}

/** Writes a project snapshot into an empty folder. Files whose names this computer can't hold safely are skipped, with the reason. */
export async function materialize(folder: ProjectFolder, files: readonly { path: string; content: string }[]): Promise<{ written: number; skipped: { path: string; reason: string }[] }> {
  const skipped: { path: string; reason: string }[] = [];
  let written = 0;
  for (const file of files) {
    const checked = checkAgentPath(file.path);
    if (!checked.ok) {
      skipped.push({ path: file.path, reason: checked.reason });
      continue;
    }
    await folder.write(checked.path, file.content);
    written += 1;
  }
  return { written, skipped };
}

export class AgentWorkspace {
  private readonly patch = new Map<string, string>();
  private known = new Set<string>();
  private checkpoints: Checkpoint[] = [];
  private nextCheckpoint = 1;
  private readonly reasons = new Map<string, string>();
  private readonly base: Map<string, BaseFile>;

  private constructor(
    readonly folder: ProjectFolder,
    readonly mode: WriteMode,
    base: readonly BaseFile[],
  ) {
    this.base = new Map(base.map((b) => [b.path, b]));
  }

  static async open(folder: ProjectFolder, mode: WriteMode, base: readonly BaseFile[]): Promise<AgentWorkspace> {
    const workspace = new AgentWorkspace(folder, mode, base);
    await workspace.refresh();
    return workspace;
  }

  /** Re-reads which files exist. Run after a command, which may create or delete files. */
  async refresh(): Promise<void> {
    const { files } = await this.folder.walk();
    this.known = new Set([...files, ...this.patch.keys()]);
  }

  exists(raw: string): boolean {
    const checked = checkAgentPath(raw);
    return checked.ok && this.known.has(checked.path);
  }

  files(): string[] {
    return [...this.known].sort();
  }

  async read(raw: string): Promise<string> {
    const path = normalize(raw);
    const patched = this.patch.get(path);
    return patched ?? this.folder.read(path);
  }

  async list(dir: string): Promise<Listing> {
    const listing = await this.folder.list(dir);
    if (this.mode !== "patch" || this.patch.size === 0) return listing;
    const prefix = listing.dir === "" ? "" : `${listing.dir}/`;
    const names = new Map(listing.entries.map((e) => [e.name, e]));
    for (const path of this.patch.keys()) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length).split("/");
      const name = rest[0]!;
      if (!names.has(name)) names.set(name, { name, kind: rest.length > 1 ? "folder" : "file" });
    }
    return { ...listing, entries: [...names.values()].sort((a, b) => a.name.localeCompare(b.name)) };
  }

  async search(query: string): Promise<SearchResult> {
    const result = await this.folder.search(query);
    if (this.mode !== "patch" || this.patch.size === 0) return result;
    const needle = query.toLowerCase();
    const matches = result.matches.filter((m) => !this.patch.has(m.path));
    for (const [path, content] of [...this.patch.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      for (const [i, line] of content.split("\n").entries()) {
        if (line.toLowerCase().includes(needle)) matches.push({ path, line: i + 1, text: line.trim().slice(0, 200) });
      }
    }
    const max = this.folder.limits.maxSearchMatches;
    return { matches: matches.slice(0, max), truncated: result.truncated || matches.length > max, filesSearched: result.filesSearched };
  }

  /** Writes a whole file after screening it. Returns the checkpoint that undoes it. */
  async write(raw: string, content: string, reason: string): Promise<Checkpoint> {
    const path = normalize(raw);
    const screened = screenFile(path, content, utf8Bytes(content), MAX_FILE_BYTES);
    if (!screened.ok) throw new WorkspaceError("SCREENED", `${path} can't be written: ${SKIP_LABELS[screened.reason].toLowerCase()}.`);
    const existed = this.known.has(path);
    const before = existed ? await this.read(path) : null;
    if (before === content) throw new WorkspaceError("NO_CHANGE", `${path} already has this content.`);
    const checkpoint: Checkpoint = { id: this.nextCheckpoint++, path, before, hadPatch: this.patch.has(path), reason };
    if (this.mode === "patch") this.patch.set(path, content);
    else await this.folder.write(path, content);
    this.checkpoints.push(checkpoint);
    this.known.add(path);
    this.reasons.set(path, reason);
    return checkpoint;
  }

  async edit(raw: string, edits: readonly { find: string; replace: string }[], reason: string): Promise<Checkpoint> {
    const path = normalize(raw);
    const current = await this.read(path);
    const applied = applyEdits(current, edits);
    if (!applied.ok) {
      const which = `Edit ${applied.index + 1}`;
      throw new WorkspaceError("EDIT_FAILED", applied.reason === "find_not_found" ? `${which}: the text to find isn't in ${path}. Read the file again and copy the text exactly.` : `${which}: the text to find appears more than once in ${path}. Include more surrounding lines.`);
    }
    if (applied.content === current) throw new WorkspaceError("NO_CHANGE", `The edits don't change ${path}.`);
    return this.write(path, applied.content, reason);
  }

  listCheckpoints(): readonly Checkpoint[] {
    return this.checkpoints;
  }

  /** Undoes checkpoint `id` and every write after it, newest first. */
  async restore(id: number): Promise<number> {
    const undo = this.checkpoints.filter((c) => c.id >= id).reverse();
    for (const c of undo) {
      if (this.mode === "patch") {
        if (c.hadPatch && c.before !== null) this.patch.set(c.path, c.before);
        else this.patch.delete(c.path);
        if (c.before === null) this.known.delete(c.path);
      } else if (c.before === null) {
        await this.folder.remove(c.path).catch((error: unknown) => {
          if (!(error instanceof FolderGuardError && error.code === "NOT_FOUND")) throw error;
        });
        this.known.delete(c.path);
      } else {
        await this.folder.write(c.path, c.before);
      }
    }
    this.checkpoints = this.checkpoints.filter((c) => c.id < id);
    return undo.length;
  }

  /**
   * The work as proposed changes against the snapshot, plus what can't be
   * proposed and why. The server checks all of it again.
   */
  async changes(): Promise<{ changes: ProposedChange[]; notProposed: { path: string; reason: string }[] }> {
    if (this.mode === "disk") await this.refresh();
    const changes: ProposedChange[] = [];
    const notProposed: { path: string; reason: string }[] = [];
    for (const path of this.files()) {
      let content: string;
      try {
        content = await this.read(path);
      } catch (error) {
        if (this.base.has(path) || this.reasons.has(path)) notProposed.push({ path, reason: error instanceof Error ? error.message : "It couldn't be read." });
        continue;
      }
      const sha256 = await sha256Hex(content);
      const base = this.base.get(path);
      if (base && base.sha256 === sha256) continue;
      const screened = screenFile(path, content, utf8Bytes(content), MAX_FILE_BYTES);
      if (!screened.ok) {
        notProposed.push({ path, reason: SKIP_LABELS[screened.reason] });
        continue;
      }
      changes.push({
        path,
        kind: base ? "edit" : "create",
        baseRevision: base?.revision ?? 0,
        content,
        sha256,
        reason: this.reasons.get(path) ?? "Changed by a command a person approved.",
      });
    }
    for (const b of this.base.values()) {
      if (!this.known.has(b.path) && checkAgentPath(b.path).ok) {
        notProposed.push({ path: b.path, reason: "Deleted. A change proposal can't delete files, so this is left out." });
      }
    }
    return { changes, notProposed };
  }
}
