/**
 * Files a person picked in a browser, packed for Mesh (ADR 0096) exactly as
 * the Farbaek Agent packs a folder (src/agent-runtime/mesh/pack.ts): each
 * file's 4 MiB chunks hashed with BLAKE3 as it streams, names checked by the
 * agent's own rules, credentials files and secret-looking text left out
 * (detection isn't guaranteed), and the manifest's digest over its canonical
 * form. Nothing is read into memory whole.
 */
import { checkAgentPath } from "@/core/agent/paths";
import { CAPSULE_FORMAT, ChunkHasher, manifestDigest, type CapsuleFileEntry, type CapsuleManifest } from "@/core/mesh/capsule";
import { TRANSFER_LIMITS } from "@/core/mesh/protocol";
import { containsSecret, screenPath } from "@/core/workspace/files";

/** What a browser's File gives: enough to read it in pieces. */
export interface PickedFile {
  name: string;
  size: number;
  slice(start?: number, end?: number): { arrayBuffer(): Promise<ArrayBuffer> };
}

export type WebSkipReason = "invalid_path" | "secret_file" | "secret_content" | "too_large";

export interface WebPacked {
  name: string;
  manifest: CapsuleManifest;
  digest: string;
  /** Each manifest path's file, to read while sending. */
  sources: Map<string, PickedFile>;
}

export class WebPackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebPackError";
  }
}

const READ_PIECE = 1024 * 1024;
const SECRET_SCAN_BYTES = 1024 * 1024;
const strictUtf8 = new TextDecoder("utf-8", { fatal: true });

async function looksLikeSecret(file: PickedFile): Promise<boolean> {
  if (file.size > SECRET_SCAN_BYTES) return false;
  const bytes = new Uint8Array(await file.slice(0, file.size).arrayBuffer());
  if (bytes.includes(0)) return false;
  try {
    return containsSecret(strictUtf8.decode(bytes));
  } catch {
    return false;
  }
}

/** "photo.jpg" as "photo (2).jpg", or the next number not taken. */
function freeName(path: string, taken: ReadonlySet<string>): string {
  const dot = path.lastIndexOf(".");
  const [base, ext] = dot > 0 ? [path.slice(0, dot), path.slice(dot)] : [path, ""];
  for (let n = 2; ; n++) {
    const candidate = `${base} (${n})${ext}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/** BLAKE3 of each chunk and the whole file, reading it in 1 MiB pieces. */
export async function hashPicked(path: string, file: PickedFile): Promise<CapsuleFileEntry> {
  const hasher = new ChunkHasher();
  for (let at = 0; at < file.size; at += READ_PIECE) hasher.update(new Uint8Array(await file.slice(at, Math.min(file.size, at + READ_PIECE)).arrayBuffer()));
  const { bytes, blake3, chunks } = hasher.digest();
  return { path, bytes, blake3, chunks };
}

/** Packs picked files under a name, as one folder for the computer to save. */
export async function packPicked(files: readonly PickedFile[], name: string, onProgress?: (done: number) => void): Promise<WebPacked & { excluded: CapsuleManifest["excluded"] }> {
  const entries: CapsuleFileEntry[] = [];
  const excluded: { path: string; reason: WebSkipReason }[] = [];
  const sources = new Map<string, PickedFile>();
  const taken = new Set<string>();
  let total = 0;
  for (const file of files) {
    let path = file.name.normalize("NFC");
    if (!checkAgentPath(path).ok) {
      excluded.push({ path: path.slice(0, 300), reason: "invalid_path" });
      continue;
    }
    const screened = screenPath(path);
    if (!screened.ok && screened.reason !== "binary") {
      excluded.push({ path: path.slice(0, 300), reason: screened.reason === "secret_file" ? "secret_file" : "invalid_path" });
      continue;
    }
    if (file.size > TRANSFER_LIMITS.maxFileBytes) {
      excluded.push({ path: path.slice(0, 300), reason: "too_large" });
      continue;
    }
    if (await looksLikeSecret(file)) {
      excluded.push({ path: path.slice(0, 300), reason: "secret_content" });
      continue;
    }
    // Two picked files with the same name both go, the second as "name (2).ext". Windows ignores case, so this does too.
    if (taken.has(path.toLowerCase())) path = freeName(path, taken);
    taken.add(path.toLowerCase());
    if (entries.length >= TRANSFER_LIMITS.maxFiles) throw new WebPackError(`Choose at most ${TRANSFER_LIMITS.maxFiles.toLocaleString("en-US")} files at a time.`);
    total += file.size;
    if (total > TRANSFER_LIMITS.maxTotalBytes) throw new WebPackError("These files add up to more than 4 GB. Send fewer at a time.");
    entries.push(await hashPicked(path, file));
    sources.set(path, file);
    onProgress?.(entries.length);
  }
  if (entries.length === 0) throw new WebPackError("None of these files can be sent. Credentials files, secret-looking text and names a computer can't hold safely stay on this device.");
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const manifest: CapsuleManifest = {
    format: CAPSULE_FORMAT,
    id: globalThis.crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    source: { projectId: null, projectName: name.slice(0, 120) || "Files" },
    files: entries,
    excluded,
    totals: { files: entries.length, bytes: total },
  };
  return { name: manifest.source.projectName, manifest, digest: manifestDigest(manifest), sources, excluded };
}
