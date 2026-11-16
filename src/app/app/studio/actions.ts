"use server";

import { z } from "zod";
import { chatModels } from "@/server/chat/setup";
import { platformPause } from "@/server/platform/state";
import { refinePrompt } from "@/server/studio/refine";
import { createStudioWrites } from "@/server/studio/studio";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { loadAppContext } from "@/server/workspace/context";
import { createSupabaseWriteDeps } from "@/server/workspace/supabase-writer";
import { CONTRIBUTOR_ROLES } from "@/server/workspace/types";

type Result<T = null> = { ok: true; value: T } | { ok: false; message: string };

/** Who may change their studio here: signed in, a workspace that takes changes, a role that may use its AI. */
async function gate(): Promise<{ ok: false; message: string } | { ok: true; orgId: string; userId: string; user: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>; admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>> }> {
  const ctx = await loadAppContext();
  if (!ctx) return { ok: false, message: "You're signed out. Sign in, then try again." };
  if (ctx.mode === "demo") return { ok: false, message: "The demo workspace is read-only." };
  if (!ctx.current) return { ok: false, message: "Create a workspace first." };
  if (!ctx.writes.enabled) return { ok: false, message: ctx.writes.reason ?? "Changes are off for this workspace right now." };
  if (!ctx.role || !CONTRIBUTOR_ROLES.includes(ctx.role)) return { ok: false, message: "Viewers can see the workspace but can't change it." };
  const [user, admin] = [await createSupabaseServerClient(), createSupabaseAdminClient()];
  if (!user || !admin) return { ok: false, message: "The studios aren't set up on this server." };
  return { ok: true, orgId: ctx.current.id, userId: ctx.user.id, user, admin };
}

/** Deletes one of the person's own studio items for good. */
export async function deleteStudioItem(id: string): Promise<Result> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, message: "That item couldn't be found." };
  const g = await gate();
  if (!g.ok) return g;
  const done = await createStudioWrites(g.admin).remove({ orgId: g.orgId, actor: g.userId, id });
  return done.ok ? { ok: true, value: null } : { ok: false, message: "That item couldn't be deleted. It may already be gone." };
}

const refineInput = z.object({ prompt: z.string().trim().min(3).max(2_000), kind: z.enum(["image", "video"]) });

/** Rewrites a short idea as a professional brief, for the person to read before making anything. */
export async function refineStudioPrompt(input: { prompt: string; kind: "image" | "video" }): Promise<Result<string>> {
  const parsed = refineInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Write a few words first." };
  const g = await gate();
  if (!g.ok) return g;
  const paused = platformPause("ai_runs");
  if (paused) return { ok: false, message: paused };
  const allowed = await g.admin.rpc("app_rate_limit", { p_key: `studio-refine:${g.userId}`, p_window_seconds: 60, p_limit: 10 });
  if (allowed.error || allowed.data !== true) return { ok: false, message: "That's a lot of refining in a minute. Wait a moment." };
  const usage = createSupabaseWriteDeps(g.user, g.admin, g.userId);
  const models = await chatModels(g.orgId, usage);
  const r = await refinePrompt({ usage, claudeUsage: models.claudeUsage, claude: models.claude, openai: models.openai }, { orgId: g.orgId, userId: g.userId, prompt: parsed.data.prompt, kind: parsed.data.kind });
  return r.ok ? { ok: true, value: r.prompt } : r;
}
