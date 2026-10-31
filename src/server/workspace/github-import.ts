/**
 * GitHub import on the server (ADR 0074): downloads one repository's
 * archive, unpacks and screens it exactly like a rescue import, and makes a
 * project from it. The server fetches only GitHub's archive address and the
 * codeload.github.com address its redirect names, rebuilt from checked
 * parts, under a size cap and a time limit.
 *
 * A private repository (ADR 0144) is read with the workspace's own GitHub
 * token, only after the public download finds nothing and only when the
 * caller passes the token. The token goes to api.github.com alone; the
 * download link GitHub answers with carries its own short-lived token.
 *
 * Partial success is reported, not hidden: the project is kept when storing
 * its files fails.
 */
import { WORKSPACE_LIMITS } from "@/config/workspace";
import { apiArchiveFromRedirect, apiArchiveUrl, archiveFromRedirect, archiveUrl, commitFromArchive, safeRef, sourceLabel, type GitHubSource } from "@/core/workspace/github";
import { rescueFilesFromZip, type RescueFiles } from "@/core/workspace/rescue-zip";
import { ZipError } from "@/core/workspace/unzip";
import { GITHUB_MESSAGES as API_MESSAGES, type GitHubClient, type RepoInfo } from "@/server/github/client";
import { importProjectFiles, type FileDeps } from "./files";
import { createProject, type WriteDeps, type WriteResult } from "./use-cases";

/** The largest archive downloaded, the same as a rescue zip upload. */
export const GITHUB_ARCHIVE_BYTES = 60 * 1024 * 1024;
const TIMEOUT_MS = 45_000;
const HEADERS = { "user-agent": "Farbaek-import (+https://www.farbaek.com)" };

export const GITHUB_MESSAGES = {
  notFound: "Farbaek couldn't find that repository, branch or tag.",
  unexpected: "GitHub answered in a way Farbaek doesn't expect, so nothing was downloaded. Try again in a minute.",
  unavailable: "GitHub couldn't send this repository right now. Try again in a minute.",
  slow: "GitHub took too long to send this repository. Try again, or import a smaller one.",
  tooBig: `This repository's archive is larger than ${GITHUB_ARCHIVE_BYTES / 1024 / 1024} MB, more than Farbaek downloads in one import.`,
  tokenNotFound: "GitHub couldn't find that repository, branch or tag with the workspace's token. If the repository is private, add it under the token's Repository access on GitHub, with Contents: Read.",
  tokenRejected: "GitHub didn't accept the workspace's token. It may have expired or been revoked; an owner or admin can connect a new one in Settings.",
  tokenForbidden: "The workspace's token can't read this repository's contents. Give it Contents: Read for this repository on GitHub.",
  rateLimited: "GitHub's limit for the workspace's token has been reached. Try again in an hour.",
  badBranch: "Farbaek can't work with this repository's branch name yet.",
} as const;

/** The workspace's GitHub token, for a repository the public download can't find. */
export interface TokenAccess {
  token: string;
  client: Pick<GitHubClient, "repo">;
}

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

type Limits = { maxBytes: number; timeoutMs: number };
const LIMITS: Limits = { maxBytes: GITHUB_ARCHIVE_BYTES, timeoutMs: TIMEOUT_MS };

