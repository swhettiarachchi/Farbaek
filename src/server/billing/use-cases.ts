/**
 * What people do in Billing (spec §23.5, ADR 0100): choose a plan through the
 * provider's hosted checkout, manage payment in its portal, cancel at the
 * period's end, keep a plan they were cancelling, and switch plans. Each one
 * checks the person's role and whether payments are open to the workspace
 * before asking the provider, and after a change re-reads the subscription
 * and applies it, so the page shows the provider's state right away.
 */
import { getPlan } from "@/core/billing/catalog";
import { checkoutConsentText, isPaidPlanId, mapSubscription, planChangeDirection, type AppliedState } from "@/core/billing/provider-state";
import type { NormalizedSubscription, PaidPlanId, PaymentProvider, ProviderErrorCode } from "@/core/billing/provider";
import type { SubscriptionState } from "@/core/billing/trial";
import { checkoutOpenFor, type BillingConfig } from "./config";
import type { ApplyResult } from "./webhooks";
import { MANAGER_ROLES, type OrgRole } from "@/server/workspace/types";

export type BillingErrorCode =
  | "FORBIDDEN"
  | "NOT_OPEN"
  | "INVALID_PLAN"
  | "CONSENT_REQUIRED"
  | "ALREADY_SUBSCRIBED"
  | "NOT_SUBSCRIBED"
  | "NO_EMAIL"
  | "NO_PRODUCT"
  | "PRICE_MISMATCH"
  | "SAME_PLAN"
  | "PROVIDER"
  | "UNKNOWN";

export type BillingResult<T> = { ok: true; value: T } | { ok: false; code: BillingErrorCode; message: string; detail?: ProviderErrorCode };

export const PROVIDER_MESSAGES: Record<ProviderErrorCode, string> = {
  NOT_CONNECTED: "Payments aren't connected on this server.",
  UNAUTHORIZED: "Dodo Payments refused Farbaek's key. Nothing was charged. Farbaek has been told.",
  NOT_FOUND: "Dodo Payments doesn't know that subscription. Nothing was charged.",
  REJECTED: "Dodo Payments turned the request down. Nothing was charged.",
  CONFLICT: "A payment for a plan change is already in progress. Wait for it to finish, then try again.",
  UNAVAILABLE: "Dodo Payments didn't answer. Nothing was charged. Try again in a minute.",
  BAD_RESPONSE: "Dodo Payments sent an answer Farbaek couldn't read. Nothing was charged. Try again in a minute.",
};

export const BILLING_MESSAGES: Record<Exclude<BillingErrorCode, "PROVIDER">, string> = {
  FORBIDDEN: "Only the workspace's owners and admins manage its plan.",
  NOT_OPEN: "Payments aren't open to this workspace yet, so no plan can be bought and nothing is charged.",
  INVALID_PLAN: "Choose one of the plans shown.",
  CONSENT_REQUIRED: "Tick the box to agree to the price and renewal before checkout.",
  ALREADY_SUBSCRIBED: "This workspace already has a plan. Switch plans from Billing instead.",
  NOT_SUBSCRIBED: "This workspace has no paid plan to change.",
  NO_EMAIL: "Your account has no email address for receipts. Add one, then try again.",
  NO_PRODUCT: "This plan isn't set up for checkout yet. Nothing was charged.",
  PRICE_MISMATCH: "This plan's price at Dodo Payments doesn't match Farbaek's price list, so checkout is paused. Nothing was charged.",
  SAME_PLAN: "That's already your plan.",
  UNKNOWN: "That didn't work. Nothing was charged. Try again in a moment.",
};

const fail = <T>(code: Exclude<BillingErrorCode, "PROVIDER">): BillingResult<T> => ({ ok: false, code, message: BILLING_MESSAGES[code] });
const providerFail = <T>(code: ProviderErrorCode): BillingResult<T> => ({ ok: false, code: "PROVIDER", message: PROVIDER_MESSAGES[code], detail: code });

/** A failure as a short key for a redirect's query string: never free text. */
export function billingErrorKey(result: { code: BillingErrorCode; detail?: ProviderErrorCode }): string {
  return result.code === "PROVIDER" ? `PROVIDER_${result.detail ?? "UNAVAILABLE"}` : result.code;
}

