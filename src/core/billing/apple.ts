/**
 * Plans bought with Apple's In-App Purchase in Farbaek for iPhone (ADR 0112).
 *
 * Apple keeps 15% of each payment (the Small Business Program; 30% without
 * it in a subscription's first year), with no fixed fee. Each App Store price
 * is set so Farbaek keeps at least what the same plan keeps on the web at
 * Dodo's worst case, so the plan's AI usage, worked out from the web price,
 * keeps its 57% margin (ADR 0103). Cheap plans cost the same as on the web;
 * larger ones cost a little more. Larger plans than Pro are sold on the web.
 *
 * Pure: shared by the server, which turns Apple's signed records into a
 * workspace's plan, and by the tests that hold the prices to the rule.
 */
import { ECONOMICS } from "./allowance";
import { chargeCents, getPlan, type PlanId } from "./catalog";

/** Apple's commission with the Small Business Program. */
export const APPLE_FEE = 0.15;

export interface AppleProduct {
  /** The product's identifier in App Store Connect. */
  productId: string;
  planId: PlanId;
  /** The United States price; Apple sets the other storefronts' prices from it. */
  usdCents: number;
}

/** One subscription group ("Farbaek plans"): moving between them is an upgrade or a downgrade, never a second subscription. */
export const APPLE_SUBSCRIPTION_GROUP = "Farbaek plans";

export const APPLE_PRODUCTS: readonly AppleProduct[] = [
  { productId: "com.farbaek.app.lite.monthly", planId: "lite_monthly", usdCents: 99 },
  { productId: "com.farbaek.app.maker.monthly", planId: "maker_monthly", usdCents: 199 },
  { productId: "com.farbaek.app.starter.monthly", planId: "starter", usdCents: 1049 },
  { productId: "com.farbaek.app.plus.monthly", planId: "plus", usdCents: 2099 },
  { productId: "com.farbaek.app.pro.monthly", planId: "pro", usdCents: 5399 },
];

export function appleProduct(productId: string): AppleProduct | null {
  return APPLE_PRODUCTS.find((p) => p.productId === productId) ?? null;
}

/** What Farbaek keeps of an App Store price. */
export function appleNetUsd(usdCents: number, fee = APPLE_FEE): number {
  return (usdCents / 100) * (1 - fee);
}

/** What Farbaek keeps of the same plan bought on the web, at Dodo's worst case. */
export function webNetUsd(planId: PlanId): number {
  return (chargeCents(getPlan(planId)) / 100) * (1 - ECONOMICS.paymentPercent) - ECONOMICS.paymentFixedUsd;
}

/** A transaction, as Apple signs it (JWSTransactionDecodedPayload): the fields Farbaek reads. */
export interface AppleTransaction {
  transactionId: string;
  originalTransactionId: string;
  bundleId: string;
  productId: string;
  /** Milliseconds since 1970. */
  purchaseDate: number;
  originalPurchaseDate: number;
  expiresDate?: number;
  revocationDate?: number;
  appAccountToken?: string;
  environment: "Sandbox" | "Production" | "Xcode" | "LocalTesting";
  type?: string;
  /** When Apple signed the record, in milliseconds. */
  signedDate?: number;
}

/** A subscription's renewal, as Apple signs it (JWSRenewalInfoDecodedPayload). */
export interface AppleRenewal {
  originalTransactionId: string;
  /** 1 when the subscription renews, 0 when the person turned renewal off. */
  autoRenewStatus: number;
  autoRenewProductId?: string;
  isInBillingRetryPeriod?: boolean;
  gracePeriodExpiresDate?: number;
}

export type AppleState = "active" | "past_due" | "cancellation_scheduled" | "suspended" | "expired";

export interface AppleSubscription {
  state: AppleState;
  planId: PlanId | null;
  paidThrough: Date | null;
  cancelAtPeriodEnd: boolean;
  suspendedReason: "payment" | null;
  startedAt: Date;
}

/**
 * The workspace's billing state from Apple's signed records, as of now:
 * - refunded or revoked: expired;
 * - paid through a future date: active, or ending then when renewal is off;
 * - past it while Apple retries the payment: past due within the grace
 *   period, then suspended for payment;
 * - otherwise expired.
 */
export function appleSubscription(t: AppleTransaction, renewal: AppleRenewal | null, now: Date): AppleSubscription {
  const planId = appleProduct(t.productId)?.planId ?? null;
  const startedAt = new Date(t.originalPurchaseDate);
  const expires = t.expiresDate ?? 0;
  const grace = renewal?.gracePeriodExpiresDate ?? 0;
  const paidThrough = expires > 0 ? new Date(Math.max(expires, grace)) : null;
  const at = now.getTime();
  const result = (state: AppleState): AppleSubscription => ({
    state,
    planId: state === "expired" ? null : planId,
    paidThrough: state === "expired" ? null : paidThrough,
    cancelAtPeriodEnd: state === "cancellation_scheduled",
    suspendedReason: state === "suspended" ? "payment" : null,
    startedAt,
  });
  if (t.revocationDate) return result("expired");
  if (expires > at) return result(renewal && renewal.autoRenewStatus === 0 ? "cancellation_scheduled" : "active");
  if (renewal?.isInBillingRetryPeriod) return result(grace > at ? "past_due" : "suspended");
  return result("expired");
}
