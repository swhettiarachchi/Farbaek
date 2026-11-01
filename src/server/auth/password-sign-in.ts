/**
 * Signing in with a password (ADR 0151), for the few accounts Farbaek sets up
 * with one: the review accounts app stores ask for, whose reviewers can't
 * open an email link. Every other account has no password, so for them this
 * always fails, and the email link stays the way in.
 *
 * Before Supabase Auth checks the password: the address must be valid, the
 * email address and the network address must be under their own limits
 * (counted by hash), and once Turnstile is on there must be a browser check
 * token. It fails closed when the limiter can't answer, and the reply never
 * says whether the account exists or has a password.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { CONTACT } from "@/config/contact";
import { SIGN_IN_LIMITS } from "@/config/sign-in";
import type { LimitResult } from "./sign-in";

export type PasswordSignInState = { status: "idle" } | { status: "error"; message: string; email?: string };

export type PasswordResult = { ok: true } | { ok: false; reason: "wrong" | "rate_limited" | "captcha_failed" | "failed" };

export interface PasswordSignInDeps {
  /** Asks Supabase Auth to sign in with the password, and sets the session cookie when it does. */
  signIn(email: string, password: string, captchaToken: string | null): Promise<PasswordResult>;
  rateLimit(key: string, windowSeconds: number, limit: number): Promise<LimitResult>;
  /** passwordSignInKey("address", …) of the request's network address. */
  addressKey: string;
  /** True once Turnstile is switched on (TURNSTILE_SITE_KEY). */
  captchaRequired: boolean;
}

export const PASSWORD_MESSAGES = {
  invalidEmail: "Enter a valid email address.",
  missingPassword: "Enter the account's password.",
  wrong: "That email address and password don't match an account with a password. Accounts without one sign in with an email link.",
  tooMany: "Too many sign-in attempts. Wait 15 minutes and try again.",
  checking: "Your browser is still being checked. Wait a moment, then try again.",
  captchaFailed: `The browser check didn't pass. Reload the page and try again. If it keeps happening, write to ${CONTACT.support}.`,
  unavailable: "Sign-in isn't available right now. Try again in a few minutes.",
  failed: "Signing in didn't work. Try again in a moment.",
} as const;

const Email = z.email().max(254);
const Password = z.string().min(1).max(128);
const Token = z.string().min(1).max(2048);

/** A short one-way key for a limit, kept apart from the email link's counts. */
export function passwordSignInKey(kind: "email" | "address", value: string): string {
  return `password-sign-in-${kind}:${createHash("sha256").update(`password-sign-in-${kind}:${value}`).digest("hex").slice(0, 32)}`;
}

/** Returns null once signed in; otherwise the form's error. */
export async function signInWithPassword(
  deps: PasswordSignInDeps,
  input: { email: unknown; password: unknown; captchaToken: unknown },
): Promise<PasswordSignInState | null> {
  const raw = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const parsed = Email.safeParse(raw);
  if (!parsed.success) return { status: "error", message: PASSWORD_MESSAGES.invalidEmail, email: raw };
  const email = parsed.data;

  const password = Password.safeParse(input.password);
  if (!password.success) return { status: "error", message: PASSWORD_MESSAGES.missingPassword, email };

  const token = Token.safeParse(input.captchaToken);
  if (deps.captchaRequired && !token.success) return { status: "error", message: PASSWORD_MESSAGES.checking, email };

  const { passwordsPerEmail: e, passwordsPerAddress: a } = SIGN_IN_LIMITS;
  for (const check of [
    () => deps.rateLimit(passwordSignInKey("email", email), e.windowSeconds, e.limit),
    () => deps.rateLimit(deps.addressKey, a.windowSeconds, a.limit),
  ]) {
    const result = await check();
    // Fails closed: if the limiter can't answer, the password isn't tried.
    if (result === "unavailable") return { status: "error", message: PASSWORD_MESSAGES.unavailable, email };
    if (result === "limited") return { status: "error", message: PASSWORD_MESSAGES.tooMany, email };
  }

  const result = await deps.signIn(email, password.data, token.success ? token.data : null);
  if (result.ok) return null;
  const message =
    result.reason === "wrong"
      ? PASSWORD_MESSAGES.wrong
      : result.reason === "rate_limited"
        ? PASSWORD_MESSAGES.tooMany
        : result.reason === "captcha_failed"
          ? PASSWORD_MESSAGES.captchaFailed
          : PASSWORD_MESSAGES.failed;
  return { status: "error", message, email };
}
