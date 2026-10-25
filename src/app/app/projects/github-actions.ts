"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseGitHubSource } from "@/core/workspace/github";
import { log } from "@/server/observability/log";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { loadAppContext } from "@/server/workspace/context";
import { importFromGitHub } from "@/server/workspace/github-import";
import { createSupabaseWriteDeps } from "@/server/workspace/supabase-writer";

export type GitHubImportState = { status: "idle" } | { status: "error"; message: string; source: string };

/** Imports a person may start in an hour: each downloads up to 60 MB from GitHub. */
const PER_HOUR = 10;

/**
 * Makes a project from a public GitHub repository (ADR 0074): the server
 * downloads the archive, screens every file like any import, and records the
 * commit it came from in the project's description.
 */
export async function importGitHubAction(_previous: GitHubImportState, form: FormData): Promise<GitHubImportState> {
  const raw = String(form.get("source") ?? "").slice(0, 400);
  const fail = (message: string): GitHubImportState => ({ status: "error", message, source: raw });
  const source = parseGitHubSource(raw);
  if (!source) return fail("Paste a public GitHub repository, like github.com/owner/repo or owner/repo. For a branch or tag, paste its /tree/ address.");

  const ctx = await loadAppContext();
  if (!ctx) redirect("/sign-in?next=/app/projects");
  if (ctx.mode === "demo") return fail("The demo workspace is read-only. Sign in to import your own repository.");
  if (!ctx.writes.enabled) return fail(ctx.writes.reason);
  if (!ctx.current || !ctx.role) return fail("Create or join a workspace first.");
  const [user, admin] = [await createSupabaseServerClient(), createSupabaseAdminClient()];
  if (!user || !admin) return fail("The server isn't configured for writes.");

  const limit = await admin.rpc("app_rate_limit", { p_key: `github-import:${ctx.user.id}`, p_window_seconds: 3600, p_limit: PER_HOUR });
  if (limit.error) return fail("Importing isn't available right now. Try again in a few minutes.");
  if (limit.data !== true) return fail(`You can import from GitHub ${PER_HOUR} times an hour. Try again later.`);

  const result = await importFromGitHub(createSupabaseWriteDeps(user, admin, ctx.user.id), { orgId: ctx.current.id, userId: ctx.user.id, source });
  if (!result.ok) return fail(result.message);
  const { projectId, commit, imported, skipped, ignored } = result.value;
  log("info", "github.imported", { org: ctx.current.id, project: projectId, commit: commit ?? "unknown", files: "files" in imported ? imported.files : 0, skipped, ignored });
  revalidatePath("/app", "layout");
  redirect(`/app/projects/${projectId}${"error" in imported ? "?import=failed" : "?import=github"}`);
}
