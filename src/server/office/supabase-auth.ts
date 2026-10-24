/**
 * The office's OfficeAuth (./sign-in.ts) on the office's own Supabase client.
 * Codes are sent with the server's secret key when one is given (`sender`):
 * Supabase Auth doesn't ask that key for a browser check (ADR 0067), and the
 * office has already limited and screened the request.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "@/server/observability/log";
import type { OfficeAuth } from "./sign-in";

export function officeAuth(client: SupabaseClient, sender: SupabaseClient = client): OfficeAuth {
  return {
    async sendCode(email, shouldCreateUser, redirectTo) {
      const { error } = await sender.auth.signInWithOtp({ email, options: { shouldCreateUser, emailRedirectTo: redirectTo } });
      return error ? { ok: false, rateLimited: error.status === 429 } : { ok: true };
    },
    async verifyCode(email, code) {
      const { error } = await client.auth.verifyOtp({ email, token: code, type: "email" });
      return !error;
    },
    async claims() {
      const { data } = await client.auth.getClaims();
      const c = data?.claims;
      if (!c || typeof c.sub !== "string") return null;
      return {
        sub: c.sub,
        session_id: typeof c.session_id === "string" ? c.session_id : null,
        aal: typeof c.aal === "string" ? c.aal : null,
        amr: c.amr,
        email: typeof c.email === "string" ? c.email : null,
      };
    },
    async verifiedTotp() {
      const { data } = await client.auth.mfa.listFactors();
      return (data?.totp ?? []).filter((f) => f.status === "verified").map((f) => ({ id: f.id, friendlyName: f.friendly_name ?? null }));
    },
    async unverifiedFactorIds() {
      const { data } = await client.auth.mfa.listFactors();
      return (data?.all ?? []).filter((f) => f.status === "unverified").map((f) => f.id);
    },
    async enroll(friendlyName) {
      const { data, error } = await client.auth.mfa.enroll({ factorType: "totp", friendlyName, issuer: "Farbaek Office Space" });
      if (error || !data || data.type !== "totp") {
        // The reason Supabase Auth gave, for the server log only: never a secret, and never shown.
        log("warn", "office.mfa_enroll_failed", { code: error?.code ?? null, status: error?.status ?? null });
        return null;
      }
      return { id: data.id, qr: data.totp.qr_code, secret: data.totp.secret, uri: data.totp.uri };
    },
    async unenroll(factorId) {
      await client.auth.mfa.unenroll({ factorId });
    },
    async verifyTotp(factorId, code) {
      const { error } = await client.auth.mfa.challengeAndVerify({ factorId, code });
      return !error;
    },
    async signOut() {
      await client.auth.signOut({ scope: "local" });
    },
  };
}
