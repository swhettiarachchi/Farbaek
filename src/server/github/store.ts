/**
 * GitHub records in the database (migration v77, ADR 0126). Pages read
 * through the person's own client, whose column grants leave the sealed
 * token out; only the server opens the token, with its own key, to call
 * GitHub. Writes go through the service-role app_* functions.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { ChangedFile, ProofStatus, PullChecks, PullState } from "@/core/github/pull-request";
import { openToken, sealToken, vaultKey } from "@/server/launch/token-vault";

const BIND = "github";

export interface GitHubConnectionView {
  login: string;
  tokenHint: string;
  expiresAt: string | null;
  setAt: string;
  lastUsedAt: string | null;
}

export interface RepoLinkView {
  owner: string;
  repo: string;
  repoId: number;
  defaultBranch: string;
  linkedAt: string;
}

export type CommitStatusState = "success" | "failure" | "pending";

export interface PullRequestView {
  id: string;
  taskId: string;
  proposalId: string;
  repo: string;
  number: number;
  url: string;
  branch: string;
  baseBranch: string;
  commitSha: string;
  status: CommitStatusState | null;
  statusPostedAt: string | null;
  openedAt: string;
  /** What GitHub said when last read (ADR 0143); null until it has been read. */
  prState: PullState | null;
  mergedAt: string | null;
  headSha: string | null;
  checks: PullChecks | null;
  syncedAt: string | null;
  syncProblem: string | null;
}

const ConnectionRow = z.object({ login: z.string(), token_hint: z.string(), expires_at: z.string().nullable(), set_at: z.string(), last_used_at: z.string().nullable() });
const LinkRow = z.object({ owner: z.string(), repo: z.string(), repo_id: z.coerce.number(), default_branch: z.string(), linked_at: z.string() });
const PULL_COLUMNS = "id, task_id, proposal_id, repo_full_name, number, url, branch, base_branch, commit_sha, status_state, status_posted_at, opened_at, pr_state, merged_at, head_sha, checks, synced_at, sync_problem";
const PullRow = z.object({
  id: z.string(),
  task_id: z.string(),
  proposal_id: z.string(),
  repo_full_name: z.string(),
  number: z.number().int(),
  url: z.string(),
  branch: z.string(),
  base_branch: z.string(),
  commit_sha: z.string(),
  status_state: z.enum(["success", "failure", "pending"]).nullable(),
  status_posted_at: z.string().nullable(),
  opened_at: z.string(),
  pr_state: z.enum(["open", "closed", "merged"]).nullable().catch(null),
  merged_at: z.string().nullable().catch(null),
  head_sha: z.string().nullable().catch(null),
  checks: z
    .object({ total: z.number(), passed: z.number(), failed: z.number(), pending: z.number(), runs: z.array(z.object({ name: z.string(), result: z.enum(["passed", "failed", "pending", "skipped"]) })) })
    .nullable()
    .catch(null),
  synced_at: z.string().nullable().catch(null),
  sync_problem: z.string().nullable().catch(null),
});

const toPull = (r: z.infer<typeof PullRow>): PullRequestView => ({
  id: r.id,
  taskId: r.task_id,
  proposalId: r.proposal_id,
  repo: r.repo_full_name,
  number: r.number,
  url: r.url,
  branch: r.branch,
  baseBranch: r.base_branch,
  commitSha: r.commit_sha,
  status: r.status_state,
  statusPostedAt: r.status_posted_at,
  openedAt: r.opened_at,
  prState: r.pr_state,
  mergedAt: r.merged_at,
  headSha: r.head_sha,
  checks: r.checks,
  syncedAt: r.synced_at,
  syncProblem: r.sync_problem,
});

/** Whether the workspace has connected GitHub, and as whom; never the token. */
export async function readGitHubConnection(client: SupabaseClient, orgId: string): Promise<GitHubConnectionView | null> {
  const { data, error } = await client.from("workspace_github").select("login, token_hint, expires_at, set_at, last_used_at").eq("org_id", orgId).maybeSingle();
  if (error) throw new Error(`Couldn't read the GitHub connection: ${error.message}`);
  if (!data) return null;
  const r = ConnectionRow.parse(data);
  return { login: r.login, tokenHint: r.token_hint, expiresAt: r.expires_at, setAt: r.set_at, lastUsedAt: r.last_used_at };
}

