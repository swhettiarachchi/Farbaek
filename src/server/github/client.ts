/**
 * The few GitHub REST calls Farbaek makes with a workspace's token (ADR 0126).
 * Only https://api.github.com, with every path segment built from checked
 * names and encoded. Errors come back as codes with plain messages; neither
 * ever contains the token.
 */
import { pullStateFrom, type PullState } from "@/core/github/pull-request";

const API = "https://api.github.com";
const TIMEOUT_MS = 15_000;

export type GitHubErrorCode = "TOKEN_REJECTED" | "FORBIDDEN" | "NOT_FOUND" | "EMPTY_REPO" | "BRANCH_EXISTS" | "INVALID" | "RATE_LIMITED" | "UNREACHABLE" | "UNEXPECTED";
export type GitHubResult<T> = { ok: true; value: T } | { ok: false; code: GitHubErrorCode; detail: string | null };

export const GITHUB_MESSAGES: Record<GitHubErrorCode, string> = {
  TOKEN_REJECTED: "GitHub didn't accept the workspace's token. It may have expired or been revoked; an owner or admin can connect a new one in Settings.",
  FORBIDDEN: "The token isn't allowed to do this. Give it Contents, Pull requests and Commit statuses: Read and write, for this repository.",
  NOT_FOUND: "GitHub couldn't find it, or the token hasn't been given this repository.",
  EMPTY_REPO: "This repository is empty. Add a first commit on GitHub, then try again.",
  BRANCH_EXISTS: "That branch already exists on GitHub.",
  INVALID: "GitHub refused the request.",
  RATE_LIMITED: "GitHub's limit for this token has been reached. Try again in an hour.",
  UNREACHABLE: "Farbaek couldn't reach GitHub. Try again in a minute.",
  UNEXPECTED: "GitHub answered in a way Farbaek didn't expect. Nothing was changed by Farbaek after that.",
};

/** Encodes each segment of a repository path, keeping the slashes between them. */
const segments = (path: string) => path.split("/").map(encodeURIComponent).join("/");

/** GitHub's "YYYY-MM-DD HH:MM:SS UTC" expiry header, as an ISO time; null when absent or unreadable. */
export function tokenExpiry(header: string | null): string | null {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) UTC$/.exec(header?.trim() ?? "");
  if (!m) return null;
  const at = new Date(`${m[1]}T${m[2]}Z`);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

export interface RepoInfo {
  id: number;
  owner: string;
  repo: string;
  defaultBranch: string;
  archived: boolean;
  canPush: boolean;
}

export interface GitHubClient {
  user(): Promise<GitHubResult<{ login: string; expiresAt: string | null }>>;
  repo(owner: string, repo: string): Promise<GitHubResult<RepoInfo>>;
  branchHead(owner: string, repo: string, branch: string): Promise<GitHubResult<{ commit: string; tree: string }>>;
  /** The blob id of a file at a commit; null when nothing is there; "not-a-file" for a folder, link or submodule. */
  blobSha(owner: string, repo: string, path: string, ref: string): Promise<GitHubResult<string | null>>;
  createBlob(owner: string, repo: string, content: string): Promise<GitHubResult<string>>;
  createTree(owner: string, repo: string, baseTree: string, files: { path: string; sha: string }[]): Promise<GitHubResult<string>>;
  createCommit(owner: string, repo: string, input: { message: string; tree: string; parent: string }): Promise<GitHubResult<string>>;
  createBranch(owner: string, repo: string, branch: string, commit: string): Promise<GitHubResult<null>>;
  openPull(owner: string, repo: string, input: { title: string; body: string; head: string; base: string }): Promise<GitHubResult<{ number: number; url: string }>>;
  postStatus(owner: string, repo: string, commit: string, input: { state: "success" | "failure" | "pending"; description: string; context: string; targetUrl: string }): Promise<GitHubResult<null>>;
  /** Where a pull request stands now (ADR 0143). */
  pull(owner: string, repo: string, number: number): Promise<GitHubResult<{ state: PullState; mergedAt: string | null; headSha: string | null }>>;
  /** The check runs GitHub has for a commit. Needs the token's Checks read access. */
  checkRuns(owner: string, repo: string, commit: string): Promise<GitHubResult<{ name: string; status: string | null; conclusion: string | null }[]>>;
}

