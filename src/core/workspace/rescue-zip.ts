/**
 * Turning an uploaded .zip into project files for a rescue import (Phase D):
 * unpack it (./unzip.ts), drop the single top folder that GitHub and most
 * tools wrap a project in, then screen every file exactly as a folder import
 * does. Runs in the browser; the server screens the result again.
 */
import { screenFile, screenPath, type SkipReason } from "./files";
import { readZip, type ZipSkipReason } from "./unzip";

export type RescueSkipReason = SkipReason | ZipSkipReason;

export const ZIP_SKIP_LABELS: Record<ZipSkipReason, string> = {
  encrypted: "Encrypted in the zip",
  unsupported_method: "Packed in a way Farbaek can't read",
  too_large: "Too large",
  corrupt: "Damaged in the zip",
};

export interface RescueFiles {
  files: { path: string; content: string }[];
  /** UTF-8 bytes of the files kept. */
  bytes: number;
  /** Files left out and why. Dependency and build folders are counted, not listed. */
  skipped: { path: string; reason: RescueSkipReason }[];
  ignored: number;
}

/** The folder every path sits in, when they all share one (as in "my-app-main/src/…"). */
export function commonRoot(paths: readonly string[]): string | null {
  if (paths.length === 0) return null;
  const first = paths[0]!.split("/")[0]!;
  if (!paths.every((p) => p.includes("/") && p.split("/")[0] === first)) return null;
  return first;
}

export async function rescueFilesFromZip(data: Uint8Array, limits: { maxFileBytes: number; maxEntries?: number; maxTotalBytes?: number }): Promise<RescueFiles> {
  const out: RescueFiles = { files: [], bytes: 0, skipped: [], ignored: 0 };
  // Dependency and build folders stay packed: they can hold tens of thousands of files.
  const zip = await readZip(data, {
    ...limits,
    wanted: (path) => {
      const screened = screenPath(path.replace(/^[^/]+\//, ""));
      if (!screened.ok && screened.reason === "ignored_folder") {
        out.ignored++;
        return false;
      }
      return true;
    },
  });
  for (const s of zip.skipped) out.skipped.push(s);

  const root = commonRoot(zip.entries.map((e) => e.path));
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const seen = new Set<string>();
  for (const entry of zip.entries) {
    const path = root ? entry.path.slice(root.length + 1) : entry.path;
    let content: string;
    try {
      content = decoder.decode(entry.bytes);
    } catch {
      out.skipped.push({ path, reason: "binary" });
      continue;
    }
    const screened = screenFile(path, content, entry.bytes.length, limits.maxFileBytes);
    if (!screened.ok) {
      if (screened.reason === "ignored_folder") out.ignored++;
      else out.skipped.push({ path, reason: screened.reason });
      continue;
    }
    if (seen.has(screened.path)) continue;
    seen.add(screened.path);
    out.files.push({ path: screened.path, content });
    out.bytes += entry.bytes.length;
  }
  return out;
}
