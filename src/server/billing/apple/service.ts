/**
 * Plans bought through Apple (ADR 0112). Two ways a plan changes, both from
 * records Apple signed:
 *
 * - The app reports a purchase it just made (or one Restore found): its
 *   signed transaction names the workspace in appAccountToken, which the
 *   app sets to the workspace's id, and the person sending it must be an
 *   owner or admin there.
 * - App Store Server Notifications report renewals, failed payments,
 *   cancellations, refunds and expiry, each with the signed transaction and
 *   renewal information. Each is handled once.
 *
 * A workspace has one provider at a time: a workspace the web bills can't
 * also be billed by Apple, and one subscription can't move between
 * workspaces. Nothing in a record counts before its signature is checked.
 */
import { appleProduct, appleSubscription, type AppleRenewal, type AppleSubscription, type AppleTransaction } from "@/core/billing/apple";
import { IOS_APP } from "@/config/ios-app";
import type { OrgRole } from "@/server/workspace/types";
import { MANAGER_ROLES } from "@/server/workspace/types";
import { AppleJwsError } from "./jws";

export type AppleMode = "test" | "live";
export type ApplyOutcome = "applied" | "unchanged" | "stale" | "other_subscription";

export interface AppleAccount {
  provider: "dodo" | "apple" | null;
  state: string;
  subscriptionId: string | null;
}

export interface AppleDeps {
  /** Checks a record's signature (verifyAppleJws with Apple's root) and returns its payload. */
  verify<T>(jws: unknown): T;
  account(orgId: string): Promise<AppleAccount | null>;
  /** The workspace an Apple subscription already belongs to. */
  orgForSubscription(originalTransactionId: string): Promise<string | null>;
  apply(input: { orgId: string; originalTransactionId: string; mode: AppleMode; sub: AppleSubscription; signedAt: Date; source: string }): Promise<ApplyOutcome>;
  recordNotification(input: { uuid: string; type: string; subtype: string | null; environment: "Sandbox" | "Production"; originalTransactionId: string | null }): Promise<"new" | "done" | "retry">;
  finishNotification(uuid: string, status: "processed" | "ignored" | "failed", detail: string | null, orgId: string | null): Promise<void>;
  now(): Date;
}

export type AppleResult<T> = { ok: true; value: T } | { ok: false; status: number; code: string; message: string };
const refuse = (status: number, code: string, message: string): AppleResult<never> => ({ ok: false, status, code, message });

