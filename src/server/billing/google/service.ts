/**
 * Plans bought through Google Play in Farbaek for Android (ADR 0154).
 *
 * Google doesn't sign a purchase, so nothing counts until the server has
 * asked the Google Play Developer API about the token. Google's library
 * can't carry an account id, so a token is bound to a workspace only when
 * it matches an intent an owner or admin opened from Billing just before
 * buying, or when it replaces the workspace's current Google token (a plan
 * change). Once bound, a token never moves.
 *
 * The order is bind, apply, then acknowledge. A purchase Farbaek refuses is
 * never acknowledged, so Google refunds it within 3 days. Google pushes
 * nothing here: an hourly run asks again when each purchase is due, and
 * pulls refunded and revoked purchases.
 */
import { createHash } from "node:crypto";
import {
  googlePlayAcknowledged,
  googlePlayPredecessor,
  googlePlayProduct,
  googlePlayTestPurchase,
  nextGooglePlayCheck,
  readGooglePlaySubscription,
  type GooglePlayPlan,
  type GooglePlaySubscription,
} from "@/core/billing/google-play";
import type { OrgRole } from "@/server/workspace/types";
import { MANAGER_ROLES } from "@/server/workspace/types";
import type { GooglePlayClient } from "./client";

export type GoogleMode = "test" | "live";
export type ApplyOutcome = "applied" | "unchanged" | "stale" | "other_subscription";
export type BindOutcome = "bound" | "successor" | "bound_here" | "bound_elsewhere" | "needs_successor" | "paid_elsewhere" | "no_intent";

export interface GooglePurchaseRow {
  tokenSha256: string;
  purchaseToken: string;
  orgId: string;
  productId: string;
  mode: GoogleMode;
  status: "active" | "superseded" | "ended";
  acknowledged: boolean;
  lastSyncedAt: Date | null;
}

export interface GoogleDeps {
  client: GooglePlayClient;
  openIntent(input: { orgId: string; actor: string; productId: string }): Promise<void>;
  bind(input: { orgId: string; actor: string; purchaseToken: string; tokenSha256: string; productId: string; mode: GoogleMode; predecessorSha256: string | null; startedAt: Date }): Promise<BindOutcome>;
  purchase(tokenSha256: string): Promise<GooglePurchaseRow | null>;
  apply(input: { orgId: string; tokenSha256: string; mode: GoogleMode; plan: GooglePlayPlan; syncedAt: Date; source: string }): Promise<ApplyOutcome>;
  markChecked(input: { tokenSha256: string; status: GooglePurchaseRow["status"]; syncedAt: Date; nextCheckAt: Date; detail: string | null }): Promise<void>;
  markAcknowledged(tokenSha256: string): Promise<void>;
  /** Active purchases whose next check is due, oldest first. */
  due(limit: number): Promise<GooglePurchaseRow[]>;
  voidedSince(): Promise<Date | null>;
  setVoidedSince(at: Date): Promise<void>;
  now(): Date;
}

export type GoogleResult<T> = { ok: true; value: T } | { ok: false; status: number; code: string; message: string };
const refuse = (status: number, code: string, message: string): GoogleResult<never> => ({ ok: false, status, code, message });

// Inside the Android app these never name another way to pay (Google Play's Payments policy, ADR 0150).
export const GOOGLE_MESSAGES = {
  off: "Plans can't be bought in the Android app yet.",
  manager: "Only the workspace's owners and admins choose its plan.",
  product: "That isn't one of Farbaek's plans.",
  token: "Google Play didn't send a purchase Farbaek can read. If you were charged, Google refunds it within 3 days.",
  unknown: "Google Play doesn't know this purchase. If you were charged, Google refunds it within 3 days.",
  check: "Google Play couldn't confirm the purchase just now. Farbaek keeps trying; the plan starts as soon as Google confirms it.",
  noIntent: "This purchase wasn't started from this workspace's Billing page, so it wasn't added. Google refunds it within 3 days.",
  taken: "This Google Play subscription already pays for another workspace, so it wasn't added here. Google refunds this purchase within 3 days.",
  paidElsewhere: "This workspace already has a plan, so this purchase wasn't added. Google refunds it within 3 days.",
  needsSuccessor: "This workspace already has a Google Play plan. Change it from Billing, which replaces it instead of adding a second one. Google refunds this purchase within 3 days.",
  ignored: "Google Play doesn't show this as one of Farbaek's plans, so nothing changed.",
  pending: "Google Play is waiting for the payment. The plan starts once it's paid.",
} as const;

