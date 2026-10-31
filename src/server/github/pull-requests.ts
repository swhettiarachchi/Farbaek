/**
 * Opening a pull request for one applied change, and keeping its "Farbaek
 * ProofPack" status true (ADR 0126). The files come from the database, not
 * the browser; a file goes in only when GitHub still has the version the
 * change started from, so nothing on GitHub is overwritten.
 *
 * When the base branch doesn't have those versions because an earlier
 * Farbaek pull request that changes the same files hasn't merged yet, the
 * new one is stacked on that pull request's branch instead (ADR 0147).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { STATUS_CONTEXT, branchName, gitBlobSha, planFiles, pullRequestBody, statusFor, type CommitState, type ProofStatus } from "@/core/github/pull-request";
import { log } from "@/server/observability/log";
import { GITHUB_MESSAGES, createGitHubClient, type GitHubClient, type GitHubErrorCode } from "./client";
import { latestProofStatus, openGitHubToken, readProposalPull, type AppliedChange, type RepoLinkView } from "./store";

type Outcome<T> = { ok: true; value: T } | { ok: false; message: string };

const say = (code: GitHubErrorCode, detail: string | null) => (code === "INVALID" && detail ? `${GITHUB_MESSAGES.INVALID} GitHub said: ${detail}` : GITHUB_MESSAGES[code]);

/** The app's own address for a task, for the status's link and the pull request's description. */
export function taskUrl(taskId: string, env: Record<string, string | undefined> = process.env): string {
  const site = (env.NEXT_PUBLIC_SITE_URL?.trim() || "https://www.farbaek.com").replace(/\/+$/, "");
  return `${site}/app/tasks/${encodeURIComponent(taskId)}`;
}

export interface OpenedPull {
  number: number;
  url: string;
  repo: string;
  branch: string;
  baseBranch: string;
  /** The earlier Farbaek pull request this one is stacked on, if any. */
  stackedOn: number | null;
  commit: string;
  status: { state: CommitState; posted: boolean };
}

