/**
 * Office Space's database calls (migration v20). Every write is one of the
 * service-role-only app_staff_* functions, which check the role and the
 * session again and record the audit event in the same transaction.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { STAFF_ROLES, type StaffRole } from "@/core/office/permissions";
import type { RequestMeta } from "./request-meta";

export type StoreResult<T> = { ok: true; value: T } | { ok: false; code: OfficeErrorCode };

export const OFFICE_ERROR_CODES = [
  "NOT_STAFF",
  "STAFF_SESSION_ENDED",
  "STAFF_FORBIDDEN",
  "STEP_UP_REQUIRED",
  "REASON_REQUIRED",
  "INVALID_EMAIL",
  "INVALID_ROLE",
  "INVALID_INVITE_WINDOW",
  "ALREADY_STAFF",
  "INVITE_NOT_FOUND",
  "CANNOT_CHANGE_SELF",
  "LAST_OWNER",
  "INVALID_EVENT",
  "UNEXPECTED_RESPONSE",
  "UNKNOWN",
] as const;
export type OfficeErrorCode = (typeof OFFICE_ERROR_CODES)[number];

export const OFFICE_MESSAGES: Record<OfficeErrorCode, string> = {
  NOT_STAFF: "That person isn't on Farbaek's staff.",
  STAFF_SESSION_ENDED: "Your office session has ended. Sign in again.",
  STAFF_FORBIDDEN: "Your role can't do this. An owner can.",
  STEP_UP_REQUIRED: "Enter a fresh code from your authenticator app to do this.",
  REASON_REQUIRED: "Write a reason of 10 to 500 characters. It goes in the audit log.",
  INVALID_EMAIL: "Enter a full email address.",
  INVALID_ROLE: "Choose one of the five roles.",
  INVALID_INVITE_WINDOW: "An invite can last 1 to 7 days.",
  ALREADY_STAFF: "That address is already on the staff.",
  INVITE_NOT_FOUND: "There's no open invite for that address. Ask an owner for a new one.",
  CANNOT_CHANGE_SELF: "You can't change your own role or remove yourself. Ask another owner.",
  LAST_OWNER: "The office must keep at least one owner. Make someone else an owner first.",
  INVALID_EVENT: "That event can't be recorded.",
  UNEXPECTED_RESPONSE: "The database sent something unexpected. Nothing was changed.",
  UNKNOWN: "That didn't work, and nothing was changed. Try again in a moment.",
};

export function officeCodeFromDatabaseError(message: string): OfficeErrorCode {
  return OFFICE_ERROR_CODES.find((code) => code !== "UNKNOWN" && message.includes(code)) ?? "UNKNOWN";
}

const Role = z.enum(STAFF_ROLES);
const Eligibility = z.object({ eligible: z.boolean(), may_create: z.boolean() });
const Begin = z.object({ status: z.enum(["active", "invite_pending", "not_staff"]), role: Role.optional() });
const Check = z.object({
  status: z.enum(["active", "not_staff", "no_session", "ended"]),
  role: Role.optional(),
  reason: z.string().optional(),
  last_seen_at: z.string().optional(),
  first_factor_at: z.string().optional(),
});

export type SessionCheck = z.infer<typeof Check>;
export type BeginResult = z.infer<typeof Begin>;

export interface StaffActor {
  userId: string;
  sessionId: string;
}

export type AuthStrength = "aal1" | "aal2" | "step_up" | "system";

export interface StaffStore {
  rateLimit(key: string, windowSeconds: number, limit: number): Promise<boolean>;
  eligibility(email: string, bootstrapEmail: string | null): Promise<StoreResult<z.infer<typeof Eligibility>>>;
  mayEnroll(userId: string, bootstrapEmail: string | null): Promise<boolean>;
  noteEnrollment(actor: StaffActor, meta: RequestMeta): Promise<StoreResult<null>>;
  beginSession(actor: StaffActor, firstFactorAt: Date, meta: RequestMeta, bootstrapEmail: string | null): Promise<StoreResult<BeginResult>>;
  acceptInvite(actor: StaffActor, firstFactorAt: Date, meta: RequestMeta): Promise<StoreResult<BeginResult>>;
  checkSession(actor: StaffActor): Promise<StoreResult<SessionCheck>>;
  endSession(actor: StaffActor, meta: RequestMeta): Promise<StoreResult<null>>;
  endSessions(actor: StaffActor, target: string, reason: string | null, meta: RequestMeta): Promise<StoreResult<number>>;
  invite(actor: StaffActor, input: { email: string; role: StaffRole; days: number; reason: string }, strength: AuthStrength, meta: RequestMeta): Promise<StoreResult<string>>;
  revokeInvite(actor: StaffActor, inviteId: string, reason: string, meta: RequestMeta): Promise<StoreResult<null>>;
  changeRole(actor: StaffActor, target: string, role: StaffRole, reason: string, strength: AuthStrength, meta: RequestMeta): Promise<StoreResult<null>>;
  remove(actor: StaffActor, target: string, reason: string, strength: AuthStrength, meta: RequestMeta): Promise<StoreResult<null>>;
  allowMfaReset(actor: StaffActor, target: string, reason: string, strength: AuthStrength, meta: RequestMeta): Promise<StoreResult<null>>;
  record(
    actor: { userId: string | null; sessionId: string | null },
    event: { strength: AuthStrength; action: string; targetType?: string; targetId?: string; result: "success" | "denied" | "error"; detail?: Record<string, unknown> },
    meta: RequestMeta | null,
  ): Promise<StoreResult<number>>;
  recordVerification(actor: StaffActor, check: { throughSeq: number; headHash: string | null; ok: boolean; firstBadSeq: number | null }): Promise<StoreResult<null>>;
}

export function createStaffStore(admin: SupabaseClient): StaffStore {
  async function rpc<T>(fn: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<StoreResult<T>> {
    const { data, error } = await admin.rpc(fn, args);
    if (error) return { ok: false, code: officeCodeFromDatabaseError(error.message) };
    const parsed = schema.safeParse(data);
    return parsed.success ? { ok: true, value: parsed.data } : { ok: false, code: "UNEXPECTED_RESPONSE" };
  }
  const nothing = z.any().transform(() => null);
  const m = (meta: RequestMeta | null) => ({ p_ip_hash: meta?.ipHash ?? null, p_ua: meta?.userAgent ?? null });

  return {
    async rateLimit(key, windowSeconds, limit) {
      const { data, error } = await admin.rpc("app_rate_limit", { p_key: key, p_window_seconds: windowSeconds, p_limit: limit });
      // Fails closed: if the limiter can't answer, the request is refused.
      return !error && data === true;
    },
    eligibility: (email, bootstrapEmail) => rpc("app_staff_sign_in_eligibility", { p_email: email, p_bootstrap_email: bootstrapEmail }, Eligibility),
    async mayEnroll(userId, bootstrapEmail) {
      const r = await rpc("app_staff_may_enroll", { p_user: userId, p_bootstrap_email: bootstrapEmail }, z.boolean());
      return r.ok && r.value;
    },
    noteEnrollment: (a, meta) => rpc("app_staff_note_enrollment", { p_user: a.userId, p_session: a.sessionId, ...m(meta) }, nothing),
    beginSession: (a, first, meta, boot) =>
      rpc("app_staff_begin_session", { p_user: a.userId, p_session: a.sessionId, p_first_factor_at: first.toISOString(), ...m(meta), p_bootstrap_email: boot }, Begin),
    acceptInvite: (a, first, meta) => rpc("app_staff_accept_invite", { p_user: a.userId, p_session: a.sessionId, p_first_factor_at: first.toISOString(), ...m(meta) }, Begin),
    checkSession: (a) => rpc("app_staff_check_session", { p_user: a.userId, p_session: a.sessionId }, Check),
    endSession: (a, meta) => rpc("app_staff_end_session", { p_user: a.userId, p_session: a.sessionId, ...m(meta) }, nothing),
    endSessions: (a, target, reason, meta) => rpc("app_staff_end_sessions", { p_actor: a.userId, p_session: a.sessionId, p_target: target, p_reason: reason, ...m(meta) }, z.number().int()),
    invite: (a, i, strength, meta) =>
      rpc("app_staff_invite", { p_actor: a.userId, p_session: a.sessionId, p_email: i.email, p_role: i.role, p_days: i.days, p_reason: i.reason, p_auth_strength: strength, ...m(meta) }, z.string().uuid()),
    revokeInvite: (a, id, reason, meta) => rpc("app_staff_revoke_invite", { p_actor: a.userId, p_session: a.sessionId, p_invite: id, p_reason: reason, ...m(meta) }, nothing),
    changeRole: (a, target, role, reason, strength, meta) =>
      rpc("app_staff_change_role", { p_actor: a.userId, p_session: a.sessionId, p_target: target, p_role: role, p_reason: reason, p_auth_strength: strength, ...m(meta) }, nothing),
    remove: (a, target, reason, strength, meta) =>
      rpc("app_staff_remove", { p_actor: a.userId, p_session: a.sessionId, p_target: target, p_reason: reason, p_auth_strength: strength, ...m(meta) }, nothing),
    allowMfaReset: (a, target, reason, strength, meta) =>
      rpc("app_staff_allow_mfa_reset", { p_actor: a.userId, p_session: a.sessionId, p_target: target, p_reason: reason, p_auth_strength: strength, ...m(meta) }, nothing),
    record: (actor, e, meta) =>
      rpc(
        "app_record_staff_event",
        {
          p_actor: actor.userId,
          p_session: actor.sessionId,
          p_strength: e.strength,
          p_action: e.action,
          p_target_type: e.targetType ?? null,
          p_target_id: e.targetId ?? null,
          p_result: e.result,
          p_detail: e.detail ?? {},
          ...m(meta),
          p_request: meta?.requestId ?? null,
        },
        z.coerce.number(),
      ),
    recordVerification: (a, c) =>
      rpc(
        "app_staff_record_verification",
        { p_actor: a.userId, p_session: a.sessionId, p_through_seq: c.throughSeq, p_head_hash: c.headHash, p_ok: c.ok, p_first_bad_seq: c.firstBadSeq },
        nothing,
      ),
  };
}
