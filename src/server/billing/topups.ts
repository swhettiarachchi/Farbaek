/**
 * Buying more AI usage (ADR 0102): an owner or admin sets the workspace's
 * monthly top-up limit, then buys a pack through the provider's checkout.
 * The database refuses anything past the limit, counting checkouts still
 * open; usage arrives only when the payment is read back (webhooks.ts).
 */
import { TOPUP_CAP_MAX_CENTS, TOPUP_STATES, isTopupPack, topupConsentText, topupUnits, type TopupPack } from "@/core/billing/topups";
import type { PaymentProvider, ProviderErrorCode } from "@/core/billing/provider";
import { checkoutOpenFor, type BillingConfig } from "./config";
import { PROVIDER_MESSAGES, type BillingAccount, type BillingActor, type BillingWorkspace } from "./use-cases";
import { MANAGER_ROLES, type OrgRole } from "@/server/workspace/types";

export type TopupErrorCode = "FORBIDDEN" | "NOT_OPEN" | "NOT_SUBSCRIBED" | "INVALID_PACK" | "INVALID_CAP" | "CONSENT_REQUIRED" | "NO_EMAIL" | "NO_PRODUCT" | "NO_CAP" | "CAP_REACHED" | "PROVIDER" | "UNKNOWN";

export type TopupResult<T> = { ok: true; value: T } | { ok: false; code: TopupErrorCode; message: string; detail?: ProviderErrorCode };

export const TOPUP_MESSAGES: Record<Exclude<TopupErrorCode, "PROVIDER">, string> = {
  FORBIDDEN: "Only the workspace's owners and admins buy usage or set the limit.",
  NOT_OPEN: "Payments aren't open to this workspace yet, so nothing can be bought.",
  NOT_SUBSCRIBED: "Top-ups are for paid plans. Choose a plan first.",
  INVALID_PACK: "Choose one of the packs shown.",
  INVALID_CAP: "Use a whole number of dollars from $0 to $1,000.",
  CONSENT_REQUIRED: "Tick the box to agree to the price before checkout.",
  NO_EMAIL: "Your account has no email address for receipts. Add one, then try again.",
  NO_PRODUCT: "This pack isn't set up for checkout yet. Nothing was charged.",
  NO_CAP: "Set a monthly top-up limit first. Top-ups never go past it.",
  CAP_REACHED: "That would pass this month's top-up limit, counting checkouts still open. Raise the limit or wait for next month.",
  UNKNOWN: "That didn't work. Nothing was charged. Try again in a moment.",
};

const fail = <T>(code: Exclude<TopupErrorCode, "PROVIDER">): TopupResult<T> => ({ ok: false, code, message: TOPUP_MESSAGES[code] });

export function topupErrorKey(r: { code: TopupErrorCode; detail?: ProviderErrorCode }): string {
  return r.code === "PROVIDER" ? `PROVIDER_${r.detail ?? "UNAVAILABLE"}` : r.code;
}

export function topupErrorMessage(key: string | undefined): string | null {
  if (!key) return null;
  if (key.startsWith("PROVIDER_")) return (PROVIDER_MESSAGES as Record<string, string>)[key.slice(9)] ?? null;
  return key !== "PROVIDER" && key in TOPUP_MESSAGES ? TOPUP_MESSAGES[key as keyof typeof TOPUP_MESSAGES] : null;
}

export interface TopupDeps {
  config: BillingConfig;
  provider: PaymentProvider;
  account(orgId: string): Promise<BillingAccount | null>;
  topupProduct(pack: TopupPack): Promise<string | null>;
  setCap(input: { orgId: string; actorId: string; cents: number | null }): Promise<{ ok: true } | { ok: false; code: "FORBIDDEN" | "UNKNOWN" }>;
  recordTopup(input: { orgId: string; actorId: string; sessionId: string; productId: string; packCents: TopupPack; units: number; consentText: string }): Promise<{ ok: true } | { ok: false; code: "FORBIDDEN" | "NOT_SUBSCRIBED" | "NO_CAP" | "CAP_REACHED" | "UNKNOWN" }>;
}

function gate(deps: TopupDeps | null, ws: BillingWorkspace, role: OrgRole | null): TopupResult<TopupDeps> {
  if (!role || !(MANAGER_ROLES as readonly OrgRole[]).includes(role)) return fail("FORBIDDEN");
  if (!deps || !checkoutOpenFor(deps.config, ws.id)) return fail("NOT_OPEN");
  return { ok: true, value: deps };
}

/** Sets the monthly limit from whole dollars, or clears it with an empty value. */
export async function setTopupCap(deps: TopupDeps | null, ws: BillingWorkspace, actor: BillingActor, dollars: string): Promise<TopupResult<{ cents: number | null }>> {
  const g = gate(deps, ws, actor.role);
  if (!g.ok) return g;
  const trimmed = dollars.trim();
  const cents = trimmed === "" ? null : /^\d{1,4}$/.test(trimmed) ? Number(trimmed) * 100 : NaN;
  if (cents !== null && (!Number.isFinite(cents) || cents > TOPUP_CAP_MAX_CENTS)) return fail("INVALID_CAP");
  const r = await g.value.setCap({ orgId: ws.id, actorId: actor.userId, cents });
  return r.ok ? { ok: true, value: { cents } } : fail(r.code);
}

export async function startTopup(deps: TopupDeps | null, ws: BillingWorkspace, actor: BillingActor, pack: number, consented: boolean): Promise<TopupResult<{ url: string }>> {
  const g = gate(deps, ws, actor.role);
  if (!g.ok) return g;
  const d = g.value;
  if (!isTopupPack(pack)) return fail("INVALID_PACK");
  if (!consented) return fail("CONSENT_REQUIRED");
  if (!actor.email) return fail("NO_EMAIL");
  const account = await d.account(ws.id);
  if (!account || !account.planId || !TOPUP_STATES.has(account.state)) return fail("NOT_SUBSCRIBED");
  const productId = await d.topupProduct(pack);
  if (!productId) return fail("NO_PRODUCT");
  const units = topupUnits(account.planId, pack);
  if (units <= 0) return fail("NOT_SUBSCRIBED");

  const session = await d.provider.createCheckoutSession({
    orgId: ws.id,
    planId: account.planId,
    productId,
    customer: { email: actor.email },
    returnUrl: `${d.config.siteUrl}/app/billing?topup=done`,
    topup: true,
  });
  if (!session.ok) return { ok: false, code: "PROVIDER", message: PROVIDER_MESSAGES[session.code], detail: session.code };
  const recorded = await d.recordTopup({ orgId: ws.id, actorId: actor.userId, sessionId: session.value.sessionId, productId, packCents: pack, units, consentText: topupConsentText(account.planId, pack) });
  if (!recorded.ok) return fail(recorded.code);
  return { ok: true, value: { url: session.value.url } };
}
