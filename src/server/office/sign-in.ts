/**
 * Signing in to Office Space (ADR 0032): an email code, then a code from an
 * authenticator app. Every step runs on the server, against the office's
 * own cookie. A code is only sent to staff, open invites and, while the
 * office has no owner, the first owner's address, but the reply is always
 * the same, so the form doesn't reveal who works at Farbaek.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { OFFICE_SIGN_IN_LIMITS } from "@/config/office";
import { firstFactorAt } from "@/core/office/session-policy";
import type { OfficeConfig } from "./config";
import type { RequestMeta } from "./request-meta";
import type { StaffStore } from "./staff-store";

/** The parts of the Supabase auth client the sign-in uses. */
export interface OfficeAuth {
  sendCode(email: string, shouldCreateUser: boolean, redirectTo: string): Promise<{ ok: boolean; rateLimited?: boolean }>;
  verifyCode(email: string, code: string): Promise<boolean>;
  claims(): Promise<{ sub: string; session_id: string | null; aal: string | null; amr: unknown; email: string | null } | null>;
  verifiedTotp(): Promise<{ id: string; friendlyName: string | null }[]>;
  unverifiedFactorIds(): Promise<string[]>;
  enroll(friendlyName: string): Promise<{ id: string; qr: string; secret: string; uri: string } | null>;
  unenroll(factorId: string): Promise<void>;
  verifyTotp(factorId: string, code: string): Promise<boolean>;
  signOut(): Promise<void>;
}

export interface SignInDeps {
  auth: OfficeAuth;
  store: StaffStore;
  office: OfficeConfig;
  meta: RequestMeta;
  now: () => Date;
  /** This browser's device (ADR 0069). Opening a session needs it; the other steps don't. */
  device?: { hash: string; label: string } | null;
}

export const CODE_SENT_MESSAGE = "If this address belongs to Farbaek staff, a 6-digit code is on its way. It works for an hour.";
export const SIGN_IN_PAUSED = "Too many attempts. Wait 15 minutes, then try again.";

const Email = z.email().max(254);
const Code = z.string().regex(/^\d{6}$/);

export function emailKey(email: string): string {
  return createHash("sha256").update(`office-email:${email.toLowerCase()}`).digest("hex").slice(0, 32);
}

export type CodeRequest = { status: "sent"; email: string } | { status: "error"; message: string; email: string };

export async function requestStaffCode(deps: SignInDeps, rawEmail: unknown): Promise<CodeRequest> {
  const given = typeof rawEmail === "string" ? rawEmail.trim() : "";
  const parsed = Email.safeParse(given.toLowerCase());
  if (!parsed.success) return { status: "error", message: "Enter your full work email address.", email: given };
  const email = parsed.data;

  const { codesPerEmail: e, codesPerIp: i } = OFFICE_SIGN_IN_LIMITS;
  const allowed =
    (await deps.store.rateLimit(`office-code:${emailKey(email)}`, e.windowSeconds, e.limit)) &&
    (await deps.store.rateLimit(`office-code-ip:${deps.meta.ipHash}`, i.windowSeconds, i.limit));
  if (!allowed) return { status: "error", message: SIGN_IN_PAUSED, email };

  const eligible = await deps.store.eligibility(email, deps.office.ownerEmail);
  if (eligible.ok && eligible.value.eligible) {
    const sent = await deps.auth.sendCode(email, eligible.value.may_create, `${deps.office.origin}/sign-in`);
    await deps.store.record(
      { userId: null, sessionId: null },
      { strength: "system", action: sent.ok ? "auth.code_sent" : "auth.code_not_sent", targetType: "email", targetId: emailKey(email), result: sent.ok ? "success" : "error" },
      deps.meta,
    );
    // Our own Supabase Auth sends one email per address a minute (its SMTP max frequency).
    if (!sent.ok && sent.rateLimited) return { status: "error", message: "A code was sent to this address moments ago. Wait a minute, then ask for a new one.", email };
  }
  return { status: "sent", email };
}

export type CodeCheck = { status: "verify" } | { status: "enroll" } | { status: "not_staff" } | { status: "error"; message: string };

export async function verifyStaffCode(deps: SignInDeps, rawEmail: unknown, rawCode: unknown): Promise<CodeCheck> {
  const email = Email.safeParse(typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "");
  const code = Code.safeParse(typeof rawCode === "string" ? rawCode.replace(/\s+/g, "") : "");
  if (!email.success) return { status: "error", message: "Start again with your email address." };
  if (!code.success) return { status: "error", message: "Enter the 6 digits from the email." };

  const w = OFFICE_SIGN_IN_LIMITS.wrongCodesPerEmail;
  if (!(await deps.store.rateLimit(`office-verify:${emailKey(email.data)}`, w.windowSeconds, w.limit))) return { status: "error", message: SIGN_IN_PAUSED };

  if (!(await deps.auth.verifyCode(email.data, code.data))) {
    await deps.store.record({ userId: null, sessionId: null }, { strength: "system", action: "auth.code_failed", targetType: "email", targetId: emailKey(email.data), result: "denied" }, deps.meta);
    return { status: "error", message: "That code didn't work. Use the newest email, or ask for a new code." };
  }
  const claims = await deps.auth.claims();
  if (!claims) return { status: "error", message: "The sign-in didn't stick. Try again." };
  await deps.store.record({ userId: claims.sub, sessionId: claims.session_id }, { strength: "aal1", action: "auth.code_verified", targetType: "staff", targetId: claims.sub, result: "success" }, deps.meta);

  if ((await deps.auth.verifiedTotp()).length > 0) return { status: "verify" };
  if (await deps.store.mayEnroll(claims.sub, deps.office.ownerEmail)) return { status: "enroll" };
  await deps.auth.signOut();
  return { status: "not_staff" };
}