const TOKEN = /^[A-Za-z0-9._:-]{10,1000}$/;
/** A refresh from the app asks Google at most this often per purchase. */
const REFRESH_MS = 5 * 60_000;

export function tokenSha256(purchaseToken: string): string {
  return createHash("sha256").update(purchaseToken, "utf8").digest("hex");
}

/** What billing_accounts.provider_subscription_id holds for a Google purchase: tokens contain dots, which it doesn't allow. */
export function subscriptionRef(sha256: string): string {
  return `gp_${sha256}`;
}

/** An owner or admin is about to buy this plan in the Android app. */
export async function openGooglePlayIntent(deps: GoogleDeps, input: { orgId: string; actor: string; role: OrgRole | null; productId: string }): Promise<GoogleResult<null>> {
  if (!input.role || !MANAGER_ROLES.includes(input.role)) return refuse(403, "FORBIDDEN", GOOGLE_MESSAGES.manager);
  if (!googlePlayProduct(input.productId)) return refuse(400, "UNKNOWN_PRODUCT", GOOGLE_MESSAGES.product);
  await deps.openIntent({ orgId: input.orgId, actor: input.actor, productId: input.productId });
  return { ok: true, value: null };
}

export interface ClaimedPlan {
  state: string;
  planId: string | null;
  paidThrough: string | null;
  pending: boolean;
}

/**
 * A purchase the app just made, or a token it holds (a refresh, or a claim
 * that couldn't finish earlier). A token already bound here is refreshed at
 * most every 5 minutes.
 */
export async function claimGooglePlayPurchase(deps: GoogleDeps, input: { orgId: string; actor: string; role: OrgRole | null; purchaseToken: unknown }): Promise<GoogleResult<ClaimedPlan>> {
  if (!input.role || !MANAGER_ROLES.includes(input.role)) return refuse(403, "FORBIDDEN", GOOGLE_MESSAGES.manager);
  if (typeof input.purchaseToken !== "string" || !TOKEN.test(input.purchaseToken)) return refuse(400, "INVALID_TOKEN", GOOGLE_MESSAGES.token);
  const token = input.purchaseToken;
  const sha = tokenSha256(token);
  const now = deps.now();

  const known = await deps.purchase(sha);
  if (known && known.orgId !== input.orgId) return refuse(409, "ANOTHER_WORKSPACE", GOOGLE_MESSAGES.taken);
  if (known?.lastSyncedAt && now.getTime() - known.lastSyncedAt.getTime() < REFRESH_MS) {
    return { ok: true, value: { state: "checked_recently", planId: googlePlayProduct(known.productId)?.planId ?? null, paidThrough: null, pending: false } };
  }

  let sub: GooglePlaySubscription | null;
  try {
    sub = await deps.client.getSubscription(token);
  } catch {
    return refuse(503, "GOOGLE_UNAVAILABLE", GOOGLE_MESSAGES.check);
  }
  if (!sub) return refuse(400, "UNKNOWN_PURCHASE", GOOGLE_MESSAGES.unknown);
  const reading = readGooglePlaySubscription(sub, now);
  if (reading.kind === "ignore") return refuse(400, "UNKNOWN_PRODUCT", GOOGLE_MESSAGES.ignored);

  if (!known) {
    const predecessor = googlePlayPredecessor(sub);
    const bound = await deps.bind({
      orgId: input.orgId,
      actor: input.actor,
      purchaseToken: token,
      tokenSha256: sha,
      productId: reading.productId,
      mode: googlePlayTestPurchase(sub) ? "test" : "live",
      predecessorSha256: predecessor ? tokenSha256(predecessor) : null,
      startedAt: sub.startTime && !Number.isNaN(Date.parse(sub.startTime)) ? new Date(sub.startTime) : now,
    });
    const refused = BIND_REFUSALS[bound];
    if (refused) return refused;
  }
  const row = await deps.purchase(sha);
  if (!row) return refuse(503, "GOOGLE_UNAVAILABLE", GOOGLE_MESSAGES.check);
  try {
    return { ok: true, value: await syncGooglePurchase(deps, row, sub) };
  } catch {
    // Bound and recorded: the hourly run applies and acknowledges it.
    return refuse(503, "GOOGLE_UNAVAILABLE", GOOGLE_MESSAGES.check);
  }
}

