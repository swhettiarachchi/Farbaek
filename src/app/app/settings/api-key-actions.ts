"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { checkFeature } from "@/core/billing/entitlements";
import { API_KEY_DAYS, API_NOT_IN_PLAN, apiKeyHint, type ApiKeyDays } from "@/core/workspace/api-keys";
import type { ActionState } from "@/components/ui/confirm-action";
import { apiKeySha256, newApiKey } from "@/server/api-keys/keys";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { loadAppContext } from "@/server/workspace/context";
import { MANAGER_ROLES } from "@/server/workspace/types";

export type CreateApiKeyState = { status: "idle" } | { status: "error"; message: string } | { status: "created"; key: string; name: string; days: ApiKeyDays };

/**
 * Who may make and revoke keys, checked here and again by the database (ADR 0187). Revoking works even while the
 * workspace is paused or suspended, so a key that leaked can be stopped then, not only once writes come back.
 */
async function managerContext(purpose: "create" | "revoke") {
  const ctx = await loadAppContext();
  if (!ctx?.current) return { error: "Open a workspace first." } as const;
  if (ctx.mode !== "live") return { error: "The demo workspace is read-only." } as const;
  if (purpose === "create" && !ctx.writes.enabled) return { error: ctx.writes.reason } as const;
  if (!ctx.role || !MANAGER_ROLES.includes(ctx.role)) return { error: "Only owners and admins can make or revoke API keys." } as const;
  const admin = createSupabaseAdminClient();
  if (!admin) return { error: "API keys can't be made on this server right now." } as const;
  return { ctx, orgId: ctx.current.id, admin } as const;
}

// A name people recognise later: printable, no line breaks.
const NameSchema = z
  .string()
  .trim()
  .min(1, "Give the key a name, such as where it's used.")
  .max(60, "Use 60 characters or fewer.")
  .regex(/^[^\p{Cc}]+$/u, "Use letters, numbers and punctuation only.");
const DaysSchema = z.coerce.number().refine((n): n is ApiKeyDays => (API_KEY_DAYS as readonly number[]).includes(n), "Choose how long the key works.");

const CREATE_MESSAGES: Record<string, string> = {
  FORBIDDEN: "Only owners and admins can make API keys.",
  SUSPENDED: "This workspace is suspended, so no key can be made. Contact Farbaek support.",
  QUOTA_EXCEEDED: "This workspace already has 10 working keys. Revoke one you no longer use, then make a new one.",
};

/**
 * Makes a developer API key. The key is made here, shown to this person once, and only its SHA-256 is stored.
 * It's never logged, and no message repeats it.
 */
export async function createApiKeyAction(_previous: CreateApiKeyState, form: FormData): Promise<CreateApiKeyState> {
  const m = await managerContext("create");
  if ("error" in m) return { status: "error", message: m.error ?? "This can't run here." };
  const feature = checkFeature(m.ctx.current!.plan, "developer_api");
  if (!feature.allowed) return { status: "error", message: feature.code === "FEATURE_NOT_IN_PLAN" ? API_NOT_IN_PLAN : feature.message };
  const name = NameSchema.safeParse(form.get("name"));
  if (!name.success) return { status: "error", message: name.error.issues[0]?.message ?? "Give the key a name." };
  const days = DaysSchema.safeParse(form.get("days"));
  if (!days.success) return { status: "error", message: "Choose how long the key works: 30, 90 or 365 days." };
  const key = newApiKey();
  const { error } = await m.admin.rpc("app_create_api_key", {
    p_org: m.orgId,
    p_actor: m.ctx.user.id,
    p_name: name.data,
    p_sha256: apiKeySha256(key),
    p_hint: apiKeyHint(key),
    p_days: days.data,
  });
  if (error) {
    const code = Object.keys(CREATE_MESSAGES).find((c) => error.message.includes(c));
    return { status: "error", message: code ? CREATE_MESSAGES[code]! : "The key couldn't be made. Nothing was saved. Try again." };
  }
  revalidatePath("/app/settings");
  return { status: "created", key, name: name.data, days: days.data };
}

/** Turns a key off for good. Calls made with it stop at once. */
export async function revokeApiKeyAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const m = await managerContext("revoke");
  if ("error" in m) return { status: "error", message: m.error ?? "This can't run here." };
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return { status: "error", message: "That key doesn't exist." };
  const { error } = await m.admin.rpc("app_revoke_api_key", { p_org: m.orgId, p_actor: m.ctx.user.id, p_id: id.data });
  if (error) {
    return {
      status: "error",
      message: /NOT_FOUND/.test(error.message) ? "That key is already revoked, or isn't in this workspace." : /FORBIDDEN/.test(error.message) ? "Only owners and admins can revoke API keys." : "The key couldn't be revoked. Try again.",
    };
  }
  revalidatePath("/app/settings");
  return { status: "done", message: "Revoked. Calls made with this key stop now." };
}
