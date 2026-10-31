"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withheldFor } from "@/core/workspace/permissions";
import { createGitHubClient } from "@/server/github/client";
import { openPullRequest, postPullStatus } from "@/server/github/pull-requests";
import { createSupabasePullSyncStore, syncPull } from "@/server/github/pull-sync";
import { latestProofStatus, listProjectPulls, loadAppliedChange, openGitHubToken, readProposalPull, readRepoLink } from "@/server/github/store";
import { log } from "@/server/observability/log";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { loadAppContext } from "@/server/workspace/context";
import { CONTRIBUTOR_ROLES } from "@/server/workspace/types";

export type PullRequestState = { status: "idle" } | { status: "error"; message: string } | { status: "done"; message: string };

/** A contributor who may publish, in a live workspace: checked here and again by the database. */
async function publisherContext(proposalId: string) {
  if (!z.uuid().safeParse(proposalId).success) return { error: "That change doesn't exist." } as const;
  const ctx = await loadAppContext();
  if (!ctx?.current) return { error: "Open a workspace first." } as const;
  if (ctx.mode !== "live") return { error: "The demo workspace isn't connected to GitHub." } as const;
  if (!ctx.writes.enabled) return { error: ctx.writes.reason } as const;
  if (!ctx.role || !CONTRIBUTOR_ROLES.includes(ctx.role)) return { error: "Viewers can't open pull requests." } as const;
  const withheld = withheldFor(ctx.role, ctx.permissions, "publish");
  if (withheld) return { error: withheld } as const;
  const admin = createSupabaseAdminClient();
  if (!admin) return { error: "The server isn't configured for this." } as const;
  const user = await createSupabaseServerClient();
  if (!user) return { error: "The server isn't configured for this." } as const;
  return { ctx, orgId: ctx.current.id, workspace: ctx.current.name, admin, user } as const;
}

async function tokenFor(admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>, orgId: string) {
  const token = await openGitHubToken(admin, orgId).catch(() => ({ state: "none" as const }));
  if (token.state === "none") return { error: "GitHub isn't connected. An owner or admin can connect it in Settings." } as const;
  if (token.state === "broken") return { error: "The workspace's GitHub token can't be opened any more. An owner or admin can connect it again in Settings." } as const;
  return token;
}

/**
 * Opens a pull request for one applied change (ADR 0126): the files as the
 * change left them, on a new branch from the linked repository's base,
 * with the change's ProofPack result as a status on Farbaek's commit.
 */
export async function openPullRequestAction(proposalId: string): Promise<PullRequestState> {
  const m = await publisherContext(proposalId);
  if ("error" in m) return { status: "error", message: m.error ?? "This can't run here." };
  const existing = await readProposalPull(m.user, m.orgId, proposalId).catch(() => null);
  if (existing) return { status: "done", message: `Pull request #${existing.number} is already open for this change.` };
  const change = await loadAppliedChange(m.user, m.orgId, proposalId).catch(() => null);
  if (!change) return { status: "error", message: "Only an applied change can become a pull request." };
  const [project, task, link] = await Promise.all([
    m.ctx.reader.getProject(m.orgId, change.projectId).catch(() => null),
    m.ctx.reader.getTask(m.orgId, change.taskId).catch(() => null),
    readRepoLink(m.user, m.orgId, change.projectId).catch(() => null),
  ]);
  if (!project || !task) return { status: "error", message: "That change doesn't exist." };
  if (project.archivedAt) return { status: "error", message: "This project is archived." };
  if (!link) return { status: "error", message: "This project isn't linked to a repository. An owner or admin can link one on the project's GitHub page." };
  const token = await tokenFor(m.admin, m.orgId);
  if ("error" in token) return { status: "error", message: token.error ?? "GitHub isn't connected." };

  // Farbaek's own pull requests on this repository that may still be open: a change can be stacked on one (ADR 0147).
  const repoName = `${link.owner}/${link.repo}`.toLowerCase();
  const earlier = (await listProjectPulls(m.user, m.orgId, change.projectId).catch(() => []))
    .filter((p) => p.repo.toLowerCase() === repoName && p.prState !== "merged" && p.prState !== "closed")
    .map((p) => ({ number: p.number, branch: p.branch }));
  const opened = await openPullRequest({ github: createGitHubClient(token.token), link, change, taskTitle: task.task.title, workspace: m.workspace, login: token.login, earlier });
  if (!opened.ok) return { status: "error", message: opened.message };
  const p = opened.value;
  const { error } = await m.admin.rpc("app_record_github_pull_request", {
    p_org: m.orgId,
    p_actor: m.ctx.user.id,
    p_proposal: proposalId,
    p_repo_full_name: p.repo,
    p_number: p.number,
    p_url: p.url,
    p_branch: p.branch,
    p_base_branch: p.baseBranch,
    p_commit_sha: p.commit,
  });
  if (error) {
    log("warn", "github.pull_record_failed", { proposal: proposalId });
    return { status: "error", message: `Pull request #${p.number} is open on GitHub (${p.url}), but Farbaek couldn't record it here.` };
  }
  if (p.status.posted) await m.admin.rpc("app_record_github_status", { p_org: m.orgId, p_proposal: proposalId, p_state: p.status.state });
  revalidatePath(`/app/tasks/${change.taskId}`);
  revalidatePath(`/app/projects/${change.projectId}/github`);
  return {
    status: "done",
    message:
      (p.status.posted ? `Opened pull request #${p.number} with the Farbaek ProofPack status.` : `Opened pull request #${p.number}. The status couldn't be posted; try Update the status check.`) +
      (p.stackedOn === null ? "" : ` It's stacked on #${p.stackedOn}, which changes the same files and hasn't merged yet, so merge #${p.stackedOn} first.`),
  };
}