const failed = (e: unknown): Download => ({ ok: false, message: e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError") ? GITHUB_MESSAGES.slow : GITHUB_MESSAGES.unavailable });

/** The archive itself, from a codeload address already checked; no credentials are sent. */
async function fetchArchive(target: { url: string; commit: string | null }, fetcher: Fetcher, signal: AbortSignal, limits: Limits, notFound: string): Promise<Download> {
  const archive = await fetcher(target.url, { redirect: "error", signal, headers: HEADERS });
  if (archive.status === 404) {
    await archive.body?.cancel();
    return { ok: false, message: notFound };
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
}

export async function downloadArchive(source: GitHubSource, fetcher: Fetcher = fetch, limits = LIMITS): Promise<Download> {
  const signal = AbortSignal.timeout(limits.timeoutMs);
  try {
    const first = await fetcher(archiveUrl(source), { redirect: "manual", signal, headers: HEADERS });
    await first.body?.cancel();
    if (first.status === 404) return { ok: false, message: GITHUB_MESSAGES.notFound };
    if (first.status < 300 || first.status > 399) return { ok: false, message: first.status >= 500 || first.status === 429 ? GITHUB_MESSAGES.unavailable : GITHUB_MESSAGES.unexpected };
    const target = archiveFromRedirect(first.headers.get("location"), source);
    if (!target) return { ok: false, message: GITHUB_MESSAGES.unexpected };
    return await fetchArchive(target, fetcher, signal, limits, GITHUB_MESSAGES.notFound);
  } catch (e) {
    return failed(e);
  }
}

/**
 * One ref of a repository, read with the workspace's token (ADR 0144). The
 * token is sent to api.github.com only; GitHub answers with a codeload link
 * that is checked, then fetched without it.
 */
export async function downloadWithToken(repo: { owner: string; repo: string }, ref: string, token: string, fetcher: Fetcher = fetch, limits = LIMITS): Promise<Download> {
  const signal = AbortSignal.timeout(limits.timeoutMs);
  try {
    const first = await fetcher(apiArchiveUrl(repo.owner, repo.repo, ref), {
      redirect: "manual",
      signal,
      headers: { ...HEADERS, accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "x-github-api-version": "2022-11-28" },
    });
    await first.body?.cancel();
    if (first.status === 401) return { ok: false, message: GITHUB_MESSAGES.tokenRejected };
    if (first.status === 404) return { ok: false, message: GITHUB_MESSAGES.tokenNotFound };
    if (first.status === 429 || (first.status === 403 && first.headers.get("x-ratelimit-remaining") === "0")) return { ok: false, message: GITHUB_MESSAGES.rateLimited };
    if (first.status === 403) return { ok: false, message: GITHUB_MESSAGES.tokenForbidden };
    if (first.status < 300 || first.status > 399) return { ok: false, message: first.status >= 500 ? GITHUB_MESSAGES.unavailable : GITHUB_MESSAGES.unexpected };
    const target = apiArchiveFromRedirect(first.headers.get("location"), repo, ref);
    if (!target) return { ok: false, message: GITHUB_MESSAGES.unexpected };
    return await fetchArchive(target, fetcher, signal, limits, GITHUB_MESSAGES.tokenNotFound);
  } catch (e) {
    return failed(e);
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
  /** "token" when it was read with the workspace's token, with what GitHub said about the repository. */
  via: { kind: "public" } | { kind: "token"; repository: RepoInfo };
}

type Fetched = { ok: true; data: Uint8Array; commit: string | null; via: GitHubImportResult["via"] } | { ok: false; message: string };

/**
 * The public download first. Only when GitHub finds nothing there, and the
 * caller passed the workspace's token, is the repository read with it.
 * Without a token, `privateHint` says how a private one could be imported.
 */
async function fetchRepository(source: GitHubSource, withToken: TokenAccess | null, privateHint: string | null, fetcher?: Fetcher): Promise<Fetched> {
  const open = await downloadArchive(source, fetcher);
  if (open.ok) return { ...open, via: { kind: "public" } };
  if (open.message !== GITHUB_MESSAGES.notFound) return open;
  if (!withToken) return { ok: false, message: privateHint ? `${open.message} ${privateHint}` : open.message };

  const info = await withToken.client.repo(source.owner, source.repo);
  if (!info.ok) return { ok: false, message: info.code === "NOT_FOUND" ? GITHUB_MESSAGES.tokenNotFound : API_MESSAGES[info.code] };
  const ref = source.ref ?? info.value.defaultBranch;
  if (!safeRef(ref)) return { ok: false, message: GITHUB_MESSAGES.badBranch };
  // GitHub's own spelling of the names, so the redirect check compares like with like.
  const download = await downloadWithToken({ owner: info.value.owner, repo: info.value.repo }, ref, withToken.token, fetcher);
  return download.ok ? { ...download, via: { kind: "token", repository: info.value } } : download;
}

export async function importFromGitHub(
  deps: WriteDeps & FileDeps,
  input: { orgId: string; userId: string; source: GitHubSource; fetcher?: Fetcher; withToken?: TokenAccess | null; privateHint?: string | null },
): Promise<WriteResult<GitHubImportResult>> {
  const download = await fetchRepository(input.source, input.withToken ?? null, input.privateHint ?? null, input.fetcher);
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
      via: download.via,
    },
  };
}
