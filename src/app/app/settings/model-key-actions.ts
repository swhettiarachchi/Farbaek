"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { checkAnthropicKey, checkGatewayUrl, gatewayResolvesPublic, keyHint, sealModelKey } from "@/server/ai/workspace-ai";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { loadAppContext } from "@/server/workspace/context";
import { MANAGER_ROLES } from "@/server/workspace/types";

export type ModelKeyState = { status: "idle" } | { status: "error"; message: string } | { status: "saved"; hint: string; gateway: string | null };

/** Who may change the key, checked here and again by the database. */
async function managerContext() {
  const ctx = await loadAppContext();
  if (!ctx?.current) return { error: "Open a workspace first." } as const;
  if (ctx.mode !== "live") return { error: "The demo workspace is read-only." } as const;
  if (!ctx.writes.enabled) return { error: ctx.writes.reason } as const;
  if (!ctx.role || !MANAGER_ROLES.includes(ctx.role)) return { error: "Only owners and admins can change the workspace's AI key." } as const;
  const admin = createSupabaseAdminClient();
  if (!admin) return { error: "The server isn't configured for this." } as const;
  return { ctx, orgId: ctx.current.id, admin } as const;
}

// A key is printable ASCII with no spaces; the length range covers Anthropic's keys with room to spare.
const KeySchema = z.string().trim().min(20).max(300).regex(/^[\x21-\x7e]+$/);

/**
 * Saves the workspace's own Anthropic key (ADR 0125), after checking it with a
 * free call and checking any gateway is https on a public address. The key is
 * sealed before it's stored and never goes back to a browser; messages never
 * repeat it.
 */
export async function setModelKeyAction(_previous: ModelKeyState, form: FormData): Promise<ModelKeyState> {
  const m = await managerContext();
  if ("error" in m) return { status: "error", message: m.error ?? "This can't run here." };
  const key = KeySchema.safeParse(form.get("key"));
  if (!key.success) return { status: "error", message: "Paste the whole key, with no spaces." };
  const rawGateway = String(form.get("gateway") ?? "").trim();
  let gateway: { url: string; host: string } | null = null;
  if (rawGateway) {
    const checked = checkGatewayUrl(rawGateway);
    if (!checked.ok) return { status: "error", message: checked.reason };
    if (!(await gatewayResolvesPublic(checked.host))) return { status: "error", message: "The gateway's name doesn't point to a public address, so Farbaek won't send anything to it." };
    gateway = { url: checked.url, host: checked.host };
  }
  const works = await checkAnthropicKey(key.data, gateway?.url ?? null);
  if (!works.ok) return { status: "error", message: works.reason };
  const sealed = sealModelKey(m.orgId, key.data);
  if (!sealed) return { status: "error", message: "This server can't store keys safely right now, so nothing was saved." };
  const hint = keyHint(key.data);
  const { error } = await m.admin.rpc("app_set_model_key", { p_org: m.orgId, p_actor: m.ctx.user.id, p_provider: "anthropic", p_key_sealed: sealed, p_key_hint: hint, p_base_url: gateway?.url ?? null });
  if (error) return { status: "error", message: /FORBIDDEN/.test(error.message) ? "Only owners and admins can change the workspace's AI key." : "The key couldn't be saved. Try again." };
  revalidatePath("/app/settings");
  return { status: "saved", hint, gateway: gateway?.host ?? null };
}

/** Removes the key: the workspace goes back to Farbaek's AI. */
export async function removeModelKeyAction(): Promise<ModelKeyState> {
  const m = await managerContext();
  if ("error" in m) return { status: "error", message: m.error ?? "This can't run here." };
  const { error } = await m.admin.rpc("app_remove_model_key", { p_org: m.orgId, p_actor: m.ctx.user.id });
  if (error) return { status: "error", message: /NOT_FOUND/.test(error.message) ? "There's no key to remove." : "The key couldn't be removed. Try again." };
  revalidatePath("/app/settings");
  return { status: "idle" };
}