const BIND_REFUSALS: Partial<Record<BindOutcome, GoogleResult<never>>> = {
  bound_elsewhere: refuse(409, "ANOTHER_WORKSPACE", GOOGLE_MESSAGES.taken),
  needs_successor: refuse(409, "ALREADY_SUBSCRIBED", GOOGLE_MESSAGES.needsSuccessor),
  paid_elsewhere: refuse(409, "PAID_ELSEWHERE", GOOGLE_MESSAGES.paidElsewhere),
  no_intent: refuse(409, "NO_INTENT", GOOGLE_MESSAGES.noIntent),
};

/**
 * Asks Google about one bound purchase (or uses the answer just read) and
 * makes the workspace match: apply, acknowledge once applied, and schedule
 * the next check. A token a plan change replaced is marked superseded, never
 * applied as expired.
 */
export async function syncGooglePurchase(deps: GoogleDeps, row: GooglePurchaseRow, answer?: GooglePlaySubscription | null): Promise<ClaimedPlan> {
  const now = deps.now();
  const sub = answer === undefined ? await deps.client.getSubscription(row.purchaseToken) : answer;
  const later = (days: number) => new Date(now.getTime() + days * 86_400_000);
  if (!sub) {
    await deps.markChecked({ tokenSha256: row.tokenSha256, status: "ended", syncedAt: now, nextCheckAt: later(30), detail: "Google doesn't know this purchase." });
    return { state: "ended", planId: null, paidThrough: null, pending: false };
  }
  const reading = readGooglePlaySubscription(sub, now);
  if (reading.kind === "replaced") {
    await deps.markChecked({ tokenSha256: row.tokenSha256, status: "superseded", syncedAt: now, nextCheckAt: later(30), detail: "Replaced by a plan change." });
    return { state: "superseded", planId: null, paidThrough: null, pending: false };
  }
  if (reading.kind === "ignore") {
    await deps.markChecked({ tokenSha256: row.tokenSha256, status: "ended", syncedAt: now, nextCheckAt: later(30), detail: reading.reason });
    return { state: "ended", planId: null, paidThrough: null, pending: false };
  }
  if (reading.kind === "pending") {
    await deps.markChecked({ tokenSha256: row.tokenSha256, status: "active", syncedAt: now, nextCheckAt: nextGooglePlayCheck(reading, false, now), detail: "Waiting for payment." });
    return { state: "pending", planId: googlePlayProduct(reading.productId)?.planId ?? null, paidThrough: null, pending: true };
  }

  const outcome = await deps.apply({ orgId: row.orgId, tokenSha256: row.tokenSha256, mode: row.mode, plan: reading.plan, syncedAt: now, source: "google.subscription" });
  const ended = reading.plan.state === "expired" || outcome === "other_subscription";
  let acknowledged = row.acknowledged || googlePlayAcknowledged(sub);
  if (!acknowledged && !ended) {
    await deps.client.acknowledge(reading.productId, row.purchaseToken);
    acknowledged = true;
  }
  if (acknowledged && !row.acknowledged) await deps.markAcknowledged(row.tokenSha256);
  await deps.markChecked({
    tokenSha256: row.tokenSha256,
    status: ended ? "ended" : "active",
    syncedAt: now,
    nextCheckAt: nextGooglePlayCheck(reading, acknowledged, now),
    detail: sub.subscriptionState ?? null,
  });
  return { state: reading.plan.state, planId: reading.plan.planId, paidThrough: reading.plan.paidThrough?.toISOString() ?? null, pending: false };
}

/**
 * The hourly run: refunded and revoked purchases since the last run (Google
 * keeps 30 days), then every purchase whose check is due. One failure never
 * stops the rest.
 */
export async function runGooglePlaySync(deps: GoogleDeps): Promise<{ checked: number; failed: number; voided: number }> {
  const now = deps.now();
  const floor = new Date(now.getTime() - 30 * 86_400_000);
  const since = (await deps.voidedSince()) ?? new Date(now.getTime() - 3 * 86_400_000);
  const voided = await deps.client.voidedSince(since > floor ? since : floor);
  const rows = new Map<string, GooglePurchaseRow>();
  for (const v of voided) {
    const row = await deps.purchase(tokenSha256(v.purchaseToken));
    if (row) rows.set(row.tokenSha256, row);
  }
  // Overlap a few minutes, so a refund recorded as this run starts isn't missed.
  await deps.setVoidedSince(new Date(now.getTime() - 5 * 60_000));
  for (const row of await deps.due(50)) rows.set(row.tokenSha256, row);

  let checked = 0;
  let failed = 0;
  for (const row of rows.values()) {
    try {
      await syncGooglePurchase(deps, row);
      checked++;
    } catch {
      failed++;
    }
  }
  return { checked, failed, voided: voided.length };
}
