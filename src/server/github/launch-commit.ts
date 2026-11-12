/**
 * The commit Render and Railway build from (ADR 0191): exactly the files a
 * launch was authorized for, as one commit on a branch Farbaek owns in the
 * project's linked repository. The default branch is never touched, and the
 * launch branch moves only from the commit Farbaek left it at. The tree is
 * read back and compared with the files before anything is deployed.
 */
import { createHash } from "node:crypto";
import { LAUNCH_BRANCH } from "@/core/launch/servers";
import { GITHUB_MESSAGES, type GitHubErrorCode } from "./client";

const API = "https://api.github.com";
const TIMEOUT_MS = 20_000;
/** Text sent inline in one tree request, at most; larger launches build the tree in steps. */
const TREE_BATCH_BYTES = 2 * 1024 * 1024;

export type LaunchCommitResult = { ok: true; commit: string } | { ok: false; message: string };

export interface LaunchCommitFile {
  path: string;
  /** Text, or an image's bytes in base64 (ADR 0108). */
  content: string;
  encoding?: "base64";
}

/** Git's own id for a file: SHA-1 of "blob <size>\0" and its bytes. */
export function gitBlobId(bytes: Buffer): string {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

const bytesOf = (f: LaunchCommitFile) => (f.encoding === "base64" ? Buffer.from(f.content, "base64") : Buffer.from(f.content, "utf8"));
const SHA = /^[0-9a-f]{40}$/;

type Call = { ok: true; status: number; json: unknown } | { ok: false; code: GitHubErrorCode };

export function createLaunchGitHub(token: string, fetcher: typeof fetch = fetch, timeoutMs = TIMEOUT_MS) {
  async function call(method: "GET" | "POST" | "PATCH", path: string, body?: unknown): Promise<Call> {
    let res: Response;
    try {
      res = await fetcher(`${API}${path}`, {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${token}`,
          "x-github-api-version": "2022-11-28",
          "user-agent": "Farbaek",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      return { ok: false, code: "UNREACHABLE" };
    }
    const json: unknown = await res.json().catch(() => null);
    if (res.ok) return { ok: true, status: res.status, json };
    if (res.status === 401) return { ok: false, code: "TOKEN_REJECTED" };
    if (res.status === 429 || (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0")) return { ok: false, code: "RATE_LIMITED" };
    if (res.status === 403) return { ok: false, code: "FORBIDDEN" };
    if (res.status === 404) return { ok: false, code: "NOT_FOUND" };
    if (res.status === 409) return { ok: false, code: "EMPTY_REPO" };
    if (res.status === 422) return { ok: false, code: "INVALID" };
    return { ok: false, code: "UNEXPECTED" };
  }
  return { call };
}

export type LaunchGitHub = ReturnType<typeof createLaunchGitHub>;

const repoPath = (owner: string, repo: string) => `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
const fail = (code: GitHubErrorCode): LaunchCommitResult => ({ ok: false, message: `GitHub: ${GITHUB_MESSAGES[code]}` });
const shaOf = (json: unknown, ...keys: string[]): string | null => {
  let v: unknown = json;
  for (const k of keys) v = v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined;
  return typeof v === "string" && SHA.test(v) ? v : null;
};

/**
 * Writes the files as one commit on the launch branch and returns its id.
 * `previous` holds the commits Farbaek recorded for this project's launches,
 * newest first: the branch moves only from one of them, or is made when it
 * doesn't exist. `onCommit` records the new commit before the branch moves,
 * so a move whose answer is lost can't leave the branch somewhere unrecorded.
 */
export async function pushLaunchCommit(
  gh: LaunchGitHub,
  input: { owner: string; repo: string; files: readonly LaunchCommitFile[]; message: string; previous: readonly string[]; onCommit?: (commit: string) => Promise<boolean> },
): Promise<LaunchCommitResult> {
  const base = repoPath(input.owner, input.repo);
  const branch = LAUNCH_BRANCH.split("/").map(encodeURIComponent).join("/");

  // Where the branch is now: missing, where Farbaek left it, or moved by someone else.
  const ref = await gh.call("GET", `${base}/git/ref/heads/${branch}`);
  let head: string | null = null;
  if (ref.ok) head = shaOf(ref.json, "object", "sha");
  else if (ref.code !== "NOT_FOUND") return fail(ref.code);
  if (head && !input.previous.includes(head)) {
    return {
      ok: false,
      message: `The ${LAUNCH_BRANCH} branch on GitHub isn't where Farbaek's last launch left it, so Farbaek won't move it. If nobody needs what's on it, delete the branch on GitHub and launch again.`,
    };
  }

  // A fresh tree of exactly these files: text inline, images as blobs, in steps that each stay small.
  const expected = new Map<string, string>();
  const entries: { path: string; mode: "100644"; type: "blob"; content?: string; sha?: string }[] = [];
  for (const f of input.files) {
    const bytes = bytesOf(f);
    expected.set(f.path, gitBlobId(bytes));
    if (f.encoding === "base64") {
      const blob = await gh.call("POST", `${base}/git/blobs`, { content: f.content, encoding: "base64" });
      if (!blob.ok) return fail(blob.code);
      const sha = shaOf(blob.json, "sha");
      if (!sha) return fail("UNEXPECTED");
      entries.push({ path: f.path, mode: "100644", type: "blob", sha });
    } else {
      entries.push({ path: f.path, mode: "100644", type: "blob", content: f.content });
    }
  }
  let tree: string | null = null;
  for (let start = 0; start < entries.length; ) {
    const batch: typeof entries = [];
    let size = 0;
    while (start < entries.length && (batch.length === 0 || size + (entries[start]!.content?.length ?? 0) <= TREE_BATCH_BYTES)) {
      size += entries[start]!.content?.length ?? 0;
      batch.push(entries[start]!);
      start += 1;
    }
    const made = await gh.call("POST", `${base}/git/trees`, tree ? { base_tree: tree, tree: batch } : { tree: batch });
    if (!made.ok) return fail(made.code);
    tree = shaOf(made.json, "sha");
    if (!tree) return fail("UNEXPECTED");
  }
  if (!tree) return { ok: false, message: "This project has no files to launch." };

  // Read the tree back: it must hold exactly these files, with exactly these bytes.
  const read = await gh.call("GET", `${base}/git/trees/${tree}?recursive=1`);
  if (!read.ok) return fail(read.code);
  const listed = (read.json as { tree?: unknown; truncated?: unknown } | null) ?? {};
  if (listed.truncated === true || !Array.isArray(listed.tree)) return { ok: false, message: "GitHub couldn't list the launch commit's files in full, so nothing was deployed. Try again." };
  const blobs = (listed.tree as { path?: unknown; type?: unknown; sha?: unknown }[]).filter((e) => e.type === "blob");
  const same = blobs.length === expected.size && blobs.every((e) => typeof e.path === "string" && expected.get(e.path) === e.sha);
  if (!same) return { ok: false, message: "The commit GitHub made doesn't hold exactly the project's files, so nothing was deployed. Try again." };

  const commit = await gh.call("POST", `${base}/git/commits`, { message: input.message, tree, parents: head ? [head] : [] });
  if (!commit.ok) return fail(commit.code);
  const id = shaOf(commit.json, "sha");
  if (!id) return fail("UNEXPECTED");
  if (input.onCommit && !(await input.onCommit(id))) return { ok: false, message: "The launch commit couldn't be recorded, so the branch wasn't moved. Launch again." };

  // Move the branch: a fast-forward from exactly where it was, so a push that landed meanwhile is refused, or make it.
  const moved = head
    ? await gh.call("PATCH", `${base}/git/refs/heads/${branch}`, { sha: id, force: false })
    : await gh.call("POST", `${base}/git/refs`, { ref: `refs/heads/${LAUNCH_BRANCH}`, sha: id });
  if (!moved.ok) return fail(moved.code);
  return { ok: true, commit: id };
}
