"use server";

import { revalidatePath } from "next/cache";
import { isFineGrainedToken, tokenHint } from "@/core/github/pull-request";
import { GITHUB_MESSAGES, createGitHubClient } from "@/server/github/client";
import { sealGitHubToken } from "@/server/github/store";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { loadAppContext } from "@/server/workspace/context";
import { MANAGER_ROLES } from "@/server/workspace/types";

export type GitHubTokenState = { status: "idle" } | { status: "error"; message: string } | { status: "saved"; login: string; hint: string; expiresAt: string | null };

/** Who may change the connection, checked here and again by the database. */
async function managerContext() {
  const ctx = await loadAppContext();
  if (!ctx?.current) return { error: "Open a workspace first." } as const;
  if (ctx.mode !== "live") return { error: "The demo workspace is read-only." } as const;
  if (!ctx.writes.enabled) return { error: ctx.writes.reason } as const;
  if (!ctx.role || !MANAGER_ROLES.includes(ctx.role)) return { error: "Only owners and admins can connect GitHub." } as const;
  const admin = createSupabaseAdminClient();
  if (!admin) return { error: "The server isn't configured for this." } as const;
  return { ctx, orgId: ctx.current.id, admin } as const;
}

/**
 * Connects the workspace's fine-grained GitHub token (ADR 0126), after GitHub
 * says whose it is. The token is sealed before it's stored and never goes
 * back to a browser; messages never repeat it.
 */
export async function setGitHubTokenAction(_previous: GitHubTokenState, form: FormData): Promise<GitHubTokenState> {
  const m = await managerContext();
  if ("error" in m) return { status: "error", message: m.error ?? "This can't run here." };
  const token = String(form.get("token") ?? "").trim();
  if (/^gh[pousr]_/.test(token)) return { status: "error", message: "That's a classic token, which reaches every repository you can. Create a fine-grained token instead, for just the repositories Farbaek should change." };
  if (!isFineGrainedToken(token)) return { status: "error", message: "Paste the whole fine-grained token. It starts with github_pat_." };
  const who = await createGitHubClient(token).user();
  if (!who.ok) return { status: "error", message: GITHUB_MESSAGES[who.code] };
  const sealed = sealGitHubToken(m.orgId, token);
  if (!sealed) return { status: "error", message: "This server can't store tokens safely right now, so nothing was saved." };
  const hint = tokenHint(token);
  const { error } = await m.admin.rpc("app_set_github_token", { p_org: m.orgId, p_actor: m.ctx.user.id, p_token_sealed: sealed, p_login: who.value.login, p_token_hint: hint, p_expires_at: who.value.expiresAt });
  if (error) return { status: "error", message: /FORBIDDEN/.test(error.message) ? "Only owners and admins can connect GitHub." : "The token couldn't be saved. Try again." };
  revalidatePath("/app/settings");
  return { status: "saved", login: who.value.login, hint, expiresAt: who.value.expiresAt };
}

/** Disconnects GitHub. Linked repositories and opened pull requests stay as history. */
export async function removeGitHubTokenAction(): Promise<GitHubTokenState> {
  const m = await managerContext();
  if ("error" in m) return { status: "error", message: m.error ?? "This can't run here." };
  const { error } = await m.admin.rpc("app_remove_github_token", { p_org: m.orgId, p_actor: m.ctx.user.id });
  if (error) return { status: "error", message: /NOT_FOUND/.test(error.message) ? "GitHub isn't connected." : "GitHub couldn't be disconnected. Try again." };
  revalidatePath("/app/settings");
  return { status: "idle" };
}
