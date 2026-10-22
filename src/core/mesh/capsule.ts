/**
 * Workspace Capsules (spec §11, ADR 0037): a project packed to move between
 * workspaces and devices. A Capsule is a zip holding `capsule.json`, a
 * manifest with a BLAKE3 hash for every file and every 4 MiB chunk, and the
 * files under `files/`.
 *
 * Packing leaves out what must never travel: `.env` files, keys and
 * credentials, dependency and build folders, binary files, and content that
 * looks like a secret. Each one is listed with its reason. Detection is
 * pattern-based and not guaranteed, and the interface says so.
 *
 * Opening treats the Capsule as untrusted. Nothing in it is executed. Paths
 * are checked (traversal, absolute paths, NFC duplicates, case collisions),
 * archive limits apply, the manifest is schema-checked, and every byte is
 * hashed again before anything is written. Differences with an existing
 * project are decided by the person; nothing is overwritten silently.
 *
 * Pure: shared by the browser preview, the server and, later, the desktop
 * agent's nearby transfer (phase B).
 */
import { blake3 } from "@noble/hashes/blake3.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { z } from "zod";
import { canonicalize } from "@/core/trust/canonical-json";
import { checkPath, screenFile, screenPath, type SkipReason } from "@/core/workspace/files";
import { readZip, ZipError } from "@/core/workspace/unzip";
import { zipFiles } from "@/core/workspace/zip";

export const CAPSULE_FORMAT = "farbaek.capsule/1";
export const CHUNK_BYTES = 4 * 1024 * 1024;
const MANIFEST_NAME = "capsule.json";
const FILES_PREFIX = "files/";

const encoder = new TextEncoder();

/** BLAKE3 of some bytes, as 64 hex characters. */
export function blake3Hex(bytes: Uint8Array): string {
  return bytesToHex(blake3(bytes));
}

/** BLAKE3 of a text file's UTF-8 bytes. */
export function fileHash(content: string): string {
  return blake3Hex(encoder.encode(content));
}

const Hex64 = z.string().regex(/^[0-9a-f]{64}$/);

const ChunkSchema = z.object({ index: z.number().int().min(0), bytes: z.number().int().min(0), blake3: Hex64 });

const FileEntrySchema = z.object({
  path: z.string().min(1).max(300),
  bytes: z.number().int().min(0),
  blake3: Hex64,
  chunks: z.array(ChunkSchema).min(1).max(1024),
});

export const ManifestSchema = z.object({
  format: z.literal(CAPSULE_FORMAT),
  id: z.string().min(8).max(64),
  createdAt: z.iso.datetime(),
  source: z.object({
    projectId: z.string().max(64).nullable(),
    projectName: z.string().min(1).max(120),
  }),
  note: z.string().max(4000).optional(),
  files: z.array(FileEntrySchema).max(10_000),
  excluded: z.array(z.object({ path: z.string().max(300), reason: z.string().max(40) })).max(50_000),
  totals: z.object({ files: z.number().int().min(0), bytes: z.number().int().min(0) }),
});

export type CapsuleManifest = z.infer<typeof ManifestSchema>;
export type CapsuleFileEntry = z.infer<typeof FileEntrySchema>;
export interface CapsuleFile {
  path: string;
  content: string;
}

export interface CapsuleLimits {
  /** Largest single file. */
  maxFileBytes: number;
  /** Most files. */
  maxFiles: number;
  /** Most unpacked bytes across every file. */
  maxTotalBytes: number;
}

function entryFor(path: string, bytes: Uint8Array): CapsuleFileEntry {
  const chunks = [];
  for (let start = 0, index = 0; start < bytes.length || index === 0; start += CHUNK_BYTES, index += 1) {
    const part = bytes.subarray(start, Math.min(bytes.length, start + CHUNK_BYTES));
    chunks.push({ index, bytes: part.length, blake3: blake3Hex(part) });
    if (part.length === 0) break;
  }
  return { path, bytes: bytes.length, blake3: blake3Hex(bytes), chunks };
}

/** A Capsule's identity: BLAKE3 of the RFC 8785 canonical form of its manifest. */
export function manifestDigest(manifest: CapsuleManifest): string {
  return blake3Hex(encoder.encode(canonicalize(manifest)));
}

export interface BuiltCapsule {
  manifest: CapsuleManifest;
  files: CapsuleFile[];
  excluded: { path: string; reason: SkipReason }[];
}