const LIVE = new Set(["active", "past_due", "cancellation_scheduled", "suspended"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DIGITS = /^[0-9]{1,30}$/;

export const APPLE_MESSAGES = {
  record: "Apple's record of this purchase couldn't be checked, so nothing changed. Try Restore purchases in a moment.",
  product: "That App Store product isn't one of Farbaek's plans.",
  workspace: "This purchase was made for a different workspace. Switch to that workspace and try again.",
  manager: "Only the workspace's owners and admins choose its plan.",
  web: "This workspace's plan is billed on www.farbaek.com, so it's changed there. The App Store didn't need to charge you; if it did, ask Apple for a refund at reportaproblem.apple.com.",
  taken: "This App Store subscription already pays for another workspace.",
} as const;

function environmentMode(env: unknown): AppleMode | null {
  return env === "Production" ? "live" : env === "Sandbox" ? "test" : null;
}

function checkTransaction(t: AppleTransaction): AppleResult<{ mode: AppleMode }> {
  const mode = environmentMode(t.environment);
  if (t.bundleId !== IOS_APP.bundleId || !mode || !DIGITS.test(String(t.originalTransactionId))) return refuse(400, "INVALID_RECORD", APPLE_MESSAGES.record);
  if (!appleProduct(t.productId)) return refuse(400, "UNKNOWN_PRODUCT", APPLE_MESSAGES.product);
  return { ok: true, value: { mode } };
}

/** The app's report of a purchase, or of one Restore purchases found. */
export async function claimAppleTransaction(deps: AppleDeps, input: { orgId: string; role: OrgRole | null; jws: unknown }): Promise<AppleResult<{ state: string; planId: string | null; paidThrough: string | null }>> {
  if (!input.role || !MANAGER_ROLES.includes(input.role)) return refuse(403, "FORBIDDEN", APPLE_MESSAGES.manager);
  let t: AppleTransaction;
  try {
    t = deps.verify<AppleTransaction>(input.jws);
  } catch (e) {
    if (e instanceof AppleJwsError) return refuse(400, "INVALID_RECORD", APPLE_MESSAGES.record);
    throw e;
  }
  const checked = checkTransaction(t);
  if (!checked.ok) return checked;
  if (String(t.appAccountToken ?? "").toLowerCase() !== input.orgId.toLowerCase()) return refuse(403, "WRONG_WORKSPACE", APPLE_MESSAGES.workspace);

  const original = String(t.originalTransactionId);
  const owner = await deps.orgForSubscription(original);
  if (owner && owner !== input.orgId) return refuse(409, "ANOTHER_WORKSPACE", APPLE_MESSAGES.taken);
  const account = await deps.account(input.orgId);
  if (account?.provider === "dodo" && account.subscriptionId && LIVE.has(account.state)) return refuse(409, "PAID_ON_WEB", APPLE_MESSAGES.web);

  const now = deps.now();
  const sub = appleSubscription(t, null, now);
  await deps.apply({ orgId: input.orgId, originalTransactionId: original, mode: checked.value.mode, sub, signedAt: signedAt(t, now), source: "apple.transaction" });
  return { ok: true, value: { state: sub.state, planId: sub.planId, paidThrough: sub.paidThrough?.toISOString() ?? null } };
}

function signedAt(record: { signedDate?: unknown }, now: Date): Date {
  return typeof record.signedDate === "number" && record.signedDate <= now.getTime() + 5 * 60_000 ? new Date(record.signedDate) : now;
}

interface NotificationPayload {
  notificationType?: unknown;
  subtype?: unknown;
  notificationUUID?: unknown;
  signedDate?: unknown;
  data?: { bundleId?: unknown; environment?: unknown; appAppleId?: unknown; signedTransactionInfo?: unknown; signedRenewalInfo?: unknown };
}

/** An App Store Server Notification (version 2). 200 when it's handled or needs nothing; 500 asks Apple to send it again. */
export async function receiveAppleNotification(deps: AppleDeps, body: unknown, appAppleId: number | null): Promise<{ status: number; outcome: string }> {
  const signedPayload = body && typeof body === "object" ? (body as { signedPayload?: unknown }).signedPayload : undefined;
  let n: NotificationPayload;
  try {
    n = deps.verify<NotificationPayload>(signedPayload);
  } catch (e) {
    if (e instanceof AppleJwsError) return { status: 400, outcome: "unsigned" };
    throw e;
  }
  const type = typeof n.notificationType === "string" ? n.notificationType : "";
  const subtype = typeof n.subtype === "string" && n.subtype ? n.subtype : null;
  const uuid = typeof n.notificationUUID === "string" ? n.notificationUUID.toLowerCase() : "";
  const environment = n.data?.environment;
  if (!/^[A-Z_]{1,60}$/.test(type) || !UUID.test(uuid) || (environment !== "Sandbox" && environment !== "Production")) return { status: 400, outcome: "unreadable" };
  if (n.data?.bundleId !== IOS_APP.bundleId) return { status: 200, outcome: "other_app" };
  if (environment === "Production" && appAppleId !== null && n.data?.appAppleId !== appAppleId) return { status: 200, outcome: "other_app" };
  if (type === "TEST") return { status: 200, outcome: "test" };

  let t: AppleTransaction | null = null;
  let renewal: AppleRenewal | null = null;
  try {
    t = n.data?.signedTransactionInfo ? deps.verify<AppleTransaction>(n.data.signedTransactionInfo) : null;
    renewal = n.data?.signedRenewalInfo ? deps.verify<AppleRenewal>(n.data.signedRenewalInfo) : null;
  } catch (e) {
    if (e instanceof AppleJwsError) return { status: 400, outcome: "unsigned" };
    throw e;
  }
  const original = t && DIGITS.test(String(t.originalTransactionId)) ? String(t.originalTransactionId) : null;
  const seen = await deps.recordNotification({ uuid, type, subtype, environment, originalTransactionId: original });
  if (seen === "done") return { status: 200, outcome: "replay" };

  const ignore = async (detail: string, orgId: string | null = null) => {
    await deps.finishNotification(uuid, "ignored", detail, orgId);
    return { status: 200, outcome: "ignored" };
  };
  if (!t || !original) return ignore("No subscription in this notification.");
  const checked = checkTransaction(t);
  if (!checked.ok) return ignore(checked.message);

  try {
    const token = String(t.appAccountToken ?? "").toLowerCase();
    const owner = await deps.orgForSubscription(original);
    const orgId = owner ?? (UUID.test(token) ? token : null);
    if (!orgId) return ignore("No workspace for this subscription: it wasn't bought in Farbaek for iPhone.");
    const account = await deps.account(orgId);
    if (!account) return ignore("The workspace no longer exists.");
    if (account.provider === "dodo" && account.subscriptionId && LIVE.has(account.state)) return ignore("The workspace is billed on the web.", orgId);

    const now = deps.now();
    const sub = appleSubscription(t, renewal, now);
    const applied = await deps.apply({ orgId, originalTransactionId: original, mode: checked.value.mode, sub, signedAt: signedAt(n, now), source: `apple.${type.toLowerCase()}` });
    await deps.finishNotification(uuid, "processed", applied === "applied" ? null : applied, orgId);
    return { status: 200, outcome: applied };
  } catch (e) {
    await deps.finishNotification(uuid, "failed", e instanceof Error ? e.message.slice(0, 300) : "failed", null).catch(() => undefined);
    return { status: 500, outcome: "failed" };
  }
}
