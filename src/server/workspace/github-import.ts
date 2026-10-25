/**
 * GitHub import on the server (ADR 0074): downloads one public repository's
 * archive, unpacks and screens it exactly like a rescue import, and makes a
 * project from it. The server fetches only GitHub's archive address and the
 * codeload.github.com address its redirect names, rebuilt from checked
 * parts, under a size cap and a time limit.
 *
 * Partial success is reported, not hidden: the project is kept when storing
 * its files fails.
 */
import { WORKSPACE_LIMITS } from "@/config/workspace";
import { archiveFromRedirect, archiveUrl, commitFromArchive, sourceLabel, type GitHubSource } from "@/core/workspace/github";
import { rescueFilesFromZip, type RescueFiles } from "@/core/workspace/rescue-zip";
import { ZipError } from "@/core/workspace/unzip";
import { importProjectFiles, type FileDeps } from "./files";
import { createProject, type WriteDeps, type WriteResult } from "./use-cases";

/** The largest archive downloaded, the same as a rescue zip upload. */
export const GITHUB_ARCHIVE_BYTES = 60 * 1024 * 1024;
const TIMEOUT_MS = 45_000;
const HEADERS = { "user-agent": "Farbaek-import (+https://www.farbaek.com)" };

export const GITHUB_MESSAGES = {
  notFound: "Farbaek couldn't find that repository, branch or tag. If it's private, Farbaek can't import it yet: only public repositories for now.",
  unexpected: "GitHub answered in a way Farbaek doesn't expect, so nothing was downloaded. Try again in a minute.",
  unavailable: "GitHub couldn't send this repository right now. Try again in a minute.",
  slow: "GitHub took too long to send this repository. Try again, or import a smaller one.",
  tooBig: `This repository's archive is larger than ${GITHUB_ARCHIVE_BYTES / 1024 / 1024} MB, more than Farbaek downloads in one import.`,
} as const;

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
export type Download = { ok: true; data: Uint8Array; commit: string | null } | { ok: false; message: string };

async function readCapped(body: ReadableStream<Uint8Array>, maxBytes: number): Promise<Uint8Array | null> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

export async function downloadArchive(source: GitHubSource, fetcher: Fetcher = fetch, limits = { maxBytes: GITHUB_ARCHIVE_BYTES, timeoutMs: TIMEOUT_MS }): Promise<Download> {
  const signal = AbortSignal.timeout(limits.timeoutMs);
  try {
    const first = await fetcher(archiveUrl(source), { redirect: "manual", signal, headers: HEADERS });
    await first.body?.cancel();
    if (first.status === 404) return { ok: false, message: GITHUB_MESSAGES.notFound };
    if (first.status < 300 || first.status > 399) return { ok: false, message: first.status >= 500 || first.status === 429 ? GITHUB_MESSAGES.unavailable : GITHUB_MESSAGES.unexpected };
    const target = archiveFromRedirect(first.headers.get("location"), source);
    if (!target) return { ok: false, message: GITHUB_MESSAGES.unexpected };

    const archive = await fetcher(target.url, { redirect: "error", signal, headers: HEADERS });
    if (archive.status === 404) {
      await archive.body?.cancel();
      return { ok: false, message: GITHUB_MESSAGES.notFound };
    }
    if (!archive.ok || !archive.body) {
      await archive.body?.cancel();
      return { ok: false, message: GITHUB_MESSAGES.unavailable };
    }
    if (Number(archive.headers.get("content-length") ?? 0) > limits.maxBytes) {
      await archive.body.cancel();
      return { ok: false, message: GITHUB_MESSAGES.tooBig };
    }
    const data = await readCapped(archive.body, limits.maxBytes);
    if (!data) return { ok: false, message: GITHUB_MESSAGES.tooBig };
    return { ok: true, data, commit: target.commit ?? commitFromArchive(data) };
  } catch (e) {
    return { ok: false, message: e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError") ? GITHUB_MESSAGES.slow : GITHUB_MESSAGES.unavailable };
  }
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** Why these files can't be imported in one go, or null when they can. */
export function importBlock(files: RescueFiles): string | null {
  if (files.files.length === 0) return "There are no text source files in this repository to import.";
  if (files.bytes > WORKSPACE_LIMITS.maxImportBytes)
    return `This repository has ${mb(files.bytes)} of source text. Farbaek imports up to ${mb(WORKSPACE_LIMITS.maxImportBytes)} at a time, so choose a smaller repository or a branch with less in it.`;
  if (files.files.length > WORKSPACE_LIMITS.maxProjectFiles)
    return `This repository has ${files.files.length.toLocaleString("en-US")} source files. A project holds up to ${WORKSPACE_LIMITS.maxProjectFiles.toLocaleString("en-US")}.`;
  return null;
}

export interface GitHubImportResult {
  projectId: string;
  commit: string | null;
  /** Files stored, or why none were. */
  imported: { files: number } | { error: string };
  /** Files left out by the screening (secrets, binaries, too large), and dependency or build files left packed. */
  skipped: number;
  ignored: number;
}

export async function importFromGitHub(
  deps: WriteDeps & FileDeps,
  input: { orgId: string; userId: string; source: GitHubSource; fetcher?: Fetcher },
): Promise<WriteResult<GitHubImportResult>> {
  const download = await downloadArchive(input.source, input.fetcher);
  if (!download.ok) return { ok: false, code: "NOTHING_TO_IMPORT", message: download.message };

  let files: RescueFiles;
  try {
    files = await rescueFilesFromZip(download.data, { maxFileBytes: WORKSPACE_LIMITS.maxFileBytes, maxEntries: 50_000 });
  } catch (e) {
    return { ok: false, code: "NOTHING_TO_IMPORT", message: e instanceof ZipError ? e.message : "This repository's archive couldn't be read." };
  }
  const blocked = importBlock(files);
  if (blocked) return { ok: false, code: files.files.length === 0 ? "NOTHING_TO_IMPORT" : "IMPORT_TOO_LARGE", message: blocked };

  const at = download.commit ? ` at ${download.commit.slice(0, 7)}` : "";
  const project = await createProject(deps, {
    orgId: input.orgId,
    userId: input.userId,
    name: input.source.repo.slice(0, 80),
    description: `Imported from ${sourceLabel(input.source)}${at}.`,
  });
  if (!project.ok) return project;

  // The server screens every file again on the way in, under the same limits.
  const stored = await importProjectFiles(deps, { orgId: input.orgId, userId: input.userId, projectId: project.value, files: files.files });
  return {
    ok: true,
    value: {
      projectId: project.value,
      commit: download.commit,
      imported: stored.ok ? { files: stored.value.created + stored.value.updated + stored.value.unchanged } : { error: stored.message },
      skipped: files.skipped.length,
      ignored: files.ignored,
    },
  };
}
