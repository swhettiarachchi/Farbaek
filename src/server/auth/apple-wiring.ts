/**
 * Apple's refresh tokens on this server (ADR 0113, migration v72): kept at
 * sign-in, revoked when the account is deleted. Neither step ever blocks the
 * person: a sign-in whose code Apple won't exchange still signs in, and an
 * account is still deleted if Apple can't be reached, with the failure
 * logged (never the token) for staff to follow up.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { log } from "@/server/observability/log";
import { appleSignInKey, exchangeAppleCode, revokeAppleToken } from "./apple";

/** Exchanges the sign-in's authorization code and keeps Apple's refresh token. */
export async function keepAppleSignIn(admin: SupabaseClient, userId: string, code: string): Promise<void> {
  const key = appleSignInKey();
  if (!key) return;
  try {
    const token = await exchangeAppleCode(key, code);
    if (!token) {
      log("warn", "apple_sign_in.code_refused", { user: userId });
      return;
    }
    const { error } = await admin.rpc("app_apple_sign_in_keep", { p_user: userId, p_token: token });
    if (error) log("error", "apple_sign_in.keep_failed", { user: userId, error: error.message.slice(0, 200) });
  } catch (e) {
    log("error", "apple_sign_in.exchange_failed", { user: userId, error: e instanceof Error ? e.message.slice(0, 200) : "failed" });
  }
}

/** Revokes the person's Apple sign-in before their account is deleted. "none" when they never used it. Never throws. */
export async function revokeAppleSignIn(admin: SupabaseClient, userId: string): Promise<"revoked" | "none" | "failed"> {
  try {
    return await revoke(admin, userId);
  } catch (e) {
    log("error", "apple_sign_in.revoke_failed", { user: userId, error: e instanceof Error ? e.message.slice(0, 200) : "failed" });
    return "failed";
  }
}

async function revoke(admin: SupabaseClient, userId: string): Promise<"revoked" | "none" | "failed"> {
  const { data, error } = await admin.from("apple_sign_in_tokens").select("refresh_token").eq("user_id", userId).maybeSingle();
  if (error) {
    log("error", "apple_sign_in.read_failed", { user: userId, error: error.message.slice(0, 200) });
    return "failed";
  }
  const token = z.object({ refresh_token: z.string() }).nullable().parse(data)?.refresh_token;
  if (!token) return "none";
  const key = appleSignInKey();
  if (!key) {
    log("error", "apple_sign_in.revoke_no_key", { user: userId });
    return "failed";
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    const revoked = await revokeAppleToken(key, token).catch(() => false);
    if (revoked) {
      await admin.rpc("app_apple_sign_in_forget", { p_user: userId });
      return "revoked";
    }
  }
  log("error", "apple_sign_in.revoke_failed", { user: userId });
  return "failed";
}
