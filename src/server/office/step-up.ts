/**
 * A fresh authenticator code for a severe office action (ADR 0032),
 * checked in the same request as the action, so the code and the action go
 * together. Each code works once, and wrong codes are limited.
 */
import { createHash } from "node:crypto";
import { OFFICE_SIGN_IN_LIMITS } from "@/config/office";
import type { StaffContext } from "./access";
import type { RequestMeta } from "./request-meta";
import { officeAuth } from "./supabase-auth";

export type StepUp = { ok: true } | { ok: false; message: string };

export async function verifyStepUp(ctx: StaffContext, rawCode: unknown, meta: RequestMeta): Promise<StepUp> {
  const code = typeof rawCode === "string" ? rawCode.replace(/\s+/g, "") : "";
  if (!/^\d{6}$/.test(code)) return { ok: false, message: "Enter the 6-digit code from your authenticator app." };
  const w = OFFICE_SIGN_IN_LIMITS.wrongCodesPerEmail;
  if (!(await ctx.store.rateLimit(`office-stepup-tries:${ctx.user.id}`, w.windowSeconds, w.limit))) return { ok: false, message: "Too many codes. Wait 15 minutes, then try again." };
  const once = createHash("sha256").update(`${ctx.user.id}:${code}`).digest("hex").slice(0, 32);
  if (!(await ctx.store.rateLimit(`office-stepup-used:${once}`, 300, 1))) return { ok: false, message: "That code was already used. Wait for the next one." };

  const auth = officeAuth(ctx.client);
  for (const factor of await auth.verifiedTotp()) {
    if (await auth.verifyTotp(factor.id, code)) return { ok: true };
  }
  await ctx.store.record({ userId: ctx.user.id, sessionId: ctx.sessionId }, { strength: "aal2", action: "auth.step_up_failed", targetType: "staff", targetId: ctx.user.id, result: "denied" }, meta);
  return { ok: false, message: "That code didn't work. Codes change every 30 seconds: use the current one." };
}
