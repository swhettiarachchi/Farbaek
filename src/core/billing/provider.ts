/**
 * The payment provider boundary (spec §23.1, ADR 0100). Farbaek's own ledger
 * and lifecycle stay the authority; a provider only reports what it billed.
 * Nothing outside src/server/billing/providers/<name>/ talks to a provider.
 */
import type { PlanId } from "./catalog";

/** How this deployment takes payments. Live stays off until docs/billing/go-live.md is complete. */
export type BillingMode = "not_connected" | "test" | "live";
export type ProviderMode = Exclude<BillingMode, "not_connected">;
export type ProviderId = "dodo";

export type PaidPlanId = Exclude<PlanId, "free" | "enterprise">;
/** Only monthly billing exists until annual pricing is decided (go-live checklist). */
export type BillingInterval = "month";

/** A provider's subscription statuses (Dodo's, verified 2026-10-27). */
export const PROVIDER_STATUSES = ["pending", "active", "on_hold", "paused", "cancelled", "failed", "expired", "past_due"] as const;
export type ProviderStatus = (typeof PROVIDER_STATUSES)[number];

/** A subscription as the provider reports it now, re-fetched rather than taken from a webhook. */
export interface NormalizedSubscription {
  provider: ProviderId;
  id: string;
  customerId: string;
  productId: string;
  status: ProviderStatus;
  /** Cancels when the paid period ends. */
  cancelAtPeriodEnd: boolean;
  nextBillingDate: Date | null;
  createdAt: Date;
  /** The workspace the checkout was for, from the metadata Farbaek set. */
  orgId: string | null;
}

/** A verified webhook, before any state is trusted from it. */
export interface ProviderEvent {
  provider: ProviderId;
  webhookId: string;
  type: string;
  eventAt: Date;
  /** The subscription it's about, when it names one. */
  subscriptionId: string | null;
  orgId: string | null;
  payload: unknown;
}

export interface CheckoutInput {
  orgId: string;
  planId: PaidPlanId;
  productId: string;
  customer: { email: string; name?: string };
  returnUrl: string;
}

export type PlanChangeTiming = "now" | "period_end";

export type ProviderErrorCode = "NOT_CONNECTED" | "UNAUTHORIZED" | "NOT_FOUND" | "REJECTED" | "CONFLICT" | "UNAVAILABLE" | "BAD_RESPONSE";

export type ProviderResult<T> = { ok: true; value: T } | { ok: false; code: ProviderErrorCode; status?: number };

export interface PaymentProvider {
  id: ProviderId;
  mode: ProviderMode;
  createCheckoutSession(input: CheckoutInput): Promise<ProviderResult<{ url: string; sessionId: string }>>;
  createPortalSession(customerId: string, returnUrl: string): Promise<ProviderResult<{ url: string }>>;
  setCancelAtPeriodEnd(subscriptionId: string, cancel: boolean): Promise<ProviderResult<NormalizedSubscription>>;
  previewPlanChange(subscriptionId: string, productId: string): Promise<ProviderResult<{ amountCents: number | null; currency: string | null }>>;
  changePlan(subscriptionId: string, productId: string, timing: PlanChangeTiming): Promise<ProviderResult<void>>;
  getSubscription(subscriptionId: string): Promise<ProviderResult<NormalizedSubscription>>;
  createProduct(input: { planId: PaidPlanId; name: string; description: string; amountCents: number; currency: string }): Promise<ProviderResult<{ productId: string }>>;
  getProductPrice(productId: string): Promise<ProviderResult<{ amountCents: number; currency: string; recurring: boolean; trialDays: number }>>;
}