export type Enrollment = { status: "ready"; factorId: string; qr: string; secret: string; uri: string } | { status: "error"; message: string } | { status: "sign_in" };

/** Starts adding an authenticator. Only someone signed in with an email code who may enroll gets one. */
export async function startEnrollment(deps: SignInDeps): Promise<Enrollment> {
  const claims = await deps.auth.claims();
  if (!claims || !firstFactorAt(claims.amr)) return { status: "sign_in" };
  const hasFactor = (await deps.auth.verifiedTotp()).length > 0;
  if (!hasFactor && !(await deps.store.mayEnroll(claims.sub, deps.office.ownerEmail))) return { status: "sign_in" };
  if (hasFactor && claims.aal !== "aal2") return { status: "sign_in" };
  for (const id of await deps.auth.unverifiedFactorIds()) await deps.auth.unenroll(id);
  const factor = await deps.auth.enroll(`Office Space ${deps.now().toISOString().slice(0, 10)}`);
  return factor ? { status: "ready", factorId: factor.id, ...factor } : { status: "error", message: "The authenticator couldn't be set up. Try again." };
}

export type SecondStep =
  | { status: "in"; welcome: boolean }
  | { status: "device"; code: string }
  | { status: "not_staff" }
  | { status: "error"; message: string }
  | { status: "sign_in" };

export const DEVICE_CHECK_FAILED = "Office Space couldn't check this device. Nothing was opened. Try again.";

/** Checks an authenticator code (the first one after enrolling, or the usual one), then opens the office session. */
export async function verifySecondFactor(deps: SignInDeps, factorId: string | null, rawCode: unknown, enrolling: boolean): Promise<SecondStep> {
  const code = Code.safeParse(typeof rawCode === "string" ? rawCode.replace(/\s+/g, "") : "");
  if (!code.success) return { status: "error", message: "Enter the 6 digits from your authenticator app." };
  const claims = await deps.auth.claims();
  if (!claims) return { status: "sign_in" };
  const w = OFFICE_SIGN_IN_LIMITS.wrongCodesPerEmail;
  if (!(await deps.store.rateLimit(`office-totp:${claims.sub}`, w.windowSeconds, w.limit))) return { status: "error", message: SIGN_IN_PAUSED };

  const id = enrolling ? factorId : ((await deps.auth.verifiedTotp())[0]?.id ?? null);
  if (!id) return { status: "sign_in" };
  if (!(await deps.auth.verifyTotp(id, code.data))) {
    await deps.store.record({ userId: claims.sub, sessionId: claims.session_id }, { strength: "aal1", action: "auth.totp_failed", targetType: "staff", targetId: claims.sub, result: "denied" }, deps.meta);
    return { status: "error", message: "That code didn't work. Codes change every 30 seconds: use the current one." };
  }
  return openSession(deps, enrolling);
}

/**
 * After an authenticator code: checks the device (ADR 0069), then starts the
 * office session, joining from an invite if there is one. A device that isn't
 * trusted yet gets its approval code instead, and no session.
 */
export async function openSession(deps: SignInDeps, enrolled: boolean): Promise<SecondStep> {
  const claims = await deps.auth.claims();
  const first = claims ? firstFactorAt(claims.amr) : null;
  if (!claims || claims.aal !== "aal2" || !claims.session_id || !first) return { status: "sign_in" };
  const actor = { userId: claims.sub, sessionId: claims.session_id };
  if (enrolled) await deps.store.noteEnrollment(actor, deps.meta);

  if (!deps.device) return { status: "error", message: DEVICE_CHECK_FAILED };
  const device = await deps.store.checkDevice(claims.sub, deps.device, deps.office.ownerEmail, deps.meta);
  if (!device.ok) return { status: "error", message: DEVICE_CHECK_FAILED };
  if (device.value.status === "not_staff") {
    await deps.auth.signOut();
    return { status: "not_staff" };
  }
  if (device.value.status === "pending") return device.value.code ? { status: "device", code: device.value.code } : { status: "error", message: DEVICE_CHECK_FAILED };

  const begun = await deps.store.beginSession(actor, first, deps.meta, deps.office.ownerEmail);
  if (!begun.ok) return { status: "error", message: "The office session couldn't start. Sign in again." };
  if (begun.value.status === "active") return { status: "in", welcome: enrolled };
  if (begun.value.status === "invite_pending") {
    const joined = await deps.store.acceptInvite(actor, first, deps.meta);
    if (joined.ok && joined.value.status === "active") return { status: "in", welcome: true };
  }
  await deps.auth.signOut();
  return { status: "not_staff" };
}
