"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseRepoName } from "@/core/github/pull-request";
import { GITHUB_MESSAGES, createGitHubClient } from "@/server/github/client";
import { openGitHubToken } from "@/server/github/store";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { loadAppContext } from "@/server/workspace/context";
import { MANAGER_ROLES } from "@/server/workspace/types";

export type RepoLinkState = { status: "idle" } | { status: "error"; message: string } | { status: "linked"; repo: string; branch: string };

const BRANCH = /^[A-Za-z0-9._/-]{1,250}$/;

async function managerContext(projectId: string) {
  if (!z.uuid().safeParse(projectId).success) return { error: "That project doesn't exist." } as const;
  const ctx = await loadAppContext();
  if (!ctx?.current) return { error: "Open a workspace first." } as const;
  if (ctx.mode !== "live") return { error: "The demo workspace is read-only." } as const;
  if (!ctx.writes.enabled) return { error: ctx.writes.reason } as const;
  if (!ctx.role || !MANAGER_ROLES.includes(ctx.role)) return { error: "Only owners and admins can link a repository." } as const;
  const admin = createSupabaseAdminClient();
  if (!admin) return { error: "The server isn't configured for this." } as const;
  return { ctx, orgId: ctx.current.id, admin } as const;
}

/**
 * Links the project to a repository (ADR 0126), once GitHub says the
 * workspace's token reaches it and its owner can push to it. The names
 * stored are GitHub's own, with the repository's id, so one deleted and
 * made again under the same name isn't mistaken for it.
 */
export async function linkRepoAction(projectId: string, _previous: RepoLinkState, form: FormData): Promise<RepoLinkState> {
  const m = await managerContext(projectId);
  if ("error" in m) return { status: "error", message: m.error ?? "This can't run here." };
  const name = parseRepoName(String(form.get("repo") ?? ""));
  if (!name) return { status: "error", message: "Enter the repository as owner/name, like acme/shop." };
  const token = await openGitHubToken(m.admin, m.orgId).catch(() => ({ state: "none" as const }));
  if (token.state === "none") return { status: "error", message: "Connect GitHub in Settings first." };
  if (token.state === "broken") return { status: "error", message: "The workspace's GitHub token can't be opened any more. Connect it again in Settings." };
  const repo = await createGitHubClient(token.token).repo(name.owner, name.repo);
  if (!repo.ok) return { status: "error", message: repo.code === "NOT_FOUND" ? `GitHub couldn't find ${name.owner}/${name.repo}, or the token hasn't been given it. Add it under the token's Repository access on GitHub.` : GITHUB_MESSAGES[repo.code] };
  if (!repo.value.canPush) return { status: "error", message: `${token.login} can't push to ${repo.value.owner}/${repo.value.repo}, so Farbaek can't open pull requests there.` };
  if (repo.value.archived) return { status: "error", message: `${repo.value.owner}/${repo.value.repo} is archived on GitHub.` };
  if (!BRANCH.test(repo.value.defaultBranch)) return { status: "error", message: `Farbaek can't work with the branch name ${repo.value.defaultBranch.slice(0, 60)} yet.` };
  const { error } = await m.admin.rpc("app_link_github_repo", {
    p_org: m.orgId,
    p_actor: m.ctx.user.id,
    p_project: projectId,
    p_owner: repo.value.owner,
    p_repo: repo.value.repo,
    p_repo_id: repo.value.id,
    p_default_branch: repo.value.defaultBranch,
  });
  if (error) {
    const message = /PROJECT_ARCHIVED/.test(error.message) ? "This project is archived." : /FORBIDDEN/.test(error.message) ? "Only owners and admins can link a repository." : /NOT_FOUND/.test(error.message) ? "That project doesn't exist." : "The repository couldn't be linked. Try again.";
    return { status: "error", message };
  }
  revalidatePath(`/app/projects/${projectId}/github`);
  return { status: "linked", repo: `${repo.value.owner}/${repo.value.repo}`, branch: repo.value.defaultBranch };
}

/** Unlinks it. Pull requests already opened stay listed. */
export async function unlinkRepoAction(projectId: string): Promise<RepoLinkState> {
  const m = await managerContext(projectId);
  if ("error" in m) return { status: "error", message: m.error ?? "This can't run here." };
  const { error } = await m.admin.rpc("app_unlink_github_repo", { p_org: m.orgId, p_actor: m.ctx.user.id, p_project: projectId });
  if (error) return { status: "error", message: /NOT_FOUND/.test(error.message) ? "No repository is linked." : "The repository couldn't be unlinked. Try again." };
  revalidatePath(`/app/projects/${projectId}/github`);
  return { status: "idle" };
}
