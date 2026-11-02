/**
 * Plans bought through Google Play in Farbaek for Android (ADR 0154).
 *
 * Google keeps 15% of a subscription's payments, with no fixed fee. The US
 * prices are the App Store's (ADR 0112): each keeps at least what the same
 * plan keeps on the web at Dodo's worst case, so the plan's AI usage keeps
 * its 57% margin (ADR 0103). Google sets the other countries' prices from
 * the US price. Each plan is its own subscription with one base plan,
 * "monthly", and no offers, so the first offer Google's library picks is
 * always the base plan.
 *
 * Google doesn't sign purchases: the server asks the Google Play Developer
 * API (purchases.subscriptionsv2) and reads its answer here.
 *
 * Pure: shared by the server, the Billing page in the Android app, and the
 * tests that hold the prices to the rule.
 */
import type { AppleState } from "./apple";
import type { PlanId } from "./catalog";
import { ANDROID_APP_PACKAGE } from "./store-client";

/** Google Play's service fee on subscriptions. */
export const GOOGLE_PLAY_FEE = 0.15;

/** The Digital Goods API's and Payment Request's name for Google Play's billing. */
export const GOOGLE_PLAY_BILLING_METHOD = "https://play.google.com/billing";

export const GOOGLE_PLAY_BASE_PLAN = "monthly";

export interface GooglePlayProduct {
  /** The subscription's product id in Play Console. */
  productId: string;
  planId: PlanId;
  /** The United States price; Google sets the other countries' prices from it. */
  usdCents: number;
}

export const GOOGLE_PLAY_PRODUCTS: readonly GooglePlayProduct[] = [
  { productId: "farbaek_lite_monthly", planId: "lite_monthly", usdCents: 99 },
  { productId: "farbaek_maker_monthly", planId: "maker_monthly", usdCents: 199 },
  { productId: "farbaek_starter_monthly", planId: "starter", usdCents: 1049 },
  { productId: "farbaek_plus_monthly", planId: "plus", usdCents: 2099 },
  { productId: "farbaek_pro_monthly", planId: "pro", usdCents: 5399 },
];

export function googlePlayProduct(productId: string): GooglePlayProduct | null {
  return GOOGLE_PLAY_PRODUCTS.find((p) => p.productId === productId) ?? null;
}

export function googlePlayProductForPlan(planId: string): GooglePlayProduct | null {
  return GOOGLE_PLAY_PRODUCTS.find((p) => p.planId === planId) ?? null;
}

/** What Farbaek keeps of a Google Play price. */
export function googlePlayNetUsd(usdCents: number, fee = GOOGLE_PLAY_FEE): number {
  return (usdCents / 100) * (1 - fee);
}

/** Google Play's own page for managing (and cancelling) this app's subscriptions. */
export function googlePlayManageUrl(productId?: string | null): string {
  const q = new URLSearchParams({ ...(productId ? { sku: productId } : {}), package: ANDROID_APP_PACKAGE });
  return `https://play.google.com/store/account/subscriptions?${q}`;
}

/** A subscription purchase as purchases.subscriptionsv2.get answers it: the fields Farbaek reads. */
export interface GooglePlaySubscription {
  subscriptionState?: string;
  /** RFC 3339. */
  startTime?: string;
  latestOrderId?: string;
  linkedPurchaseToken?: string;
  acknowledgementState?: string;
  /** Present only for license testers' purchases. */
  testPurchase?: Record<string, unknown>;
  canceledStateContext?: { replacementCancellation?: Record<string, unknown> } & Record<string, unknown>;
  outOfAppPurchaseContext?: { expiredPurchaseToken?: string };
  lineItems?: { productId?: string; expiryTime?: string; autoRenewingPlan?: { autoRenewEnabled?: boolean } }[];
}

export interface GooglePlayPlan {
  state: AppleState;
  planId: PlanId | null;
  paidThrough: Date | null;
  cancelAtPeriodEnd: boolean;
  suspendedReason: "payment" | "paused" | null;
  startedAt: Date;
}

/** What Google's answer means for the workspace. */
export type GooglePlayReading =
  /** Apply this state through app_billing_apply_subscription. */
  | { kind: "apply"; productId: string; plan: GooglePlayPlan }
  /** Not paid yet (a pending payment method): change nothing, ask again soon. */
  | { kind: "pending"; productId: string }
  /** Ended because a newer token replaced it (a plan change): never apply as expired. */
  | { kind: "replaced"; productId: string }
  /** Nothing Farbaek can apply. */
  | { kind: "ignore"; reason: string };