/** The message for a key from billingErrorKey, or null for anything else. */
export function billingErrorMessage(key: string | undefined): string | null {
  if (!key) return null;
  if (key.startsWith("PROVIDER_")) return (PROVIDER_MESSAGES as Record<string, string>)[key.slice(9)] ?? null;
  return key !== "PROVIDER" && key in BILLING_MESSAGES ? BILLING_MESSAGES[key as keyof typeof BILLING_MESSAGES] : null;
}

export interface BillingAccount {
  state: SubscriptionState;
  planId: PaidPlanId | null;
  subscriptionId: string | null;
  customerId: string | null;
  paidThrough: Date | null;
}

export interface BillingDeps {
  config: BillingConfig;
  provider: PaymentProvider;
  account(orgId: string): Promise<BillingAccount | null>;
  productFor(planId: PaidPlanId): Promise<{ productId: string; amountCents: number } | null>;
  planForProduct(productId: string): Promise<PaidPlanId | null>;
  recordCheckout(input: { orgId: string; actorId: string; sessionId: string; planId: PaidPlanId; productId: string; amountCents: number; consentText: string }): Promise<{ ok: true } | { ok: false; code: "FORBIDDEN" | "ALREADY_SUBSCRIBED" | "UNKNOWN" }>;
  apply(orgId: string, sub: NormalizedSubscription, state: AppliedState, syncedAt: Date, source: string): Promise<ApplyResult>;
  now(): Date;
}

export interface BillingActor {
  userId: string;
  email: string;
  role: OrgRole | null;
}

export interface BillingWorkspace {
  id: string;
  onTrial: boolean;
}

const LIVE_STATES: ReadonlySet<SubscriptionState> = new Set(["active", "past_due", "cancellation_scheduled", "suspended"]);

function gate(deps: BillingDeps | null, ws: BillingWorkspace, actor: BillingActor): BillingResult<BillingDeps> {
  if (!actor.role || !(MANAGER_ROLES as readonly OrgRole[]).includes(actor.role)) return fail("FORBIDDEN");
  if (!deps || !checkoutOpenFor(deps.config, ws.id)) return fail("NOT_OPEN");
  return { ok: true, value: deps };
}

async function subscribed(deps: BillingDeps, orgId: string): Promise<BillingResult<BillingAccount & { subscriptionId: string; planId: PaidPlanId }>> {
  const account = await deps.account(orgId);
  if (!account || !account.subscriptionId || !account.planId || !LIVE_STATES.has(account.state)) return fail("NOT_SUBSCRIBED");
  return { ok: true, value: { ...account, subscriptionId: account.subscriptionId, planId: account.planId } };
}

/** Re-reads the subscription and applies it, so the page shows the provider's state without waiting for the webhook. */
async function sync(deps: BillingDeps, orgId: string, subscriptionId: string, source: string): Promise<void> {
  const read = await deps.provider.getSubscription(subscriptionId);
  if (!read.ok) return;
  const plan = await deps.planForProduct(read.value.productId);
  if (!plan) return;
  const now = deps.now();
  const change = mapSubscription(read.value, plan, now);
  if (change.kind === "apply") await deps.apply(orgId, read.value, change.value, now, source);
}

export async function startCheckout(deps: BillingDeps | null, ws: BillingWorkspace, actor: BillingActor, planId: string, consented: boolean): Promise<BillingResult<{ url: string }>> {
  const g = gate(deps, ws, actor);
  if (!g.ok) return g;
  const d = g.value;
  if (!isPaidPlanId(planId)) return fail("INVALID_PLAN");
  if (!consented) return fail("CONSENT_REQUIRED");
  if (!actor.email) return fail("NO_EMAIL");
  const account = await d.account(ws.id);
  if (account && account.subscriptionId && LIVE_STATES.has(account.state)) return fail("ALREADY_SUBSCRIBED");
  const plan = getPlan(planId);
  if (plan.pricing.kind !== "paid") return fail("INVALID_PLAN");
  const product = await d.productFor(planId);
  if (!product) return fail("NO_PRODUCT");
  // Fail closed: checkout charges what Dodo has, so it must be Farbaek's price.
  if (product.amountCents !== plan.pricing.monthlyCents) return fail("PRICE_MISMATCH");

  const session = await d.provider.createCheckoutSession({
    orgId: ws.id,
    planId,
    productId: product.productId,
    customer: { email: actor.email },
    returnUrl: `${d.config.siteUrl}/app/billing?checkout=done`,
  });
  if (!session.ok) return providerFail(session.code);
  const recorded = await d.recordCheckout({
    orgId: ws.id,
    actorId: actor.userId,
    sessionId: session.value.sessionId,
    planId,
    productId: product.productId,
    amountCents: product.amountCents,
    consentText: checkoutConsentText(planId, ws.onTrial),
  });
  if (!recorded.ok) return fail(recorded.code);
  return { ok: true, value: { url: session.value.url } };
}

