/**
 * Payment webhooks (spec §23.3, ADR 0100). Receiving verifies the raw body,
 * stores the event once by its id and answers quickly; processing happens
 * after the response and again from the hourly sweep. Processing never takes
 * state from the webhook: it re-reads the subscription from the provider and
 * applies that, so duplicates, retries and out-of-order events all settle on
 * the provider's latest state.
 */
import type { PaidPlanId, PaymentProvider, ProviderEvent, ProviderMode } from "@/core/billing/provider";
import { mapSubscription, type AppliedState } from "@/core/billing/provider-state";
import type { NormalizedSubscription } from "@/core/billing/provider";
import { log } from "@/server/observability/log";
import { checkoutOpenFor, type BillingConfig } from "./config";
import { verifyDodoWebhook } from "./providers/dodo/webhook";

/** Dodo's deliveries are small; anything bigger isn't one. */
export const MAX_WEBHOOK_BYTES = 1024 * 1024;

export type ApplyResult = "applied" | "unchanged" | "stale" | "other_subscription";

export interface ClaimedEvent {
  id: string;
  mode: ProviderMode;
  type: string;
  subscriptionId: string | null;
  orgId: string | null;
  attempts: number;
}

export interface WebhookDeps {
  config: BillingConfig;
  provider: PaymentProvider;
  record(event: ProviderEvent, mode: ProviderMode): Promise<string | null>;
  claim(limit: number, id: string | null): Promise<ClaimedEvent[]>;
  finish(id: string, status: "processed" | "ignored" | "failed", error: string | null, orgId: string | null): Promise<string>;
  planForProduct(productId: string): Promise<PaidPlanId | null>;
  orgForSubscription(subscriptionId: string): Promise<string | null>;
  apply(orgId: string, sub: NormalizedSubscription, state: AppliedState, syncedAt: Date, source: string): Promise<ApplyResult>;
  now(): Date;
  /** For a one-time payment event: the payment it names and whether Farbaek marked it a top-up (ADR 0102). */
  paymentOf?(eventId: string): Promise<{ paymentId: string; topup: boolean } | null>;
  /** Turns a top-up paid through this checkout session into usage, once. */
  completeTopup?(orgId: string, sessionId: string, paymentId: string): Promise<"paid" | "already">;
}

function respond(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

const problem = (status: number, code: string, message: string) => respond(status, { error: { code, message } });

async function readCapped(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_WEBHOOK_BYTES) return null;
  const raw = await request.text();
  return Buffer.byteLength(raw, "utf8") > MAX_WEBHOOK_BYTES ? null : raw;
}

/**
 * POST /api/webhooks/dodo. `later` runs work after the response (Next's
 * `after`); the hourly sweep catches anything it misses.
 */
export async function receiveWebhook(request: Request, deps: WebhookDeps | null, later: (work: () => Promise<void>) => void): Promise<Response> {
  if (!deps) return problem(503, "NOT_CONNECTED", "Payments aren't connected on this server.");
  const raw = await readCapped(request);
  if (raw === null) return problem(413, "TOO_LARGE", "That isn't a payment webhook.");
  const verdict = verifyDodoWebhook(raw, request.headers, deps.config.webhookKey, deps.now());
  if (!verdict.ok) {
    log("warn", "billing.webhook_rejected", { reason: verdict.reason });
    return verdict.reason === "bad_payload" ? problem(400, "BAD_PAYLOAD", "The webhook's body couldn't be read.") : problem(401, "UNAUTHENTICATED", "The webhook's signature didn't verify.");
  }
  const id = await deps.record(verdict.event, deps.config.mode);
  if (!id) return respond(200, { received: true, duplicate: true });
  later(async () => {
    await processWebhooks(deps, id);
  });
  return respond(200, { received: true });
}

const ACTED_ON = /^(subscription|payment|refund|dispute)\./;