/** Packs a project's files, leaving out what mustn't travel. Files are sorted, so the same project packs the same way. */
export function buildCapsule(input: {
  id: string;
  createdAt: string;
  projectId: string | null;
  projectName: string;
  note?: string;
  files: readonly CapsuleFile[];
  maxFileBytes: number;
}): BuiltCapsule {
  const files: CapsuleFile[] = [];
  const entries: CapsuleFileEntry[] = [];
  const excluded: BuiltCapsule["excluded"] = [];
  let total = 0;
  for (const file of [...input.files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    const bytes = encoder.encode(file.content);
    const screened = screenFile(file.path, file.content, bytes.length, input.maxFileBytes);
    if (!screened.ok) {
      excluded.push({ path: file.path.slice(0, 300), reason: screened.reason });
      continue;
    }
    files.push({ path: screened.path, content: file.content });
    entries.push(entryFor(screened.path, bytes));
    total += bytes.length;
  }
  const manifest: CapsuleManifest = {
    format: CAPSULE_FORMAT,
    id: input.id,
    createdAt: input.createdAt,
    source: { projectId: input.projectId, projectName: input.projectName.slice(0, 120) || "Untitled project" },
    ...(input.note ? { note: input.note.slice(0, 4000) } : {}),
    files: entries,
    excluded,
    totals: { files: entries.length, bytes: total },
  };
  return { manifest, files, excluded };
}

/** The Capsule file: `capsule.json` plus every file under `files/`. */
export function encodeCapsule(built: Pick<BuiltCapsule, "manifest" | "files">, modified = new Date()): Uint8Array<ArrayBuffer> {
  return zipFiles(
    [{ path: MANIFEST_NAME, content: JSON.stringify(built.manifest, null, 2) }, ...built.files.map((f) => ({ path: FILES_PREFIX + f.path, content: f.content }))],
    modified,
  );
}

export type OpenedCapsule =
  | { ok: true; manifest: CapsuleManifest; digest: string; files: CapsuleFile[] }
  | { ok: false; problems: string[] };

const decoder = new TextDecoder("utf-8", { fatal: true });

/**
 * Opens a Capsule as untrusted input. It fails closed: any problem rejects the
 * whole Capsule, and each problem is described in words a person can act on.
 */
export async function openCapsule(data: Uint8Array, limits: CapsuleLimits): Promise<OpenedCapsule> {
  let entries: { path: string; bytes: Uint8Array }[];
  try {
    const zip = await readZip(data, { maxFileBytes: limits.maxFileBytes, maxEntries: limits.maxFiles + 1, maxTotalBytes: limits.maxTotalBytes + 1024 * 1024 });
    if (zip.skipped.length > 0) {
      return { ok: false, problems: zip.skipped.slice(0, 20).map((s) => `${s.path.slice(0, 120)}: ${skipWords(s.reason)}`) };
    }
    entries = zip.entries;
  } catch (e) {
    if (e instanceof ZipError) return { ok: false, problems: [zipWords(e.code)] };
    return { ok: false, problems: ["This file couldn't be read as a Capsule."] };
  }

  const manifestEntry = entries.find((e) => e.path === MANIFEST_NAME);
  if (!manifestEntry) return { ok: false, problems: ["There's no capsule.json in this file, so it isn't a Farbaek Capsule."] };
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(decoder.decode(manifestEntry.bytes));
  } catch {
    return { ok: false, problems: ["capsule.json isn't valid JSON."] };
  }
  const parsed = ManifestSchema.safeParse(parsedJson);
  if (!parsed.success) return { ok: false, problems: ["capsule.json doesn't match the Capsule format (farbaek.capsule/1)."] };
  const manifest = parsed.data;

  const problems: string[] = [];
  if (manifest.files.length > limits.maxFiles) problems.push(`It holds ${manifest.files.length} files; the most a Capsule can hold is ${limits.maxFiles}.`);
  if (manifest.totals.files !== manifest.files.length) problems.push("The manifest's file count doesn't match its file list.");

  // Paths: each one checked as in any import, kept in NFC form, and unique even ignoring case.
  const byFolded = new Map<string, string>();
  for (const entry of manifest.files) {
    if (entry.path.normalize("NFC") !== entry.path) problems.push(`${entry.path}: the name isn't in normalised (NFC) form.`);
    const checked = checkPath(entry.path);
    if (!checked.ok || checked.path !== entry.path) {
      problems.push(`${entry.path.slice(0, 120)}: ${checked.ok ? "the path isn't in its plain form." : checked.reason}`);
      continue;
    }
    const screened = screenPath(entry.path);
    if (!screened.ok) problems.push(`${entry.path}: ${reasonWords(screened.reason)} files can't be in a Capsule.`);
    const folded = entry.path.toLowerCase();
    const other = byFolded.get(folded);
    if (other !== undefined) problems.push(other === entry.path ? `${entry.path} is listed twice.` : `${entry.path} and ${other} differ only in capital letters.`);
    byFolded.set(folded, entry.path);
  }

  // The archive must hold exactly the manifest and the files it lists.
  const listed = new Set(manifest.files.map((f) => f.path));
  const byPath = new Map<string, Uint8Array>();
  for (const entry of entries) {
    if (entry.path === MANIFEST_NAME) continue;
    if (!entry.path.startsWith(FILES_PREFIX) || !listed.has(entry.path.slice(FILES_PREFIX.length))) {
      problems.push(`${entry.path.slice(0, 120)} is in the file but not in the manifest.`);
      continue;
    }
    byPath.set(entry.path.slice(FILES_PREFIX.length), entry.bytes);
  }

  // Every byte hashed again: whole files, then each chunk.
  const files: CapsuleFile[] = [];
  let total = 0;
  for (const entry of manifest.files) {
    const bytes = byPath.get(entry.path);
    if (!bytes) {
      problems.push(`${entry.path} is in the manifest but missing from the file.`);
      continue;
    }
    total += bytes.length;
    if (bytes.length !== entry.bytes || blake3Hex(bytes) !== entry.blake3 || !chunksMatch(bytes, entry)) {
      problems.push(`${entry.path} changed after the Capsule was made: its BLAKE3 hash doesn't match.`);
      continue;
    }
    let content: string;
    try {
      content = decoder.decode(bytes);
    } catch {
      problems.push(`${entry.path} isn't a text file.`);
      continue;
    }
    const screened = screenFile(entry.path, content, bytes.length, limits.maxFileBytes);
    if (!screened.ok) {
      problems.push(`${entry.path}: ${reasonWords(screened.reason)}.`);
      continue;
    }
    files.push({ path: entry.path, content });
  }
  if (total > limits.maxTotalBytes) problems.push("The files add up to more than a Capsule may hold.");
  if (total !== manifest.totals.bytes) problems.push("The manifest's byte count doesn't match its files.");

  if (problems.length > 0) return { ok: false, problems: problems.slice(0, 50) };
  return { ok: true, manifest, digest: manifestDigest(manifest), files };
}