export async function openPullRequest(input: {
  github: GitHubClient;
  link: RepoLinkView;
  change: AppliedChange;
  taskTitle: string;
  workspace: string;
  login: string;
  /** Farbaek's own pull requests on this repository that may still be open, newest first: where a change can be stacked. */
  earlier?: readonly { number: number; branch: string }[];
  siteEnv?: Record<string, string | undefined>;
}): Promise<Outcome<OpenedPull>> {
  const { github, link, change } = input;
  const repo = await github.repo(link.owner, link.repo);
  if (!repo.ok) return { ok: false, message: say(repo.code, repo.detail) };
  // A repository deleted and made again under the same name is a different one.
  if (repo.value.id !== link.repoId) return { ok: false, message: `${link.owner}/${link.repo} on GitHub isn't the repository this project was linked to. An owner or admin can link it again.` };
  if (repo.value.archived) return { ok: false, message: `${link.owner}/${link.repo} is archived on GitHub, so nothing can be pushed to it.` };
  if (!repo.value.canPush) return { ok: false, message: `${input.login} can't push to ${link.owner}/${link.repo} any more.` };
  const owner = repo.value.owner;
  const name = repo.value.repo;

  /** What a branch has of the change's files, and whether the change can go on top of it. */
  async function onto(branch: string) {
    const head = await github.branchHead(owner, name, branch);
    if (!head.ok) return head;
    const remote: Record<string, string | null> = {};
    for (const f of change.files) {
      const there = await github.blobSha(owner, name, f.path, head.value.commit);
      if (!there.ok) return there;
      remote[f.path] = there.value;
    }
    return { ok: true as const, value: { head: head.value, remote, plan: await planFiles(change.files, remote) } };
  }

  let base = await onto(link.defaultBranch);
  if (!base.ok) return { ok: false, message: base.code === "NOT_FOUND" ? `The branch ${link.defaultBranch} isn't on GitHub any more. An owner or admin can link the repository again.` : say(base.code, base.detail) };
  let baseBranch = link.defaultBranch;
  let stackedOn: number | null = null;
  const first = base.value.plan;
  if (!first.ok && first.reason !== "already_there") {
    // An earlier pull request that hasn't merged may have exactly the versions this change started from.
    for (const e of (input.earlier ?? []).slice(0, 3)) {
      const there = await onto(e.branch);
      if (!there.ok || !there.value.plan.ok) continue;
      base = there;
      baseBranch = e.branch;
      stackedOn = e.number;
      break;
    }
  }
  const { head, remote, plan } = base.value;
  if (!plan.ok) {
    if (plan.reason === "already_there") return { ok: false, message: `This change is already on ${link.defaultBranch}, so there's nothing to open.` };
    const list = plan.paths.slice(0, 5).join(", ") + (plan.paths.length > 5 ? ` and ${plan.paths.length - 5} more` : "");
    return {
      ok: false,
      message: `On GitHub, ${list} ${plan.paths.length === 1 ? "isn't" : "aren't"} the version this change started from, so nothing was pushed.${input.earlier?.length ? " Farbaek's open pull requests on this repository don't have those versions either." : ""} Merge any earlier pull request from Farbaek, or bring ${link.defaultBranch} up to date, then try again.`,
    };
  }

  const blobs: { path: string; sha: string }[] = [];
  for (const f of plan.files) {
    // A file GitHub already has as the change left it needs no new blob.
    if (remote[f.path] === (await gitBlobSha(f.after))) continue;
    const blob = await github.createBlob(owner, name, f.after);
    if (!blob.ok) return { ok: false, message: say(blob.code, blob.detail) };
    blobs.push({ path: f.path, sha: blob.value });
  }
  const tree = await github.createTree(owner, name, head.tree, blobs);
  if (!tree.ok) return { ok: false, message: say(tree.code, tree.detail) };
  const title = input.taskTitle.replace(/[\r\n]+/g, " ").trim().slice(0, 200) || "Change from Farbaek";
  const commit = await github.createCommit(owner, name, {
    message: `${title}\n\nFarbaek task ${change.taskId}, change ${change.proposalId}.\nContract version ${change.contract.version} (${change.contract.sha256}).`,
    tree: tree.value,
    parent: head.commit,
  });
  if (!commit.ok) return { ok: false, message: say(commit.code, commit.detail) };

  const branch = branchName(input.taskTitle, change.proposalId);
  const made = await github.createBranch(owner, name, branch, commit.value);
  if (!made.ok) return { ok: false, message: made.code === "BRANCH_EXISTS" ? `A branch named ${branch} already exists on GitHub. Delete it there, then try again.` : say(made.code, made.detail) };

  const url = taskUrl(change.taskId, input.siteEnv);
  const pull = await github.openPull(owner, name, {
    title,
    head: branch,
    base: baseBranch,
    body: pullRequestBody({
      summary: change.summary,
      paths: change.files.map((f) => f.path),
      contract: change.contract,
      proofPackDigest: change.proof?.digest ?? null,
      taskUrl: url,
      workspace: input.workspace,
      login: input.login,
      stackedOn: stackedOn === null ? null : { number: stackedOn, defaultBranch: link.defaultBranch },
    }),
  });
  if (!pull.ok) return { ok: false, message: `The branch ${branch} is on GitHub, but the pull request couldn't be opened. ${say(pull.code, pull.detail)} You can open it from the branch on GitHub.` };

  const status = statusFor(change.proof?.status ?? null);
  const posted = await github.postStatus(owner, name, commit.value, { state: status.state, description: status.description, context: STATUS_CONTEXT, targetUrl: url });
  if (!posted.ok) log("warn", "github.status_failed", { code: posted.code });
  return { ok: true, value: { number: pull.value.number, url: pull.value.url, repo: `${owner}/${name}`, branch, baseBranch, stackedOn, commit: commit.value, status: { state: status.state, posted: posted.ok } } };
}

/** Posts the status for a change's latest ProofPack on the commit Farbaek made. */
export async function postPullStatus(input: { github: GitHubClient; repo: string; commit: string; taskId: string; proof: ProofStatus | null; siteEnv?: Record<string, string | undefined> }): Promise<Outcome<CommitState>> {
  const [owner = "", name = ""] = input.repo.split("/");
  const status = statusFor(input.proof);
  const posted = await input.github.postStatus(owner, name, input.commit, { state: status.state, description: status.description, context: STATUS_CONTEXT, targetUrl: taskUrl(input.taskId, input.siteEnv) });
  return posted.ok ? { ok: true, value: status.state } : { ok: false, message: say(posted.code, posted.detail) };
}

/**
 * After checks record a new ProofPack, brings the pull request's status up to
 * date with the server's key. Best effort: a failure is logged and never
 * stops the verification that called it.
 */
export async function refreshPullStatusAfterProof(admin: SupabaseClient, proofPackDigest: string): Promise<void> {
  try {
    const { data } = await admin.from("proofpacks").select("org_id, task_id, proposal_id").eq("digest", proofPackDigest).maybeSingle();
    if (!data?.proposal_id) return;
    const orgId = String(data.org_id);
    const pull = await readProposalPull(admin, orgId, String(data.proposal_id));
    if (!pull) return;
    const token = await openGitHubToken(admin, orgId);
    if (token.state !== "ok") return;
    const proof = await latestProofStatus(admin, orgId, pull.proposalId);
    const posted = await postPullStatus({ github: createGitHubClient(token.token), repo: pull.repo, commit: pull.commitSha, taskId: pull.taskId, proof });
    if (!posted.ok) {
      log("warn", "github.status_refresh_failed", { proposal: pull.proposalId });
      return;
    }
    await admin.rpc("app_record_github_status", { p_org: orgId, p_proposal: pull.proposalId, p_state: posted.value });
  } catch {
    log("warn", "github.status_refresh_failed", {});
  }
}