export async function openPortal(deps: BillingDeps | null, ws: BillingWorkspace, actor: BillingActor): Promise<BillingResult<{ url: string }>> {
  const g = gate(deps, ws, actor);
  if (!g.ok) return g;
  const account = await g.value.account(ws.id);
  if (!account?.customerId) return fail("NOT_SUBSCRIBED");
  const r = await g.value.provider.createPortalSession(account.customerId, `${g.value.config.siteUrl}/app/billing`);
  return r.ok ? { ok: true, value: r.value } : providerFail(r.code);
}

/** Cancels at the end of the paid period, or keeps a plan that was cancelling. Returns when access ends, if it does. */
export async function setCancelAtPeriodEnd(deps: BillingDeps | null, ws: BillingWorkspace, actor: BillingActor, cancel: boolean): Promise<BillingResult<{ endsAt: Date | null }>> {
  const g = gate(deps, ws, actor);
  if (!g.ok) return g;
  const s = await subscribed(g.value, ws.id);
  if (!s.ok) return s;
  const r = await g.value.provider.setCancelAtPeriodEnd(s.value.subscriptionId, cancel);
  if (!r.ok) return providerFail(r.code);
  const now = g.value.now();
  const change = mapSubscription(r.value, s.value.planId, now);
  if (change.kind === "apply") await g.value.apply(ws.id, r.value, change.value, now, cancel ? "billing.cancel" : "billing.resume");
  return { ok: true, value: { endsAt: cancel ? r.value.nextBillingDate : null } };
}

export interface PlanChangePreview {
  from: PaidPlanId;
  to: PaidPlanId;
  direction: "upgrade" | "downgrade";
  /** Charged today for an upgrade, from Dodo's preview; null when it couldn't say. */
  amountCents: number | null;
  currency: string | null;
  /** When a downgrade takes effect. */
  effectiveAt: Date | null;
}

export async function previewPlanChange(deps: BillingDeps | null, ws: BillingWorkspace, actor: BillingActor, to: string): Promise<BillingResult<PlanChangePreview>> {
  const g = gate(deps, ws, actor);
  if (!g.ok) return g;
  if (!isPaidPlanId(to)) return fail("INVALID_PLAN");
  const s = await subscribed(g.value, ws.id);
  if (!s.ok) return s;
  const direction = planChangeDirection(s.value.planId, to);
  if (direction === "same") return fail("SAME_PLAN");
  const product = await g.value.productFor(to);
  if (!product) return fail("NO_PRODUCT");
  const target = getPlan(to);
  if (target.pricing.kind !== "paid" || product.amountCents !== target.pricing.monthlyCents) return fail("PRICE_MISMATCH");
  if (direction === "downgrade") return { ok: true, value: { from: s.value.planId, to, direction, amountCents: null, currency: null, effectiveAt: s.value.paidThrough } };
  const p = await g.value.provider.previewPlanChange(s.value.subscriptionId, product.productId);
  return { ok: true, value: { from: s.value.planId, to, direction, amountCents: p.ok ? p.value.amountCents : null, currency: p.ok ? p.value.currency : null, effectiveAt: null } };
}

export async function changePlan(deps: BillingDeps | null, ws: BillingWorkspace, actor: BillingActor, to: string): Promise<BillingResult<{ direction: "upgrade" | "downgrade"; effectiveAt: Date | null }>> {
  const preview = await previewPlanChange(deps, ws, actor, to);
  if (!preview.ok) return preview;
  const d = deps!;
  const account = await d.account(ws.id);
  const product = await d.productFor(preview.value.to);
  if (!account?.subscriptionId || !product) return fail("NOT_SUBSCRIBED");
  const r = await d.provider.changePlan(account.subscriptionId, product.productId, preview.value.direction === "upgrade" ? "now" : "period_end");
  if (!r.ok) return providerFail(r.code);
  await sync(d, ws.id, account.subscriptionId, "billing.change_plan");
  return { ok: true, value: { direction: preview.value.direction, effectiveAt: preview.value.effectiveAt } };
}