/** Posts the change's latest ProofPack result again on Farbaek's commit. */
export async function updatePullStatusAction(proposalId: string): Promise<PullRequestState> {
  const m = await publisherContext(proposalId);
  if ("error" in m) return { status: "error", message: m.error ?? "This can't run here." };
  const pull = await readProposalPull(m.user, m.orgId, proposalId).catch(() => null);
  if (!pull) return { status: "error", message: "No pull request is open for this change." };
  const token = await tokenFor(m.admin, m.orgId);
  if ("error" in token) return { status: "error", message: token.error ?? "GitHub isn't connected." };
  const proof = await latestProofStatus(m.user, m.orgId, proposalId).catch(() => null);
  const posted = await postPullStatus({ github: createGitHubClient(token.token), repo: pull.repo, commit: pull.commitSha, taskId: pull.taskId, proof });
  if (!posted.ok) return { status: "error", message: posted.message };
  await m.admin.rpc("app_record_github_status", { p_org: m.orgId, p_proposal: proposalId, p_state: posted.value });
  revalidatePath(`/app/tasks/${pull.taskId}`);
  return { status: "done", message: "Updated the status on GitHub." };
}

/**
 * Reads the pull request on GitHub now (ADR 0143): open, merged or closed,
 * and the checks GitHub ran on its head. Reading needs a contributor, not the
 * publish permission; it changes nothing on GitHub.
 */
export async function readPullFromGitHubAction(proposalId: string): Promise<PullRequestState> {
  if (!z.uuid().safeParse(proposalId).success) return { status: "error", message: "That change doesn't exist." };
  const ctx = await loadAppContext();
  if (!ctx?.current) return { status: "error", message: "Open a workspace first." };
  if (ctx.mode !== "live") return { status: "error", message: "The demo workspace isn't connected to GitHub." };
  if (!ctx.role || !CONTRIBUTOR_ROLES.includes(ctx.role)) return { status: "error", message: "Viewers see what was last read from GitHub. Ask a member to check again." };
  const [admin, user] = [createSupabaseAdminClient(), await createSupabaseServerClient()];
  if (!admin || !user) return { status: "error", message: "The server isn't configured for this." };
  const pull = await readProposalPull(user, ctx.current.id, proposalId).catch(() => null);
  if (!pull) return { status: "error", message: "No pull request is open for this change." };
  // GitHub's rate limit is shared by the workspace's token: once every 20 seconds is plenty.
  if (pull.syncedAt && Date.now() - Date.parse(pull.syncedAt) < 20_000) return { status: "done", message: "Read from GitHub a moment ago." };
  const token = await tokenFor(admin, ctx.current.id);
  if ("error" in token) return { status: "error", message: token.error ?? "GitHub isn't connected." };
  const r = await syncPull(createGitHubClient(token.token), createSupabasePullSyncStore(admin), { id: pull.id, orgId: ctx.current.id, repo: pull.repo, number: pull.number });
  revalidatePath(`/app/tasks/${pull.taskId}`);
  if ("problem" in r) return { status: "error", message: r.problem };
  return { status: "done", message: r.state === "merged" ? "Merged on GitHub." : r.state === "closed" ? "Closed on GitHub without merging." : "Still open on GitHub." };
}
