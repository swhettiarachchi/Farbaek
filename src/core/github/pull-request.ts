/**
 * A workspace's pull requests on GitHub (ADR 0126): the rules that don't need
 * a network. Which token Farbaek accepts, how a branch is named, which files
 * a pull request may hold, and what the "Farbaek ProofPack" status says.
 */
import { OWNER, REPO } from "@/core/workspace/github";

/** The status context GitHub shows on the commit Farbaek made. */
export const STATUS_CONTEXT = "Farbaek ProofPack";

/**
 * GitHub's form for a new fine-grained token, filled in with what Farbaek
 * needs (GitHub's docs, "Pre-filling fine-grained personal access token
 * details using URL parameters"). The person still picks the repositories.
 */
export const TOKEN_CREATION_URL =
  "https://github.com/settings/personal-access-tokens/new?" +
  new URLSearchParams({
    name: "Farbaek",
    description: "Lets Farbaek open pull requests and post the Farbaek ProofPack status on the repositories you choose.",
    expires_in: "90",
    contents: "write",
    pull_requests: "write",
    statuses: "write",
  }).toString();

/**
 * Fine-grained tokens only: they reach just the repositories their owner
 * picked. Classic tokens reach every repository the person can, so they're
 * refused.
 */
export function isFineGrainedToken(token: string): boolean {
  return /^github_pat_[A-Za-z0-9_]{40,250}$/.test(token);
}

/** The token's last four characters, so people can tell tokens apart. */
export function tokenHint(token: string): string {
  return token.slice(-4).replace(/[^A-Za-z0-9]/g, "x").padStart(4, "x");
}

export interface RepoName {
  owner: string;
  repo: string;
}

/** Reads "owner/repo" or a github.com address. Null for anything else. */
export function parseRepoName(input: string): RepoName | null {
  const text = input
    .trim()
    .replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "");
  const [owner = "", repo = "", ...rest] = text.split("/");
  if (rest.length || !OWNER.test(owner) || !REPO.test(repo) || repo === "." || repo === "..") return null;
  return { owner, repo };
}

/** The repository a project was imported from, read from the description the import wrote. */
export function importedRepo(description: string | null | undefined): RepoName | null {
  const m = /Imported from github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\/tree\/|\s|\.\s|\.$|$)/.exec(description ?? "");
  return m ? parseRepoName(`${m[1]}/${m[2]}`) : null;
}

/**
 * The branch a change goes on: its task's title, shortened, and the change's
 * id, so two changes never share a branch.
 */
export function branchName(taskTitle: string, proposalId: string): string {
  const slug = taskTitle
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  const id = proposalId.replace(/[^0-9a-f]/gi, "").slice(0, 8).toLowerCase();
  return `farbaek/${slug ? `${slug}-` : ""}${id || "change"}`;
}

/**
 * Git's own id for a file's content: SHA-1 of "blob <bytes>\0" and the bytes.
 * Comparing it with GitHub's tells whether a file there is exactly a version
 * Farbaek knows, without downloading it.
 */
export async function gitBlobSha(content: string): Promise<string> {
  const body = new TextEncoder().encode(content);
  const head = new TextEncoder().encode(`blob ${body.length}\0`);
  const all = new Uint8Array(head.length + body.length);
  all.set(head);
  all.set(body, head.length);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-1", all));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface ChangedFile {
  path: string;
  /** The content the change started from; null when it created the file. */
  before: string | null;
  after: string;
}

export type FilePlan =
  | { ok: true; files: ChangedFile[] }
  | { ok: false; reason: "already_there" }
  | { ok: false; reason: "conflict"; paths: string[] };

/**
 * Which files a pull request may hold, given each one's blob id on the base
 * branch (null when it isn't there). A file goes in only when GitHub has the
 * exact version the change started from, so nothing on GitHub is overwritten.
 * When GitHub already has every file as the change left it, there's nothing
 * to open.
 */
