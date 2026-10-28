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
  "WORKSPACE_MISSING",
  "CONFIRM_NAME_MISMATCH",
  "ALREADY_SUSPENDED",
  "NOT_SUSPENDED",
  "NOTICE_REQUIRED",
  "SITE_MISSING",
  "ALREADY_BLOCKED",
  "NOT_BLOCKED",
  "INVALID_UNITS",
  "USAGE_CAP",
  "INVALID_EXPIRY",
  "INVALID_FLAG",
  "INVALID_ANNOUNCEMENT",
  "ANNOUNCEMENT_MISSING",
  "INVALID_DAYS",
  "TRIAL_CAP",
  "NO_TRIAL",
  "ALREADY_EXTENDED",
  "TRIAL_LIMIT",
  "THREAD_MISSING",
  "INVALID_SUPPORT",
  "INVALID_DEVICE",
  "DEVICE_NOT_TRUSTED",
  "DEVICE_NOT_WAITING",
  "DEVICE_NOT_FOUND",
  "LAST_DEVICE",
  "CANARY_RUNNING",
  "CANARY_LIMIT",
  "CANARY_REQUIRED",
  "NOTHING_TO_CHANGE",
  "UNPRICED_MODEL",
  "PRODUCT_EXISTS",
  "NOT_REPLAYABLE",
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
  WORKSPACE_MISSING: "That workspace doesn't exist any more.",
  CONFIRM_NAME_MISMATCH: "Type the workspace's name exactly as shown to confirm.",
  ALREADY_SUSPENDED: "This workspace is already suspended.",
  NOT_SUSPENDED: "This workspace isn't suspended.",
  NOTICE_REQUIRED: "Write the notice people will see, 10 characters or more.",
  SITE_MISSING: "That site doesn't exist any more.",
  ALREADY_BLOCKED: "This site is already offline.",
  NOT_BLOCKED: "This site isn't blocked.",
  INVALID_UNITS: "Add at least 1,000 units ($0.10 of list cost).",
  USAGE_CAP: "That's more than your role can add at once. An owner can add more.",
  INVALID_EXPIRY: "AI usage added by Farbaek expires within 1 to 90 days.",
  INVALID_FLAG: "That switch doesn't exist.",
  INVALID_ANNOUNCEMENT: "Write 10 to 280 characters, pick a tone, and an end time in the future if you set one.",
  ANNOUNCEMENT_MISSING: "That announcement already ended.",
  INVALID_DAYS: "Choose how many days to add.",
  TRIAL_CAP: "That's more days than your role can add. Support can add 7, admins 14 and owners 30.",
  NO_TRIAL: "This workspace never had a trial, so there's nothing to extend.",
  ALREADY_EXTENDED: "This trial was already extended. An admin or owner can add more.",
  TRIAL_LIMIT: "A trial can't run past 44 days from its start. Choose fewer days.",
  THREAD_MISSING: "That support request no longer exists.",
  INVALID_SUPPORT: "Write a reply of up to 4,000 characters.",
  INVALID_DEVICE: "This browser's device key is missing. Reload the page and sign in again.",
  DEVICE_NOT_TRUSTED: "Approve devices from one you already trust.",
  DEVICE_NOT_WAITING: "That device isn't waiting any more. On it, sign in again for a new code.",
  DEVICE_NOT_FOUND: "That device isn't on your list any more.",
  LAST_DEVICE: "This is your only trusted device, so it stays. Add another device first, then remove this one.",
  CANARY_RUNNING: "A canary is already running. Wait for its report.",
  CANARY_LIMIT: "Three canaries ran in the last 24 hours, which is the most a day. Try again tomorrow.",
  CANARY_REQUIRED: "Switch only to a candidate a finished canary compared with this tier in the last 7 days. Run one first.",
  NOTHING_TO_CHANGE: "This tier already uses its default model.",
  UNPRICED_MODEL: "Farbaek has no price for that model yet, so it can't serve customers. Add it to the rate card first (a code change).",
  PRODUCT_EXISTS: "This plan already has a product for the current price list. Nothing was added.",
  NOT_REPLAYABLE: "Only a failed or dead event can be replayed. This one is already queued or done.",
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
  // Controls (migration v21)
  suspendWorkspace(actor: StaffActor, input: { orgId: string; confirmName: string; notice: string; reason: string }, meta: RequestMeta): Promise<StoreResult<null>>;
  restoreWorkspace(actor: StaffActor, input: { orgId: string; reason: string }, meta: RequestMeta): Promise<StoreResult<null>>;
  blockSite(actor: StaffActor, input: { siteId: string; notice: string; reason: string }, meta: RequestMeta): Promise<StoreResult<null>>;
  unblockSite(actor: StaffActor, input: { siteId: string; reason: string }, meta: RequestMeta): Promise<StoreResult<null>>;
  addUsage(actor: StaffActor, input: { orgId: string; units: number; days: number; reason: string }, strength: AuthStrength, meta: RequestMeta): Promise<StoreResult<string>>;
  setFlag(actor: StaffActor, input: { key: string; paused: boolean; message: string | null; reason: string }, strength: AuthStrength, meta: RequestMeta): Promise<StoreResult<null>>;
  // The Model Change Canary (migration v57, ADR 0090)
  startCanary(actor: StaffActor, input: { tier: string; current: string; candidate: string; estimateUnits: number; reason: string }, meta: RequestMeta): Promise<StoreResult<string>>;
  setModel(actor: StaffActor, input: { tier: string; model: string | null; canaryId: string | null; reason: string }, strength: AuthStrength, meta: RequestMeta): Promise<StoreResult<null>>;
  // Payments (migration v62, ADR 0100)
  recordBillingProduct(actor: StaffActor, input: { mode: "test" | "live"; planId: string; productId: string; amountCents: number; currency: string; catalogVersion: string }, meta: RequestMeta): Promise<StoreResult<null>>;
  replayWebhook(actor: StaffActor, input: { id: string }, meta: RequestMeta): Promise<StoreResult<null>>;
  // Top-up packs (migration v64, ADR 0102)
  recordTopupProduct(actor: StaffActor, input: { mode: "test" | "live"; packCents: number; productId: string; catalogVersion: string }, meta: RequestMeta): Promise<StoreResult<null>>;
  publishAnnouncement(actor: StaffActor, input: { message: string; tone: "info" | "incident"; dismissible: boolean; endsAt: string | null; reason: string }, meta: RequestMeta): Promise<StoreResult<string>>;
  endAnnouncement(actor: StaffActor, input: { id: string; reason: string }, meta: RequestMeta): Promise<StoreResult<null>>;
  // Phase 3 (migration v22)
  extendTrial(actor: StaffActor, input: { orgId: string; days: number; reason: string }, meta: RequestMeta): Promise<StoreResult<string>>;
  // Phase 4 (migration v23)
  supportReply(actor: StaffActor, input: { threadId: string; body: string; internal: boolean }, meta: RequestMeta): Promise<StoreResult<null>>;
  supportUpdate(actor: StaffActor, input: { threadId: string; action: "assign_me" | "unassign" | "close" | "reopen" }, meta: RequestMeta): Promise<StoreResult<null>>;
  // Trusted devices (migration v41)
  checkDevice(userId: string, device: { hash: string; label: string }, bootstrapEmail: string | null, meta: RequestMeta): Promise<StoreResult<DeviceCheck>>;
  deviceTrusted(userId: string, hash: string): Promise<boolean>;
  listDevices(userId: string): Promise<StoreResult<StaffDevice[]>>;
  approveDevice(actor: StaffActor, input: { fromHash: string; deviceId: string; code: string }, strength: AuthStrength, meta: RequestMeta): Promise<StoreResult<{ ok: boolean; tries_left?: number }>>;
  revokeDevice(actor: StaffActor, deviceId: string, meta: RequestMeta): Promise<StoreResult<null>>;
  // The hidden office (migration v44)
  createDeviceInvite(actor: StaffActor, input: { fromHash: string; codeHash: string }, strength: AuthStrength, meta: RequestMeta): Promise<StoreResult<string>>;
  redeemDeviceInvite(codeHash: string, device: { hash: string; label: string }, meta: RequestMeta): Promise<StoreResult<boolean>>;
}