/** The token this purchase replaced, when it replaced one: a plan change in the app, or a resubscribe in the Play Store. */
export function googlePlayPredecessor(s: GooglePlaySubscription): string | null {
  return s.linkedPurchaseToken || s.outOfAppPurchaseContext?.expiredPurchaseToken || null;
}

export function googlePlayAcknowledged(s: GooglePlaySubscription): boolean {
  return s.acknowledgementState === "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED";
}

export function googlePlayTestPurchase(s: GooglePlaySubscription): boolean {
  return s.testPurchase != null;
}

/**
 * The workspace's billing state from Google's answer, as of now:
 * - active: active, or ending at its expiry when renewal is off;
 * - cancelled: ending at its expiry, or expired once that's past;
 * - in the grace period: past due; on hold: suspended for payment; paused: suspended, paused;
 * - expired: expired, unless a newer token replaced it;
 * - pending: nothing yet. A pending purchase that was cancelled, an unknown
 *   state, an unknown product or more than one line item: nothing to apply.
 */
export function readGooglePlaySubscription(s: GooglePlaySubscription, now: Date): GooglePlayReading {
  const items = s.lineItems ?? [];
  if (items.length !== 1) return { kind: "ignore", reason: "Expected exactly one plan in the purchase." };
  const item = items[0]!;
  const product = item.productId ? googlePlayProduct(item.productId) : null;
  if (!product) return { kind: "ignore", reason: "Not one of Farbaek's plans." };
  const productId = product.productId;
  const startedAt = s.startTime && !Number.isNaN(Date.parse(s.startTime)) ? new Date(s.startTime) : now;
  const expiry = item.expiryTime && !Number.isNaN(Date.parse(item.expiryTime)) ? new Date(item.expiryTime) : null;
  const plan = (state: AppleState, suspendedReason: GooglePlayPlan["suspendedReason"] = null): GooglePlayReading => ({
    kind: "apply",
    productId,
    plan: {
      state,
      planId: state === "expired" ? null : product.planId,
      paidThrough: state === "expired" ? null : expiry,
      cancelAtPeriodEnd: state === "cancellation_scheduled",
      suspendedReason: state === "suspended" ? suspendedReason : null,
      startedAt,
    },
  });
  switch (s.subscriptionState) {
    case "SUBSCRIPTION_STATE_PENDING":
      return { kind: "pending", productId };
    case "SUBSCRIPTION_STATE_ACTIVE":
      return plan(item.autoRenewingPlan?.autoRenewEnabled === false ? "cancellation_scheduled" : "active");
    case "SUBSCRIPTION_STATE_CANCELED":
      return plan(expiry && expiry > now ? "cancellation_scheduled" : "expired");
    case "SUBSCRIPTION_STATE_IN_GRACE_PERIOD":
      return plan("past_due");
    case "SUBSCRIPTION_STATE_ON_HOLD":
      return plan("suspended", "payment");
    case "SUBSCRIPTION_STATE_PAUSED":
      return plan("suspended", "paused");
    case "SUBSCRIPTION_STATE_EXPIRED":
      return s.canceledStateContext?.replacementCancellation ? { kind: "replaced", productId } : plan("expired");
    default:
      return { kind: "ignore", reason: `Google's state ${s.subscriptionState ?? "is missing"}.` };
  }
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * When to ask Google again, since Farbaek gets no push from Google (ADR 0154):
 * every hourly run while a purchase isn't acknowledged, 15 minutes while it's
 * pending, every 6 hours in grace or on hold, just after expiry for a live
 * plan (and at least daily), and once a month once it has ended.
 */
export function nextGooglePlayCheck(reading: GooglePlayReading, acknowledged: boolean, now: Date): Date {
  const at = now.getTime();
  if (reading.kind === "pending") return new Date(at + 15 * MINUTE);
  if (reading.kind !== "apply") return new Date(at + 30 * 24 * HOUR);
  if (!acknowledged && reading.plan.state !== "expired") return new Date(at + 50 * MINUTE);
  switch (reading.plan.state) {
    case "past_due":
    case "suspended":
      return new Date(at + 6 * HOUR);
    case "expired":
      return new Date(at + 30 * 24 * HOUR);
    default: {
      const afterExpiry = reading.plan.paidThrough ? reading.plan.paidThrough.getTime() + 10 * MINUTE : at + 24 * HOUR;
      return new Date(Math.max(at + 10 * MINUTE, Math.min(afterExpiry, at + 24 * HOUR)));
    }
  }
}