export async function planFiles(files: ChangedFile[], remote: Record<string, string | null>): Promise<FilePlan> {
  const conflicts: string[] = [];
  let already = 0;
  for (const f of files) {
    const there = remote[f.path] ?? null;
    if (there !== null && there === (await gitBlobSha(f.after))) {
      already += 1;
      continue;
    }
    const expected = f.before === null ? null : await gitBlobSha(f.before);
    if (there !== expected) conflicts.push(f.path);
  }
  if (conflicts.length) return { ok: false, reason: "conflict", paths: conflicts };
  if (already === files.length) return { ok: false, reason: "already_there" };
  return { ok: true, files };
}

export type ProofStatus = "verified" | "partially_verified" | "unverified" | "failed";
export type CommitState = "success" | "failure" | "pending";

/**
 * What the status on GitHub says, from the change's latest ProofPack. Only a
 * verified one passes; a partly verified one doesn't, since some required
 * check never ran.
 */
export function statusFor(proof: ProofStatus | null): { state: CommitState; description: string } {
  switch (proof) {
    case "verified":
      return { state: "success", description: "ProofPack verified: every required check passed." };
    case "failed":
      return { state: "failure", description: "Checks failed. See the task in Farbaek." };
    case "partially_verified":
      return { state: "failure", description: "Only partly verified: not every required check ran." };
    default:
      return { state: "pending", description: "Not verified yet. Run the checks in Farbaek." };
  }
}

/** The pull request's description: what changed, under which contract, and who opened it. */
export function pullRequestBody(input: {
  summary: string;
  paths: string[];
  contract: { version: number; sha256: string };
  proofPackDigest: string | null;
  taskUrl: string;
  workspace: string;
  login: string;
}): string {
  const files = input.paths.slice(0, 50).map((p) => `- \`${p.replace(/`/g, "")}\``);
  if (input.paths.length > 50) files.push(`- and ${input.paths.length - 50} more`);
  return [
    input.summary.trim().slice(0, 2000),
    "",
    "**Files**",
    ...files,
    "",
    `**Contract** version ${input.contract.version}, \`${input.contract.sha256}\``,
    input.proofPackDigest ? `**ProofPack** \`${input.proofPackDigest}\`` : "**ProofPack** none yet",
    "",
    `Opened by Farbaek for ${input.workspace.replace(/[\r\n]/g, " ").slice(0, 80)} with ${input.login}'s token. The "${STATUS_CONTEXT}" status is on this commit only. Review before merging.`,
    "",
    `Task: ${input.taskUrl}`,
  ].join("\n");
}

// What happened after Farbaek opened the pull request (ADR 0143).

export type PullState = "open" | "closed" | "merged";
export type CheckResult = "passed" | "failed" | "pending" | "skipped";

export interface PullChecks {
  total: number;
  passed: number;
  failed: number;
  pending: number;
  /** At most 30, by name. */
  runs: { name: string; result: CheckResult }[];
}

/** One GitHub check run's result: anything not completed is pending; only success passes. */
export function checkResult(status: string | null, conclusion: string | null): CheckResult {
  if (status !== "completed") return "pending";
  if (conclusion === "success") return "passed";
  if (conclusion === "neutral" || conclusion === "skipped") return "skipped";
  return "failed";
}

export function summarizeChecks(runs: readonly { name: string; status: string | null; conclusion: string | null }[]): PullChecks {
  const results = runs.map((r) => ({ name: r.name.slice(0, 120) || "Unnamed check", result: checkResult(r.status, r.conclusion) }));
  const count = (k: CheckResult) => results.filter((r) => r.result === k).length;
  return { total: results.length, passed: count("passed"), failed: count("failed"), pending: count("pending"), runs: results.slice(0, 30) };
}

/** The pull request's state from GitHub's answer: merged wins over closed. */
export function pullStateFrom(json: { state?: unknown; merged?: unknown; merged_at?: unknown }): { state: PullState; mergedAt: string | null } | null {
  if (json.merged === true || (typeof json.merged_at === "string" && json.merged_at)) return { state: "merged", mergedAt: typeof json.merged_at === "string" ? json.merged_at : new Date().toISOString() };
  if (json.state === "open") return { state: "open", mergedAt: null };
  if (json.state === "closed") return { state: "closed", mergedAt: null };
  return null;
}