const DeviceCheckSchema = z.object({
  status: z.enum(["trusted", "pending", "not_staff"]),
  device: z.string().uuid().optional(),
  code: z.string().regex(/^\d{6}$/).optional(),
  first: z.boolean().optional(),
});
export type DeviceCheck = z.infer<typeof DeviceCheckSchema>;

const DeviceRow = z.object({
  id: z.string().uuid(),
  token_hash: z.string(),
  label: z.string(),
  requested_at: z.string(),
  approved_at: z.string().nullable(),
  approved_via: z.string().nullable(),
  revoked_at: z.string().nullable(),
  last_seen_at: z.string(),
  request_code: z.string().nullable(),
});

/** A device as the person's own Security page shows it. The waiting code never leaves the server. */
export interface StaffDevice {
  id: string;
  tokenHash: string;
  label: string;
  state: "trusted" | "waiting" | "removed";
  requestedAt: string;
  approvedAt: string | null;
  approvedVia: "first_device" | "approved" | null;
  lastSeenAt: string;
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
    suspendWorkspace: (a, i, meta) =>
      rpc("app_staff_suspend_workspace", { p_actor: a.userId, p_session: a.sessionId, p_org: i.orgId, p_confirm_name: i.confirmName, p_notice: i.notice, p_reason: i.reason, ...m(meta) }, nothing),
    restoreWorkspace: (a, i, meta) => rpc("app_staff_restore_workspace", { p_actor: a.userId, p_session: a.sessionId, p_org: i.orgId, p_reason: i.reason, ...m(meta) }, nothing),
    blockSite: (a, i, meta) => rpc("app_staff_block_site", { p_actor: a.userId, p_session: a.sessionId, p_site: i.siteId, p_notice: i.notice, p_reason: i.reason, ...m(meta) }, nothing),
    unblockSite: (a, i, meta) => rpc("app_staff_unblock_site", { p_actor: a.userId, p_session: a.sessionId, p_site: i.siteId, p_reason: i.reason, ...m(meta) }, nothing),
    addUsage: (a, i, strength, meta) =>
      rpc("app_staff_add_usage", { p_actor: a.userId, p_session: a.sessionId, p_org: i.orgId, p_units: i.units, p_days: i.days, p_reason: i.reason, p_auth_strength: strength, ...m(meta) }, z.string().uuid()),
    setFlag: (a, i, strength, meta) =>
      rpc("app_staff_set_flag", { p_actor: a.userId, p_session: a.sessionId, p_key: i.key, p_paused: i.paused, p_message: i.message, p_reason: i.reason, p_auth_strength: strength, ...m(meta) }, nothing),
    startCanary: (a, i, meta) =>
      rpc(
        "app_staff_start_canary",
        { p_actor: a.userId, p_session: a.sessionId, p_family: "anthropic", p_tier: i.tier, p_current: i.current, p_candidate: i.candidate, p_estimate_units: i.estimateUnits, p_reason: i.reason, ...m(meta) },
        z.string().uuid(),
      ),
    setModel: (a, i, strength, meta) =>
      rpc(
        "app_staff_set_model",
        { p_actor: a.userId, p_session: a.sessionId, p_family: "anthropic", p_tier: i.tier, p_model: i.model, p_canary: i.canaryId, p_reason: i.reason, p_auth_strength: strength, ...m(meta) },
        nothing,
      ),
    recordBillingProduct: (a, i, meta) =>
      rpc(
        "app_staff_record_billing_product",
        { p_actor: a.userId, p_session: a.sessionId, p_provider: "dodo", p_mode: i.mode, p_plan: i.planId, p_product: i.productId, p_amount_cents: i.amountCents, p_currency: i.currency, p_catalog_version: i.catalogVersion, ...m(meta) },
        nothing,
      ),
    replayWebhook: (a, i, meta) => rpc("app_staff_replay_webhook", { p_actor: a.userId, p_session: a.sessionId, p_id: i.id, ...m(meta) }, nothing),
    recordTopupProduct: (a, i, meta) =>
      rpc(
        "app_staff_record_topup_product",
        { p_actor: a.userId, p_session: a.sessionId, p_provider: "dodo", p_mode: i.mode, p_pack_cents: i.packCents, p_product: i.productId, p_catalog_version: i.catalogVersion, ...m(meta) },
        nothing,
      ),
    publishAnnouncement: (a, i, meta) =>
      rpc(
        "app_staff_publish_announcement",
        { p_actor: a.userId, p_session: a.sessionId, p_message: i.message, p_tone: i.tone, p_dismissible: i.dismissible, p_ends_at: i.endsAt, p_reason: i.reason, ...m(meta) },
        z.string().uuid(),
      ),
    endAnnouncement: (a, i, meta) => rpc("app_staff_end_announcement", { p_actor: a.userId, p_session: a.sessionId, p_id: i.id, p_reason: i.reason, ...m(meta) }, nothing),
    extendTrial: (a, i, meta) => rpc("app_staff_extend_trial", { p_actor: a.userId, p_session: a.sessionId, p_org: i.orgId, p_days: i.days, p_reason: i.reason, ...m(meta) }, z.string()),
    supportReply: (a, i, meta) =>
      rpc("app_staff_support_reply", { p_actor: a.userId, p_session: a.sessionId, p_thread: i.threadId, p_body: i.body, p_internal: i.internal, ...m(meta) }, nothing),
    supportUpdate: (a, i, meta) => rpc("app_staff_support_update", { p_actor: a.userId, p_session: a.sessionId, p_thread: i.threadId, p_action: i.action, ...m(meta) }, nothing),
    recordVerification: (a, c) =>
      rpc(
        "app_staff_record_verification",
        { p_actor: a.userId, p_session: a.sessionId, p_through_seq: c.throughSeq, p_head_hash: c.headHash, p_ok: c.ok, p_first_bad_seq: c.firstBadSeq },
        nothing,
      ),
    checkDevice: (userId, device, bootstrapEmail, meta) =>
      rpc("app_staff_check_device", { p_user: userId, p_token_hash: device.hash, p_label: device.label, p_bootstrap_email: bootstrapEmail, ...m(meta) }, DeviceCheckSchema),
    async deviceTrusted(userId, hash) {
      const r = await rpc("app_staff_device_trusted", { p_user: userId, p_token_hash: hash }, z.boolean());
      // Fails closed: a device the database can't vouch for isn't trusted.
      return r.ok && r.value;
    },
    async listDevices(userId) {
      const { data, error } = await admin.from("staff_devices").select("id, token_hash, label, requested_at, approved_at, approved_via, revoked_at, last_seen_at, request_code").eq("user_id", userId).order("requested_at", { ascending: false }).limit(50);
      if (error) return { ok: false, code: officeCodeFromDatabaseError(error.message) };
      const rows = z.array(DeviceRow).safeParse(data);
      if (!rows.success) return { ok: false, code: "UNEXPECTED_RESPONSE" };
      return {
        ok: true,
        value: rows.data
          // A cancelled request (five wrong codes) has no code left and nothing to approve: it's not shown.
          .filter((d) => d.approved_at || d.revoked_at || d.request_code)
          .map((d) => ({
            id: d.id,
            tokenHash: d.token_hash,
            label: d.label,
            state: d.revoked_at ? "removed" : d.approved_at ? "trusted" : "waiting",
            requestedAt: d.requested_at,
            approvedAt: d.approved_at,
            approvedVia: d.approved_via === "first_device" || d.approved_via === "approved" ? d.approved_via : null,
            lastSeenAt: d.last_seen_at,
          })),
      };
    },
    approveDevice: (a, i, strength, meta) =>
      rpc(
        "app_staff_approve_device",
        { p_actor: a.userId, p_session: a.sessionId, p_from_token_hash: i.fromHash, p_device: i.deviceId, p_code: i.code, p_auth_strength: strength, ...m(meta) },
        z.object({ ok: z.boolean(), tries_left: z.number().optional() }),
      ),
    revokeDevice: (a, deviceId, meta) => rpc("app_staff_revoke_device", { p_actor: a.userId, p_session: a.sessionId, p_device: deviceId, ...m(meta) }, nothing),
    createDeviceInvite: (a, i, strength, meta) =>
      rpc("app_staff_create_device_invite", { p_actor: a.userId, p_session: a.sessionId, p_from_token_hash: i.fromHash, p_code_hash: i.codeHash, p_auth_strength: strength, ...m(meta) }, z.string()),
    redeemDeviceInvite: (codeHash, device, meta) =>
      rpc("app_staff_redeem_device_invite", { p_code_hash: codeHash, p_token_hash: device.hash, p_label: device.label, ...m(meta) }, z.boolean()),
  };
}
