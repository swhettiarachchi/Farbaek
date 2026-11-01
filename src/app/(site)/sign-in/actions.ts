"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { turnstileSiteKey } from "@/server/auth/captcha";
import { passwordSignInKey, signInWithPassword, type PasswordSignInState } from "@/server/auth/password-sign-in";
import { requestSignIn, signInKey, type LimitResult, type SignInState } from "@/server/auth/sign-in";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { safeNextPath, siteUrl } from "@/server/supabase/config";
import { createSupabaseServerClient } from "@/server/supabase/server";

export async function requestSignInLink(_previous: SignInState, form: FormData): Promise<SignInState> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", message: "Sign-in isn't connected in this environment yet.", email: String(form.get("email") ?? "").trim() };
  const admin = createSupabaseAdminClient();
  const next = safeNextPath(String(form.get("next") ?? ""));
  // Caddy sets X-Forwarded-For from the connection, so its first entry is the visitor's address.
  const h = await headers();
  const address = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "unknown";

  return requestSignIn(
    {
      captchaRequired: turnstileSiteKey() !== null,
      addressKey: signInKey("address", address),
      async rateLimit(key, windowSeconds, limit) {
        if (!admin) return "unavailable";
        const { data, error } = await admin.rpc("app_rate_limit", { p_key: key, p_window_seconds: windowSeconds, p_limit: limit });
        if (error) return "unavailable";
        return data === true ? "ok" : "limited";
      },
      async sendLink(email, captchaToken) {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
            shouldCreateUser: true,
            ...(captchaToken ? { captchaToken } : {}),
          },
        });
        if (!error) return { ok: true };
        if (error.status === 429) return { ok: false, reason: "rate_limited" };
        if (error.code === "captcha_failed") return { ok: false, reason: "captcha_failed" };
        return { ok: false, reason: "failed" };
      },
    },
    { email: form.get("email"), captchaToken: form.get("captchaToken") },
  );
}

/** Signing in with a password (ADR 0151): only accounts Farbaek set up with one, such as app store review accounts. */
export async function signInWithPasswordAction(_previous: PasswordSignInState, form: FormData): Promise<PasswordSignInState> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", message: "Sign-in isn't connected in this environment yet.", email: String(form.get("email") ?? "").trim() };
  const admin = createSupabaseAdminClient();
  const next = safeNextPath(String(form.get("next") ?? ""));
  const h = await headers();
  const address = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "unknown";

  const state = await signInWithPassword(
    {
      captchaRequired: turnstileSiteKey() !== null,
      addressKey: passwordSignInKey("address", address),
      async rateLimit(key, windowSeconds, limit): Promise<LimitResult> {
        if (!admin) return "unavailable";
        const { data, error } = await admin.rpc("app_rate_limit", { p_key: key, p_window_seconds: windowSeconds, p_limit: limit });
        if (error) return "unavailable";
        return data === true ? "ok" : "limited";
      },
      async signIn(email, password, captchaToken) {
        const { error } = await supabase.auth.signInWithPassword({ email, password, ...(captchaToken ? { options: { captchaToken } } : {}) });
        if (!error) return { ok: true };
        if (error.status === 429) return { ok: false, reason: "rate_limited" };
        if (error.code === "captcha_failed") return { ok: false, reason: "captcha_failed" };
        // Wrong password, no such account, no password set or not confirmed: one answer, so none can be told apart.
        if (error.status === 400 || error.code === "invalid_credentials" || error.code === "email_not_confirmed") return { ok: false, reason: "wrong" };
        return { ok: false, reason: "failed" };
      },
    },
    { email: form.get("email"), password: form.get("password"), captchaToken: form.get("captchaToken") },
  );
  if (state === null) redirect(next);
  return state;
}