/** Processes one claimed event. Every outcome is recorded; nothing throws past here. */
async function processOne(deps: WebhookDeps, event: ClaimedEvent): Promise<string> {
  const finish = (status: "processed" | "ignored" | "failed", error: string | null, org: string | null = event.orgId) => deps.finish(event.id, status, error, org);
  try {
    if (event.mode !== deps.config.mode) return finish("ignored", `A ${event.mode} event on a ${deps.config.mode} server.`);
    if (event.type === "payment.succeeded" && !event.subscriptionId) return await processTopup(deps, event, finish);
    if (!ACTED_ON.test(event.type) || !event.subscriptionId) return finish("ignored", null);

    const read = await deps.provider.getSubscription(event.subscriptionId);
    if (!read.ok) return finish("failed", `Reading the subscription failed: ${read.code}.`);
    const sub = read.value;
    const syncedAt = deps.now();
    const orgId = sub.orgId ?? (await deps.orgForSubscription(sub.id));
    if (!orgId) return finish("failed", "The subscription names no Farbaek workspace.");
    if (!checkoutOpenFor(deps.config, orgId)) return finish("ignored", "Test checkout isn't open to this workspace.", orgId);
    const plan = await deps.planForProduct(sub.productId);
    if (!plan) return finish("failed", "The subscription's product isn't one of Farbaek's plans.", orgId);

    const change = mapSubscription(sub, plan, syncedAt);
    if (change.kind === "none") return finish("processed", null, orgId);
    const result = await deps.apply(orgId, sub, change.value, syncedAt, event.type);
    log("info", "billing.webhook_applied", { event: event.id, type: event.type, result, state: change.value.state });
    return finish("processed", null, orgId);
  } catch (e) {
    log("error", "billing.webhook_failed", { event: event.id, error: e instanceof Error ? e.message.slice(0, 200) : "unknown" });
    return finish("failed", "Processing failed on Farbaek's side.").catch(() => "failed");
  }
}

/**
 * A one-time payment: a top-up when Farbaek marked its checkout as one. The
 * payment is read back from the provider, and the top-up is found by the
 * checkout session it was paid through, never by anything in the webhook.
 */
async function processTopup(deps: WebhookDeps, event: ClaimedEvent, finish: (status: "processed" | "ignored" | "failed", error: string | null, org?: string | null) => Promise<string>): Promise<string> {
  const ref = deps.paymentOf ? await deps.paymentOf(event.id) : null;
  if (!ref?.topup || !deps.completeTopup) return finish("ignored", null);
  const read = await deps.provider.getPayment(ref.paymentId);
  if (!read.ok) return finish("failed", `Reading the payment failed: ${read.code}.`);
  const payment = read.value;
  if (payment.status !== "succeeded") return finish("failed", `The payment isn't succeeded yet (${payment.status ?? "no status"}).`);
  if (!payment.topup || !payment.orgId || !payment.checkoutSessionId) return finish("failed", "The payment doesn't name a Farbaek top-up checkout.");
  if (!checkoutOpenFor(deps.config, payment.orgId)) return finish("ignored", "Test checkout isn't open to this workspace.", payment.orgId);
  const result = await deps.completeTopup(payment.orgId, payment.checkoutSessionId, payment.id);
  log("info", "billing.topup_applied", { event: event.id, result });
  return finish("processed", null, payment.orgId);
}

/** Claims and processes due events: one by id right after it arrives, or up to `limit` from the hourly sweep. */
export async function processWebhooks(deps: WebhookDeps, id: string | null = null, limit = 20): Promise<{ claimed: number; outcomes: Record<string, number> }> {
  const claimed = await deps.claim(limit, id);
  const outcomes: Record<string, number> = {};
  for (const event of claimed) {
    const status = await processOne(deps, event);
    outcomes[status] = (outcomes[status] ?? 0) + 1;
  }
  return { claimed: claimed.length, outcomes };
}