function chunksMatch(bytes: Uint8Array, entry: CapsuleFileEntry): boolean {
  const expected = entryFor(entry.path, bytes).chunks;
  return expected.length === entry.chunks.length && expected.every((c, i) => c.index === entry.chunks[i]!.index && c.bytes === entry.chunks[i]!.bytes && c.blake3 === entry.chunks[i]!.blake3);
}

export type ImportChoice = "take" | "keep_mine" | "keep_both" | "skip";

export interface PlannedFile {
  path: string;
  status: "new" | "unchanged" | "differs";
  /** What happens unless the person changes it. Never an overwrite. */
  choice: ImportChoice;
}

/** Compares a Capsule with the destination project's current files, by BLAKE3. */
export function planImport(manifest: Pick<CapsuleManifest, "files">, current: readonly { path: string; blake3: string }[]): PlannedFile[] {
  const now = new Map(current.map((f) => [f.path, f.blake3]));
  return manifest.files.map((f) => {
    const mine = now.get(f.path);
    if (mine === undefined) return { path: f.path, status: "new", choice: "take" };
    if (mine === f.blake3) return { path: f.path, status: "unchanged", choice: "skip" };
    return { path: f.path, status: "differs", choice: "keep_mine" };
  });
}

/** "src/app.ts" becomes "src/app.capsule.ts", numbered if that's taken too. */
export function capsuleCopyPath(path: string, taken: ReadonlySet<string>): string {
  const slash = path.lastIndexOf("/");
  const dir = path.slice(0, slash + 1);
  const name = path.slice(slash + 1);
  const dot = name.lastIndexOf(".");
  const [base, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  for (let n = 1; n < 1000; n += 1) {
    const candidate = `${dir}${base}.capsule${n === 1 ? "" : `-${n}`}${ext}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${dir}${base}.capsule-${Date.now()}${ext}`;
}

/** The files to write for the person's choices. Choices for paths the plan doesn't know are ignored. */
export function filesToWrite(files: readonly CapsuleFile[], plan: readonly PlannedFile[], choices: Readonly<Record<string, ImportChoice>>, existing: readonly string[]): CapsuleFile[] {
  const planned = new Map(plan.map((p) => [p.path, p]));
  const taken = new Set([...existing, ...files.map((f) => f.path)]);
  const out: CapsuleFile[] = [];
  for (const file of files) {
    const p = planned.get(file.path);
    if (!p) continue;
    const choice = choices[file.path] ?? p.choice;
    if (p.status === "unchanged" || choice === "skip" || choice === "keep_mine") continue;
    if (choice === "keep_both" && p.status === "differs") {
      const copy = capsuleCopyPath(file.path, taken);
      taken.add(copy);
      out.push({ path: copy, content: file.content });
    } else if (choice === "take" || choice === "keep_both") {
      out.push(file);
    }
  }
  return out;
}

const REASON_WORDS: Record<SkipReason, string> = {
  invalid_path: "the path isn't allowed",
  ignored_folder: "dependency and build",
  secret_file: "credentials",
  secret_content: "it contains what looks like a secret",
  binary: "it isn't a text file",
  too_large: "it's too large",
};

function reasonWords(reason: SkipReason): string {
  return REASON_WORDS[reason];
}

function skipWords(reason: string): string {
  if (reason === "encrypted") return "encrypted entries aren't allowed";
  if (reason === "too_large") return "too large";
  if (reason === "unsupported_method") return "packed in a way Farbaek doesn't read";
  return "damaged";
}

function zipWords(code: ZipError["code"]): string {
  if (code === "not_zip") return "This isn't a Capsule file (it isn't a zip archive).";
  if (code === "zip64") return "This Capsule uses a zip format too large to open here.";
  if (code === "too_many_entries") return "This Capsule lists more files than allowed.";
  return "This Capsule unpacks to more than allowed. It may be a zip bomb.";
}
