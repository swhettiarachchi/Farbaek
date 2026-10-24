"use server";

import { headers } from "next/headers";
import { turnstileSiteKey } from "@/server/auth/captcha";
import { requestSignIn, signInKey, type SignInState } from "@/server/auth/sign-in";
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
