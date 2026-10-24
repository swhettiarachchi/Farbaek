/**
 * Asking for a sign-in link (ADR 0067). Before Supabase Auth is asked to send
 * anything: the address must be valid, the email address and the network
 * address must be under their limits (counted by hash, never stored as
 * they are), and once Turnstile is switched on there must be a browser check
 * token, which Auth itself verifies with Cloudflare. The reply is the same
 * whether or not the account exists.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { CONTACT } from "@/config/contact";
import { SIGN_IN_LIMITS } from "@/config/sign-in";

export type SignInState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; message: string; email?: string };

export type SendResult = { ok: true } | { ok: false; reason: "rate_limited" | "captcha_failed" | "failed" };
export type LimitResult = "ok" | "limited" | "unavailable";

export interface SignInDeps {
  /** Asks Supabase Auth to email a sign-in link, with the browser check token when there is one. */
  sendLink(email: string, captchaToken: string | null): Promise<SendResult>;
  rateLimit(key: string, windowSeconds: number, limit: number): Promise<LimitResult>;
  /** signInKey("address", …) of the request's network address. */
  addressKey: string;
  /** True once Turnstile is switched on (TURNSTILE_SITE_KEY). */
  captchaRequired: boolean;
}

export const SIGN_IN_MESSAGES = {
  invalidEmail: "Enter a valid email address.",
  tooMany: "Too many sign-in emails were requested. Wait a few minutes and try again.",
  checking: "Your browser is still being checked. Wait a moment, then try again.",
  captchaFailed: `The browser check didn't pass. Reload the page and try again. If it keeps happening, write to ${CONTACT.support}.`,
  unavailable: "Sign-in isn't available right now. Try again in a few minutes.",
  failed: "The sign-in email couldn't be sent. Try again in a moment.",
} as const;

const Email = z.email().max(254);
const Token = z.string().min(1).max(2048);

/** A short one-way key for a limit, so neither address is kept as it is. */
export function signInKey(kind: "email" | "address", value: string): string {
  return `sign-in-${kind}:${createHash("sha256").update(`sign-in-${kind}:${value}`).digest("hex").slice(0, 32)}`;
}

export async function requestSignIn(deps: SignInDeps, input: { email: unknown; captchaToken: unknown }): Promise<SignInState> {
  const raw = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const parsed = Email.safeParse(raw);
  if (!parsed.success) return { status: "error", message: SIGN_IN_MESSAGES.invalidEmail, email: raw };
  const email = parsed.data;

  const token = Token.safeParse(input.captchaToken);
  if (deps.captchaRequired && !token.success) return { status: "error", message: SIGN_IN_MESSAGES.checking, email };

  const { linksPerEmail: e, linksPerAddress: a } = SIGN_IN_LIMITS;
  for (const check of [
    () => deps.rateLimit(signInKey("email", email), e.windowSeconds, e.limit),
    () => deps.rateLimit(deps.addressKey, a.windowSeconds, a.limit),
  ]) {
    const result = await check();
    // Fails closed: if the limiter can't answer, no email is sent.
    if (result === "unavailable") return { status: "error", message: SIGN_IN_MESSAGES.unavailable, email };
    if (result === "limited") return { status: "error", message: SIGN_IN_MESSAGES.tooMany, email };
  }

  const sent = await deps.sendLink(email, token.success ? token.data : null);
  if (!sent.ok) {
    const message = sent.reason === "rate_limited" ? SIGN_IN_MESSAGES.tooMany : sent.reason === "captcha_failed" ? SIGN_IN_MESSAGES.captchaFailed : SIGN_IN_MESSAGES.failed;
    return { status: "error", message, email };
  }
  // Same response whether or not the account already existed.
  return { status: "sent", email };
}