type Fetcher = typeof fetch;

export function createGitHubClient(token: string, fetcher: Fetcher = fetch, timeoutMs = TIMEOUT_MS): GitHubClient {
  async function call(method: "GET" | "POST", path: string, body?: unknown): Promise<GitHubResult<{ status: number; json: unknown; headers: Headers }>> {
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
      return { ok: false, code: "UNREACHABLE", detail: null };
    }
    const json: unknown = await res.json().catch(() => null);
    if (res.ok) return { ok: true, value: { status: res.status, json, headers: res.headers } };
    // GitHub's own message helps with a refusal; it never holds the token, but is clipped all the same.
    const said = typeof (json as { message?: unknown } | null)?.message === "string" ? String((json as { message: string }).message).slice(0, 200) : null;
    if (res.status === 401) return { ok: false, code: "TOKEN_REJECTED", detail: null };
    if ((res.status === 403 || res.status === 429) && (res.headers.get("x-ratelimit-remaining") === "0" || res.status === 429)) return { ok: false, code: "RATE_LIMITED", detail: null };
    if (res.status === 403) return { ok: false, code: "FORBIDDEN", detail: said };
    if (res.status === 404) return { ok: false, code: "NOT_FOUND", detail: null };
    if (res.status === 409) return { ok: false, code: "EMPTY_REPO", detail: said };
    if (res.status === 422) return { ok: false, code: /already exists/i.test(said ?? "") ? "BRANCH_EXISTS" : "INVALID", detail: said };
    return { ok: false, code: "UNEXPECTED", detail: `HTTP ${res.status}` };
  }

  const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
  const sha = (v: unknown) => (typeof v === "string" && /^[0-9a-f]{40}$/.test(v) ? v : null);
  const unexpected = { ok: false as const, code: "UNEXPECTED" as const, detail: null };
  const repoPath = (owner: string, repo: string) => `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  return {
    async user() {
      const r = await call("GET", "/user");
      if (!r.ok) return r;
      const login = str((r.value.json as { login?: unknown })?.login);
      return login ? { ok: true, value: { login, expiresAt: tokenExpiry(r.value.headers.get("github-authentication-token-expiration")) } } : unexpected;
    },
    async repo(owner, repo) {
      const r = await call("GET", repoPath(owner, repo));
      if (!r.ok) return r;
      const j = r.value.json as { id?: unknown; name?: unknown; owner?: { login?: unknown }; default_branch?: unknown; archived?: unknown; permissions?: { push?: unknown } } | null;
      const id = typeof j?.id === "number" && Number.isSafeInteger(j.id) ? j.id : null;
      const name = str(j?.name);
      const login = str(j?.owner?.login);
      const branch = str(j?.default_branch);
      if (!id || !name || !login || !branch) return unexpected;
      return { ok: true, value: { id, owner: login, repo: name, defaultBranch: branch, archived: j?.archived === true, canPush: j?.permissions?.push === true } };
    },
    async branchHead(owner, repo, branch) {
      const ref = await call("GET", `${repoPath(owner, repo)}/git/ref/heads/${segments(branch)}`);
      if (!ref.ok) return ref;
      const commit = sha((ref.value.json as { object?: { sha?: unknown } })?.object?.sha);
      if (!commit) return unexpected;
      const c = await call("GET", `${repoPath(owner, repo)}/git/commits/${commit}`);
      if (!c.ok) return c;
      const tree = sha((c.value.json as { tree?: { sha?: unknown } })?.tree?.sha);
      return tree ? { ok: true, value: { commit, tree } } : unexpected;
    },
    async blobSha(owner, repo, path, ref) {
      const r = await call("GET", `${repoPath(owner, repo)}/contents/${segments(path)}?ref=${encodeURIComponent(ref)}`);
      if (!r.ok) return r.code === "NOT_FOUND" ? { ok: true, value: null } : r;
      const j = r.value.json as { type?: unknown; sha?: unknown } | unknown[];
      if (Array.isArray(j) || (j as { type?: unknown })?.type !== "file") return { ok: true, value: "not-a-file" };
      const s = sha((j as { sha?: unknown }).sha);
      return s ? { ok: true, value: s } : unexpected;
    },
    async createBlob(owner, repo, content) {
      const r = await call("POST", `${repoPath(owner, repo)}/git/blobs`, { content: Buffer.from(content, "utf8").toString("base64"), encoding: "base64" });
      if (!r.ok) return r;
      const s = sha((r.value.json as { sha?: unknown })?.sha);
      return s ? { ok: true, value: s } : unexpected;
    },
    async createTree(owner, repo, baseTree, files) {
      const r = await call("POST", `${repoPath(owner, repo)}/git/trees`, { base_tree: baseTree, tree: files.map((f) => ({ path: f.path, mode: "100644", type: "blob", sha: f.sha })) });
      if (!r.ok) return r;
      const s = sha((r.value.json as { sha?: unknown })?.sha);
      return s ? { ok: true, value: s } : unexpected;
    },
    async createCommit(owner, repo, input) {
      const r = await call("POST", `${repoPath(owner, repo)}/git/commits`, { message: input.message, tree: input.tree, parents: [input.parent] });
      if (!r.ok) return r;
      const s = sha((r.value.json as { sha?: unknown })?.sha);
      return s ? { ok: true, value: s } : unexpected;
    },
    async createBranch(owner, repo, branch, commit) {
      const r = await call("POST", `${repoPath(owner, repo)}/git/refs`, { ref: `refs/heads/${branch}`, sha: commit });
      return r.ok ? { ok: true, value: null } : r;
    },
    async openPull(owner, repo, input) {
      const r = await call("POST", `${repoPath(owner, repo)}/pulls`, { title: input.title, body: input.body, head: input.head, base: input.base, maintainer_can_modify: true });
      if (!r.ok) return r;
      const j = r.value.json as { number?: unknown; html_url?: unknown } | null;
      const number = typeof j?.number === "number" && Number.isSafeInteger(j.number) && j.number > 0 ? j.number : null;
      const url = pullUrl(str(j?.html_url), owner, repo, number);
      return number && url ? { ok: true, value: { number, url } } : unexpected;
    },
    async postStatus(owner, repo, commit, input) {
      const r = await call("POST", `${repoPath(owner, repo)}/statuses/${commit}`, { state: input.state, description: input.description.slice(0, 140), context: input.context, target_url: input.targetUrl });
      return r.ok ? { ok: true, value: null } : r;
    },
    async pull(owner, repo, number) {
      const r = await call("GET", `${repoPath(owner, repo)}/pulls/${number}`);
      if (!r.ok) return r;
      const j = (r.value.json ?? {}) as { state?: unknown; merged?: unknown; merged_at?: unknown; head?: { sha?: unknown } };
      const state = pullStateFrom(j);
      return state ? { ok: true, value: { ...state, headSha: sha(j.head?.sha) } } : unexpected;
    },
    async checkRuns(owner, repo, commit) {
      const r = await call("GET", `${repoPath(owner, repo)}/commits/${commit}/check-runs?per_page=50`);
      if (!r.ok) return r;
      const runs = (r.value.json as { check_runs?: unknown } | null)?.check_runs;
      if (!Array.isArray(runs)) return unexpected;
      return {
        ok: true,
        value: runs.flatMap((c: { name?: unknown; status?: unknown; conclusion?: unknown }) => (typeof c?.name === "string" ? [{ name: c.name, status: str(c.status), conclusion: str(c.conclusion) }] : [])),
      };
    },
  };
}

/** A pull request's address, only on github.com and only for this repository and number. */
export function pullUrl(raw: string | null, owner: string, repo: string, number: number | null): string | null {
  if (!raw || !number) return null;
  const expected = `https://github.com/${owner}/${repo}/pull/${number}`;
  return raw.toLowerCase() === expected.toLowerCase() ? expected : null;
}