/** The repository a project is linked to, if any. */
export async function readRepoLink(client: SupabaseClient, orgId: string, projectId: string): Promise<RepoLinkView | null> {
  if (!z.uuid().safeParse(projectId).success) return null;
  const { data, error } = await client.from("project_github_repos").select("owner, repo, repo_id, default_branch, linked_at").eq("org_id", orgId).eq("project_id", projectId).maybeSingle();
  if (error) throw new Error(`Couldn't read the project's repository: ${error.message}`);
  if (!data) return null;
  const r = LinkRow.parse(data);
  return { owner: r.owner, repo: r.repo, repoId: r.repo_id, defaultBranch: r.default_branch, linkedAt: r.linked_at };
}

/** How many of the workspace's projects are linked to a repository. */
export async function countRepoLinks(client: SupabaseClient, orgId: string): Promise<number> {
  const { count, error } = await client.from("project_github_repos").select("project_id", { count: "exact", head: true }).eq("org_id", orgId);
  if (error) throw new Error(`Couldn't count the linked repositories: ${error.message}`);
  return count ?? 0;
}

/** The pull requests Farbaek opened for a project, newest first. */
export async function listProjectPulls(client: SupabaseClient, orgId: string, projectId: string, limit = 20): Promise<PullRequestView[]> {
  if (!z.uuid().safeParse(projectId).success) return [];
  const { data, error } = await client.from("github_pull_requests").select(PULL_COLUMNS).eq("org_id", orgId).eq("project_id", projectId).order("opened_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`Couldn't read the pull requests: ${error.message}`);
  return z.array(PullRow).parse(data).map(toPull);
}

/** The pull request opened for one change, if any. */
export async function readProposalPull(client: SupabaseClient, orgId: string, proposalId: string): Promise<PullRequestView | null> {
  if (!z.uuid().safeParse(proposalId).success) return null;
  const { data, error } = await client.from("github_pull_requests").select(PULL_COLUMNS).eq("org_id", orgId).eq("proposal_id", proposalId).maybeSingle();
  if (error) throw new Error(`Couldn't read the pull request: ${error.message}`);
  return data ? toPull(PullRow.parse(data)) : null;
}

/** Seals a token for this workspace, or null when the server has no vault key (nothing is stored). */
export function sealGitHubToken(orgId: string, token: string): string | null {
  const key = vaultKey();
  return key ? sealToken(token, key, { orgId, provider: BIND }) : null;
}

export type OpenedToken = { state: "none" } | { state: "broken" } | { state: "ok"; token: string; login: string };

/**
 * The workspace's token, opened with the server's key. "broken" when it can't
 * be opened (the vault key changed, or the row was copied from another
 * workspace): GitHub calls stop until someone connects it again.
 */
export async function openGitHubToken(admin: SupabaseClient, orgId: string): Promise<OpenedToken> {
  const { data, error } = await admin.from("workspace_github").select("token_sealed, login").eq("org_id", orgId).maybeSingle();
  if (error) throw new Error(`Couldn't read the GitHub connection: ${error.message}`);
  if (!data) return { state: "none" };
  const row = z.object({ token_sealed: z.string(), login: z.string() }).parse(data);
  const key = vaultKey();
  const token = key ? openToken(row.token_sealed, key, { orgId, provider: BIND }) : null;
  return token ? { state: "ok", token, login: row.login } : { state: "broken" };
}

export interface AppliedChange {
  proposalId: string;
  taskId: string;
  projectId: string;
  summary: string;
  contract: { version: number; sha256: string };
  files: ChangedFile[];
  proof: { digest: string; status: ProofStatus } | null;
}

/**
 * One applied change, rebuilt from the database: each file as the change
 * left it, and the version it started from. Null when the change isn't
 * applied or can't be read.
 */
export async function loadAppliedChange(client: SupabaseClient, orgId: string, proposalId: string): Promise<AppliedChange | null> {
  if (!z.uuid().safeParse(proposalId).success) return null;
  const { data: p, error } = await client.from("change_proposals").select("task_id, project_id, status, plan, changes, contract_version").eq("org_id", orgId).eq("id", proposalId).maybeSingle();
  if (error) throw new Error(`Couldn't read the change: ${error.message}`);
  if (!p) return null;
  const proposal = z
    .object({
      task_id: z.string(),
      project_id: z.string(),
      status: z.string(),
      plan: z.object({ summary: z.string() }),
      changes: z.array(z.object({ path: z.string(), kind: z.enum(["create", "edit"]), base_revision: z.number().int() })),
      contract_version: z.number().int(),
    })
    .parse(p);
  if (proposal.status !== "applied") return null;

  const [after, contract, proof] = await Promise.all([
    client.from("project_file_revisions").select("path, revision, content").eq("org_id", orgId).eq("project_id", proposal.project_id).eq("proposal_id", proposalId),
    client.from("intent_contracts").select("version, sha256").eq("org_id", orgId).eq("task_id", proposal.task_id).eq("version", proposal.contract_version).maybeSingle(),
    client.from("proofpacks").select("digest, status").eq("org_id", orgId).eq("task_id", proposal.task_id).eq("proposal_id", proposalId).order("seq", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (after.error || contract.error || proof.error || !contract.data) throw new Error("Couldn't read the applied change.");
  const written = z.array(z.object({ path: z.string(), revision: z.number().int(), content: z.string().nullable() })).parse(after.data);
  const kinds = new Map(proposal.changes.map((c) => [c.path, c]));

  const files: ChangedFile[] = [];
  for (const w of written) {
    const change = kinds.get(w.path);
    // A deletion isn't something a proposal makes; anything else unknown is refused.
    if (!change || w.content === null) return null;
    let before: string | null = null;
    if (change.kind === "edit") {
      const { data, error: e } = await client
        .from("project_file_revisions")
        .select("content")
        .eq("org_id", orgId)
        .eq("project_id", proposal.project_id)
        .eq("path", w.path)
        .eq("revision", change.base_revision)
        .maybeSingle();
      if (e) throw new Error("Couldn't read the file the change started from.");
      before = typeof data?.content === "string" ? data.content : null;
      if (before === null) return null;
    }
    files.push({ path: w.path, before, after: w.content });
  }
  if (files.length === 0) return null;
  files.sort((a, b) => a.path.localeCompare(b.path));

  const c = z.object({ version: z.number().int(), sha256: z.string() }).parse(contract.data);
  const pack = proof.data ? z.object({ digest: z.string(), status: z.enum(["unverified", "partially_verified", "verified", "failed"]) }).parse(proof.data) : null;
  return {
    proposalId,
    taskId: proposal.task_id,
    projectId: proposal.project_id,
    summary: proposal.plan.summary,
    contract: { version: c.version, sha256: c.sha256 },
    files,
    proof: pack,
  };
}

/** The latest ProofPack status for a change, read with the server's key (for updates after checks run). */
export async function latestProofStatus(client: SupabaseClient, orgId: string, proposalId: string): Promise<ProofStatus | null> {
  const { data, error } = await client.from("proofpacks").select("status").eq("org_id", orgId).eq("proposal_id", proposalId).order("seq", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error("Couldn't read the ProofPack.");
  return data ? z.enum(["unverified", "partially_verified", "verified", "failed"]).parse(data.status) : null;
}

/** What a task's page needs for its pull request card, read as the person; nulls when it can't be read. */
export async function loadTaskGitHub(client: SupabaseClient, orgId: string, projectId: string, proposalId: string): Promise<{ connected: boolean; link: RepoLinkView | null; pull: PullRequestView | null }> {
  const [connection, link, pull] = await Promise.all([
    readGitHubConnection(client, orgId).catch(() => null),
    readRepoLink(client, orgId, projectId).catch(() => null),
    readProposalPull(client, orgId, proposalId).catch(() => null),
  ]);
  return { connected: connection !== null, link, pull };
}
