"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseGitHubSource } from "@/core/workspace/github";
import { createGitHubClient } from "@/server/github/client";
import { openGitHubToken } from "@/server/github/store";
import { log } from "@/server/observability/log";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { loadAppContext } from "@/server/workspace/context";
import { importFromGitHub } from "@/server/workspace/github-import";
import { createSupabaseWriteDeps } from "@/server/workspace/supabase-writer";
import { MANAGER_ROLES } from "@/server/workspace/types";

export type GitHubImportState = { status: "idle" } | { status: "error"; message: string; source: string };

/** Imports a person may start in an hour: each downloads up to 60 MB from GitHub. */
const PER_HOUR = 10;

/** Branch names Farbaek links to, the same as linking by hand. */
const BRANCH = /^[A-Za-z0-9._/-]{1,250}$/;

/**
 * Makes a project from a GitHub repository (ADR 0074): the server downloads
 * the archive, screens every file like any import, and records the commit it
 * came from in the project's description.
 *
 * A private one (ADR 0144) is read with the workspace's GitHub token, for
 * owners and admins only, and only when the public download finds nothing.
 * That use of the token is audited, and the project can be linked to the
 * repository in the same step so applied changes open pull requests there.
 */
export async function importGitHubAction(_previous: GitHubImportState, form: FormData): Promise<GitHubImportState> {
  const raw = String(form.get("source") ?? "").slice(0, 400);
  const fail = (message: string): GitHubImportState => ({ status: "error", message, source: raw });
  const source = parseGitHubSource(raw);
  if (!source) return fail("Paste a GitHub repository, like github.com/owner/repo or owner/repo. For a branch or tag, paste its /tree/ address.");

  const ctx = await loadAppContext();
  if (!ctx) redirect("/sign-in?next=/app/projects");
  if (ctx.mode === "demo") return fail("The demo workspace is read-only. Sign in to import your own repository.");
  if (!ctx.writes.enabled) return fail(ctx.writes.reason);
  if (!ctx.current || !ctx.role) return fail("Create or join a workspace first.");
  const [user, admin] = [await createSupabaseServerClient(), createSupabaseAdminClient()];
  if (!user || !admin) return fail("Farbaek's server isn't set up to save changes yet. Write to support@farbaek.com.");

  const limit = await admin.rpc("app_rate_limit", { p_key: `github-import:${ctx.user.id}`, p_window_seconds: 3600, p_limit: PER_HOUR });
  if (limit.error) return fail("Importing isn't available right now. Try again in a few minutes.");
  if (limit.data !== true) return fail(`You can import from GitHub ${PER_HOUR} times an hour. Try again later.`);

  const orgId = ctx.current.id;
  const canUseToken = MANAGER_ROLES.includes(ctx.role);
  const opened = canUseToken ? await openGitHubToken(admin, orgId).catch(() => ({ state: "none" as const })) : ({ state: "none" } as const);
  const withToken = opened.state === "ok" ? { token: opened.token, client: createGitHubClient(opened.token) } : null;
  const privateHint = withToken
    ? null
    : !canUseToken
      ? "If it's private, an owner or admin can import it with the workspace's GitHub connection."
      : opened.state === "broken"
        ? "If it's private: the workspace's GitHub token can't be opened any more, so connect it again in Settings."
        : "If it's private, connect GitHub in Settings with a token that can read it, then import it again.";

  const result = await importFromGitHub(createSupabaseWriteDeps(user, admin, ctx.user.id), { orgId, userId: ctx.user.id, source, withToken, privateHint });
  if (!result.ok) return fail(result.message);
  const { projectId, commit, imported, skipped, ignored, via } = result.value;
  log("info", "github.imported", { org: orgId, project: projectId, commit: commit ?? "unknown", files: "files" in imported ? imported.files : 0, skipped, ignored, via: via.kind });

  // The person asked for a link: "1" when it's there, "failed" when it couldn't be made, so the page never implies either.
  let linked: "1" | "failed" | null = null;
  if (via.kind === "token") {
    const repo = via.repository;
    const recorded = await admin.rpc("app_record_github_import", { p_org: orgId, p_actor: ctx.user.id, p_project: projectId, p_repository: `${repo.owner}/${repo.repo}`, p_commit: commit });
    // The files are already in; a missing audit entry is logged loudly rather than undoing the import.
    if (recorded.error) log("error", "github.import_unrecorded", { org: orgId, project: projectId, reason: recorded.error.message.slice(0, 120) });
    if (form.get("link") === "on" && repo.canPush && !repo.archived && BRANCH.test(repo.defaultBranch)) {
      const link = await admin.rpc("app_link_github_repo", { p_org: orgId, p_actor: ctx.user.id, p_project: projectId, p_owner: repo.owner, p_repo: repo.repo, p_repo_id: repo.id, p_default_branch: repo.defaultBranch });
      if (link.error) log("warn", "github.link_failed", { org: orgId, project: projectId, reason: link.error.message.slice(0, 120) });
      linked = link.error ? "failed" : "1";
    }
  }
  revalidatePath("/app", "layout");
  redirect(`/app/projects/${projectId}${"error" in imported ? "?import=failed" : `?import=github${linked ? `&linked=${linked}` : ""}`}`);
}
