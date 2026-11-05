/**
 * The sandbox service for an app page or server action, built from the
 * signed-in context. Returns the honest reason when sandboxes can't be used
 * here at all (demo workspace, no Supabase, no workspace).
 */
import { createSupabaseServerClient } from "@/server/supabase/server";
import type { AppContext } from "@/server/workspace/context";
import type { RuntimeHealth } from "@/core/sandbox/runtime";
import { sandboxServiceFor, type SandboxRequest } from "./wiring";

export type PageSandbox = { ok: true; value: SandboxRequest } | { ok: false; reason: string };

export async function sandboxForPage(ctx: AppContext): Promise<PageSandbox> {
  if (ctx.mode === "demo") return { ok: false, reason: "The test space needs a real workspace. The demo workspace only has sample data." };
  if (!ctx.current || !ctx.role) return { ok: false, reason: "Create or join a workspace first." };
  const user = await createSupabaseServerClient();
  if (!user) return { ok: false, reason: "Accounts aren't configured on this server." };
  return { ok: true, value: sandboxServiceFor(user, ctx.user.id, ctx.current.id, ctx.role) };
}

/** Runtime health with a short deadline, so a slow runtime never stalls a page. */
export async function healthWithin(check: () => Promise<RuntimeHealth | null>, ms = 4000): Promise<RuntimeHealth | null | "slow"> {
  return Promise.race([check(), new Promise<"slow">((resolve) => setTimeout(() => resolve("slow"), ms))]);
}
