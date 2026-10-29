/**
 * Payments (ADR 0100), against mocks: signed webhook fixtures made here with
 * a mock secret, and a fake fetch standing in for Dodo. Nothing here talks to
 * Dodo; the real test-mode run is in docs/billing/dodo-test-mode.md.
 */
import { describe, expect, it, vi } from "vitest";
import type { NormalizedSubscription, PaidPlanId } from "@/core/billing/provider";
import type { AppliedState } from "@/core/billing/provider-state";
import { billingStatus, checkoutOpenFor, readBillingConfig, readProviderConfig, type BillingConfig } from "./config";
import { createDodoClient, type Fetch } from "./providers/dodo/client";
import { signWebhook, verifyDodoWebhook } from "./providers/dodo/webhook";
import { changePlan, openPortal, previewPlanChange, setCancelAtPeriodEnd, startCheckout, type BillingAccount, type BillingDeps } from "./use-cases";
import { billingNotice } from "./notices";
import { processWebhooks, receiveWebhook, type ClaimedEvent, type WebhookDeps } from "./webhooks";

const MOCK_SECRET = `whsec_${Buffer.from("mock-signing-key-for-tests-only-32b").toString("base64")}`;
const ORG = "00000000-0000-4000-8000-0000000000e1";
const OTHER_ORG = "00000000-0000-4000-8000-0000000000e2";
const NOW = new Date("2026-11-03T09:00:00Z");
const nowSeconds = Math.floor(NOW.getTime() / 1000);

const config: BillingConfig = {
  provider: "dodo",
  mode: "test",
  apiKey: "mock_api_key",
  webhookKey: MOCK_SECRET,
  baseUrl: "https://test.dodopayments.com",
  testWorkspaces: new Set([ORG]),
  siteUrl: "https://www.farbaek.com",
};

function signed(body: unknown, opts: { id?: string; at?: number; secret?: string; extraSig?: string } = {}) {
  const raw = JSON.stringify(body);
  const id = opts.id ?? "msg_mock_1";
  const at = opts.at ?? nowSeconds;
  const sig = signWebhook(id, at, raw, opts.secret ?? MOCK_SECRET);
  const headers = new Headers({ "webhook-id": id, "webhook-timestamp": String(at), "webhook-signature": [opts.extraSig, `v1,${sig}`].filter(Boolean).join(" "), "content-type": "application/json" });
  return { raw, headers };
}

const subscriptionBody = (over: Record<string, unknown> = {}) => ({
  business_id: "bus_mock",
  type: "subscription.active",
  timestamp: NOW.toISOString(),
  data: { payload_type: "Subscription", subscription_id: "sub_mock1", metadata: { farbaek_org: ORG }, ...over },
});

describe("webhook signatures (mock secret)", () => {
  it("accepts a valid signature and reads the event", () => {
    const { raw, headers } = signed(subscriptionBody());
    const v = verifyDodoWebhook(raw, headers, MOCK_SECRET, NOW);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.event).toMatchObject({ webhookId: "msg_mock_1", type: "subscription.active", subscriptionId: "sub_mock1", orgId: ORG });
  });

  it("accepts the secret with or without its whsec_ prefix, and any matching v1 entry", () => {
    const { raw, headers } = signed(subscriptionBody(), { extraSig: "v1,bm90LWl0" });
    expect(verifyDodoWebhook(raw, headers, MOCK_SECRET.replace(/^whsec_/, ""), NOW).ok).toBe(true);
  });

  it("refuses a tampered body, a wrong secret, and missing headers", () => {
    const { raw, headers } = signed(subscriptionBody());
    expect(verifyDodoWebhook(raw.replace("sub_mock1", "sub_mock2"), headers, MOCK_SECRET, NOW)).toEqual({ ok: false, reason: "bad_signature" });
    const other = `whsec_${Buffer.from("another-mock-key-another-mock-key").toString("base64")}`;
    expect(verifyDodoWebhook(raw, headers, other, NOW)).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifyDodoWebhook(raw, new Headers(), MOCK_SECRET, NOW)).toEqual({ ok: false, reason: "missing_headers" });
  });

  it("refuses timestamps more than 5 minutes off, either way", () => {
    const old = signed(subscriptionBody(), { at: nowSeconds - 301 });
    expect(verifyDodoWebhook(old.raw, old.headers, MOCK_SECRET, NOW)).toEqual({ ok: false, reason: "stale" });
    const future = signed(subscriptionBody(), { at: nowSeconds + 301 });
    expect(verifyDodoWebhook(future.raw, future.headers, MOCK_SECRET, NOW)).toEqual({ ok: false, reason: "stale" });
    const near = signed(subscriptionBody(), { at: nowSeconds - 290 });
    expect(verifyDodoWebhook(near.raw, near.headers, MOCK_SECRET, NOW).ok).toBe(true);
  });
});

function mockSubscription(over: Partial<NormalizedSubscription> = {}): Record<string, unknown> {
  return {
    subscription_id: over.id ?? "sub_mock1",
    status: over.status ?? "active",
    product_id: over.productId ?? "pdt_mock_pro",
    created_at: "2026-11-03T08:59:00Z",
    next_billing_date: "2026-12-03T08:59:00Z",
    cancel_at_next_billing_date: over.cancelAtPeriodEnd ?? false,
    customer: { customer_id: "cus_mock1", email: "owner@example.test" },
    metadata: over.orgId === null ? {} : { farbaek_org: over.orgId ?? ORG },
  };
}

type Call = { url: string; method: string; body: unknown; headers: Record<string, string> };

function fakeDodo(routes: Record<string, (body: unknown) => { status?: number; json: unknown }>) {
  const calls: Call[] = [];
  const fetchImpl: Fetch = async (url, init) => {
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method: String(init.method), body, headers: init.headers as Record<string, string> });
    const key = `${init.method} ${url.replace(config.baseUrl, "").split("?")[0]}`;
    const route = routes[key];
    if (!route) return new Response("{}", { status: 404 });
    const r = route(body);
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200 });
  };
  return { calls, fetchImpl };
}

function webhookDeps(over: Partial<WebhookDeps> & { sub?: Record<string, unknown> } = {}) {
  const stored = new Map<string, ClaimedEvent & { status: string; error: string | null }>();
  const applied: { orgId: string; state: AppliedState; source: string }[] = [];
  const dodo = fakeDodo({ "GET /subscriptions/sub_mock1": () => ({ json: over.sub ?? mockSubscription() }) });
  const deps: WebhookDeps = {
    config,
    provider: createDodoClient({ apiKey: config.apiKey, baseUrl: config.baseUrl, mode: "test", fetch: dodo.fetchImpl }),
    async record(event) {
      if ([...stored.values()].some((e) => e.type === event.type && e.id === event.webhookId)) return null;
      stored.set(event.webhookId, { id: event.webhookId, mode: "test", type: event.type, subscriptionId: event.subscriptionId, orgId: event.orgId, attempts: 0, status: "received", error: null });
      return event.webhookId;
    },
    async claim(_limit, id) {
      const due = [...stored.values()].filter((e) => (id === null || e.id === id) && (e.status === "received" || e.status === "failed"));
      for (const e of due) {
        e.status = "processing";
        e.attempts += 1;
      }
      return due.map((e) => ({ ...e }));
    },
    async finish(id, status, error) {
      const e = stored.get(id)!;
      e.status = status;
      e.error = error;
      return status;
    },
    planForProduct: async (p) => (p === "pdt_mock_pro" ? "pro" : p === "pdt_mock_max" ? "max" : null),
    orgForSubscription: async () => null,
    apply: async (orgId, _sub, state, _at, source) => {
      applied.push({ orgId, state, source });
      return "applied";
    },
    now: () => NOW,
    ...over,
  };
  return { deps, stored, applied, calls: dodo.calls };
}

async function post(deps: WebhookDeps | null, body: unknown, opts: Parameters<typeof signed>[1] = {}) {
  const { raw, headers } = signed(body, opts);
  const later: (() => Promise<void>)[] = [];
  const res = await receiveWebhook(new Request("https://www.farbaek.com/api/webhooks/dodo", { method: "POST", headers, body: raw }), deps, (w) => later.push(w));
  for (const w of later) await w();
  return { res, ran: later.length };
}

describe("POST /api/webhooks/dodo (mock deliveries)", () => {
  it("answers 503 while payments aren't connected", async () => {
    expect((await post(null, subscriptionBody())).res.status).toBe(503);
  });

  it("answers 401 to a bad signature and stores nothing", async () => {
    const { deps, stored } = webhookDeps();
    const { raw, headers } = signed(subscriptionBody());
    headers.set("webhook-signature", "v1,AAAA");
    const res = await receiveWebhook(new Request("https://x/api/webhooks/dodo", { method: "POST", headers, body: raw }), deps, () => {});
    expect(res.status).toBe(401);
    expect(stored.size).toBe(0);
  });

  it("refuses a body over 1 MB before reading it", async () => {
    const { deps } = webhookDeps();
    const res = await receiveWebhook(new Request("https://x/api/webhooks/dodo", { method: "POST", headers: { "content-length": String(2 * 1024 * 1024) }, body: "{}" }), deps, () => {});
    expect(res.status).toBe(413);
  });

  it("stores a delivery once, applies the re-read subscription, and treats a replay as a no-op", async () => {
    const { deps, stored, applied, calls } = webhookDeps();
    const first = await post(deps, subscriptionBody());
    expect(first.res.status).toBe(200);
    expect(first.ran).toBe(1);
    expect(stored.get("msg_mock_1")?.status).toBe("processed");
    expect(applied).toHaveLength(1);
    expect(applied[0]).toMatchObject({ orgId: ORG, state: { state: "active", paidPlanId: "pro" }, source: "subscription.active" });
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(["GET https://test.dodopayments.com/subscriptions/sub_mock1"]);
    expect(calls[0]!.headers.authorization).toBe("Bearer mock_api_key");

    const replay = await post(deps, subscriptionBody());
    expect(replay.res.status).toBe(200);
    expect(await replay.res.json()).toEqual({ received: true, duplicate: true });
    expect(replay.ran).toBe(0);
    expect(applied).toHaveLength(1);
  });

  it("takes state from the provider, not the webhook: renewed before active applies the latest subscription", async () => {
    const { deps, applied } = webhookDeps({ sub: mockSubscription({ status: "past_due" }) });
    // The payload claims nothing useful about state; the processor reads Dodo.
    await post(deps, subscriptionBody({ status: "active" }), { id: "msg_mock_renewed" });
    expect(applied[0]?.state.state).toBe("past_due");
  });

  it("ignores events for workspaces test checkout isn't open to, and fails for unknown products", async () => {
    const other = webhookDeps({ sub: mockSubscription({ orgId: OTHER_ORG }) });
    await post(other.deps, subscriptionBody(), { id: "msg_mock_other" });
    expect(other.stored.get("msg_mock_other")).toMatchObject({ status: "ignored", error: "Test checkout isn't open to this workspace." });
    expect(other.applied).toHaveLength(0);

    const unknown = webhookDeps({ sub: mockSubscription({ productId: "pdt_mock_unknown" }) });
    await post(unknown.deps, subscriptionBody(), { id: "msg_mock_unknown" });
    expect(unknown.stored.get("msg_mock_unknown")?.status).toBe("failed");
    expect(unknown.applied).toHaveLength(0);
  });

  it("ignores events with no subscription, and keeps a failed read for the hourly retry", async () => {
    const { deps, stored } = webhookDeps();
    await post(deps, { ...subscriptionBody(), type: "dispute.opened", data: { payload_type: "Dispute" } }, { id: "msg_mock_dispute" });
    expect(stored.get("msg_mock_dispute")?.status).toBe("ignored");

    const down = webhookDeps({ provider: createDodoClient({ apiKey: "k", baseUrl: config.baseUrl, mode: "test", fetch: async () => new Response("", { status: 502 }) }) });
    await post(down.deps, subscriptionBody(), { id: "msg_mock_down" });
    expect(down.stored.get("msg_mock_down")).toMatchObject({ status: "failed", error: "Reading the subscription failed: UNAVAILABLE." });
    // The sweep picks it up again.
    expect((await processWebhooks(down.deps)).claimed).toBe(1);
  });
});

describe("the Dodo client's requests (fake fetch)", () => {
  it("creates checkouts with no trial and no subscription_data, and products with no trial days", async () => {
    const dodo = fakeDodo({
      "POST /checkouts": () => ({ json: { session_id: "cks_mock", checkout_url: "https://test.checkout.dodopayments.com/session/cks_mock" } }),
      "POST /products": () => ({ json: { product_id: "pdt_mock_new" } }),
    });
    const client = createDodoClient({ apiKey: "mock_api_key", baseUrl: config.baseUrl, mode: "test", fetch: dodo.fetchImpl });
    const session = await client.createCheckoutSession({ orgId: ORG, planId: "pro", productId: "pdt_mock_pro", customer: { email: "owner@example.test" }, returnUrl: "https://www.farbaek.com/app/billing?checkout=done" });
    expect(session).toEqual({ ok: true, value: { url: "https://test.checkout.dodopayments.com/session/cks_mock", sessionId: "cks_mock" } });
    const checkoutBody = dodo.calls[0]!.body as Record<string, unknown>;
    expect(checkoutBody).not.toHaveProperty("subscription_data");
    expect(JSON.stringify(checkoutBody)).not.toContain("trial");
    expect(checkoutBody.metadata).toEqual({ farbaek_org: ORG, farbaek_plan: "pro" });
    // People may pay in a currency they choose at checkout; the consent names the conversion fee.
    expect(checkoutBody).toMatchObject({ feature_flags: { allow_currency_selection: true } });
    expect(checkoutBody).not.toHaveProperty("billing_currency");

    await client.createProduct({ planId: "pro", name: "Farbaek Pro", description: "x", amountCents: 5000, currency: "USD" });
    const price = (dodo.calls[1]!.body as { price: Record<string, unknown> }).price;
    expect(price).toMatchObject({ type: "recurring_price", price: 5000, currency: "USD", payment_frequency_interval: "Month", subscription_period_count: 20, subscription_period_interval: "Year", tax_inclusive: false, trial_period_days: 0 });

    // Lite and Maker are charged once a year (ADR 0105).
    await client.createProduct({ planId: "lite", interval: "year", name: "Farbaek Lite", description: "x", amountCents: 1188, currency: "USD" });
    expect((dodo.calls[2]!.body as { price: Record<string, unknown> }).price).toMatchObject({ price: 1188, payment_frequency_interval: "Year", trial_period_days: 0 });
  });

  it("reads a product's interval for the office's check", async () => {
    const dodo = fakeDodo({ "GET /products/pdt_mock_lite": () => ({ json: { product_id: "pdt_mock_lite", is_recurring: true, price: { price: 1188, currency: "USD", trial_period_days: 0, payment_frequency_interval: "Year" } } }) });
    const client = createDodoClient({ apiKey: "mock_api_key", baseUrl: config.baseUrl, mode: "test", fetch: dodo.fetchImpl });
    expect(await client.getProductPrice("pdt_mock_lite")).toEqual({ ok: true, value: { amountCents: 1188, currency: "USD", recurring: true, trialDays: 0, interval: "year" } });
  });

  it("maps provider errors to codes and refuses odd ids before calling", async () => {
    const client = createDodoClient({ apiKey: "k", baseUrl: config.baseUrl, mode: "test", fetch: async () => new Response("{}", { status: 401 }) });
    expect(await client.getSubscription("sub_mock1")).toEqual({ ok: false, code: "UNAUTHORIZED", status: 401 });
    const never = vi.fn<Fetch>();
    const strict = createDodoClient({ apiKey: "k", baseUrl: config.baseUrl, mode: "test", fetch: never });
    expect(await strict.getSubscription("../customers")).toEqual({ ok: false, code: "REJECTED" });
    expect(never).not.toHaveBeenCalled();
  });
});

function billingDeps(account: BillingAccount | null, over: Partial<BillingDeps> = {}, routes: Parameters<typeof fakeDodo>[0] = {}) {
  const dodo = fakeDodo({
    "POST /checkouts": () => ({ json: { session_id: "cks_mock", checkout_url: "https://test.checkout.dodopayments.com/session/cks_mock" } }),
    "PATCH /subscriptions/sub_mock1": (b) => ({ json: mockSubscription({ cancelAtPeriodEnd: (b as { cancel_at_next_billing_date: boolean }).cancel_at_next_billing_date }) }),
    "GET /subscriptions/sub_mock1": () => ({ json: mockSubscription({ productId: "pdt_mock_max" }) }),
    "POST /subscriptions/sub_mock1/change-plan/preview": () => ({ json: { immediate_charge: { summary: { total_amount: 3333, currency: "USD" } } } }),
    "POST /subscriptions/sub_mock1/change-plan": () => ({ json: {} }),
    "POST /customers/cus_mock1/customer-portal/session": () => ({ json: { link: "https://test.customer.dodopayments.com/portal/mock" } }),
    ...routes,
  });
  const checkouts: unknown[] = [];
  const applied: AppliedState[] = [];
  const products: Record<string, { productId: string; amountCents: number }> = {
    pro: { productId: "pdt_mock_pro", amountCents: 5000 },
    max: { productId: "pdt_mock_max", amountCents: 10_000 },
    starter: { productId: "pdt_mock_starter", amountCents: 999 },
    lite: { productId: "pdt_mock_lite", amountCents: 1188 },
    maker: { productId: "pdt_mock_maker", amountCents: 2388 },
  };
  const deps: BillingDeps = {
    config,
    provider: createDodoClient({ apiKey: config.apiKey, baseUrl: config.baseUrl, mode: "test", fetch: dodo.fetchImpl }),
    account: async () => account,
    productFor: async (plan: PaidPlanId) => products[plan] ?? null,
    planForProduct: async (p) => (Object.entries(products).find(([, v]) => v.productId === p)?.[0] as PaidPlanId | undefined) ?? null,
    recordCheckout: async (input) => {
      checkouts.push(input);
      return { ok: true };
    },
    apply: async (_org, _sub, state) => {
      applied.push(state);
      return "applied";
    },
    now: () => NOW,
    ...over,
  };
  return { deps, checkouts, applied, calls: dodo.calls };
}

const owner = { userId: "00000000-0000-4000-8000-00000000a11c", email: "owner@example.test", role: "owner" as const };
const ws = { id: ORG, onTrial: true };
const active: BillingAccount = { state: "active", planId: "pro", subscriptionId: "sub_mock1", customerId: "cus_mock1", paidThrough: new Date("2026-12-03T08:59:00Z") };

describe("billing use cases (mock provider)", () => {
  it("checks role, the allowlist and consent before anything reaches the provider", async () => {
    const { deps, calls } = billingDeps(null);
    expect((await startCheckout(deps, ws, { ...owner, role: "member" }, "pro", true)).ok).toBe(false);
    expect(await startCheckout(deps, { ...ws, id: OTHER_ORG }, owner, "pro", true)).toMatchObject({ ok: false, code: "NOT_OPEN" });
    expect(await startCheckout(null, ws, owner, "pro", true)).toMatchObject({ ok: false, code: "NOT_OPEN" });
    expect(await startCheckout(deps, ws, owner, "pro", false)).toMatchObject({ ok: false, code: "CONSENT_REQUIRED" });
    expect(await startCheckout(deps, ws, owner, "enterprise", true)).toMatchObject({ ok: false, code: "INVALID_PLAN" });
    expect(calls).toHaveLength(0);
  });

  it("starts a checkout at Farbaek's price, with the consent words recorded", async () => {
    const { deps, checkouts } = billingDeps(null);
    const r = await startCheckout(deps, ws, owner, "pro", true);
    expect(r).toEqual({ ok: true, value: { url: "https://test.checkout.dodopayments.com/session/cks_mock" } });
    expect(checkouts[0]).toMatchObject({ orgId: ORG, sessionId: "cks_mock", planId: "pro", amountCents: 5000 });
    expect((checkouts[0] as { consentText: string }).consentText).toContain("remaining trial days end now");
  });

  it("pauses checkout when Dodo's price doesn't match the catalog, and refuses a second subscription", async () => {
    const { deps, calls } = billingDeps(null, { productFor: async () => ({ productId: "pdt_mock_pro", amountCents: 4900 }) });
    expect(await startCheckout(deps, ws, owner, "pro", true)).toMatchObject({ ok: false, code: "PRICE_MISMATCH" });
    expect(calls).toHaveLength(0);
    expect(await startCheckout(billingDeps(active).deps, ws, owner, "max", true)).toMatchObject({ ok: false, code: "ALREADY_SUBSCRIBED" });
  });

  it("cancels at the period's end with the date access ends, and resumes", async () => {
    const { deps, applied, calls } = billingDeps(active);
    const r = await setCancelAtPeriodEnd(deps, ws, owner, true);
    expect(r).toEqual({ ok: true, value: { endsAt: new Date("2026-12-03T08:59:00Z") } });
    expect(calls[0]).toMatchObject({ method: "PATCH", body: { cancel_at_next_billing_date: true } });
    expect(applied[0]?.state).toBe("cancellation_scheduled");
    await setCancelAtPeriodEnd(deps, ws, owner, false);
    expect(applied[1]?.state).toBe("active");
  });

  it("previews an upgrade with Dodo's amount, and schedules a downgrade for the period's end", async () => {
    const { deps, calls } = billingDeps(active);
    expect(await previewPlanChange(deps, ws, owner, "max")).toMatchObject({ ok: true, value: { direction: "upgrade", amountCents: 3333, currency: "USD" } });
    expect(await previewPlanChange(deps, ws, owner, "pro")).toMatchObject({ ok: false, code: "SAME_PLAN" });
    const down = await changePlan(deps, ws, owner, "starter");
    expect(down).toMatchObject({ ok: true, value: { direction: "downgrade" } });
    const changeCall = calls.find((c) => c.url.endsWith("/change-plan"))!;
    expect(changeCall.body).toMatchObject({ product_id: "pdt_mock_starter", proration_billing_mode: "do_not_bill", effective_at: "next_billing_date" });
    const up = billingDeps(active);
    await changePlan(up.deps, ws, owner, "max");
    expect(up.calls.find((c) => c.url.endsWith("/change-plan"))!.body).toMatchObject({ proration_billing_mode: "prorated_immediately", effective_at: "immediately", on_payment_failure: "prevent_change" });
    // After the change, the subscription is read again and applied.
    expect(up.applied.at(-1)).toMatchObject({ state: "active", paidPlanId: "max" });
  });

  it("charges Lite and Maker their yearly price, and says what to do when Dodo won't move a yearly plan to a monthly one (ADR 0105)", async () => {
    const fresh = billingDeps(null);
    expect(await startCheckout(fresh.deps, ws, owner, "lite", true)).toMatchObject({ ok: true });
    expect(fresh.checkouts[0]).toMatchObject({ planId: "lite", amountCents: 1188 });
    // A product priced monthly by mistake pauses checkout.
    const wrong = billingDeps(null, { productFor: async () => ({ productId: "pdt_mock_lite", amountCents: 99 }) });
    expect(await startCheckout(wrong.deps, ws, owner, "lite", true)).toMatchObject({ ok: false, code: "PRICE_MISMATCH" });

    const lite: BillingAccount = { ...active, planId: "lite" };
    const refused = billingDeps(lite, {}, { "POST /subscriptions/sub_mock1/change-plan": () => ({ status: 422, json: { message: "interval" } }) });
    const r = await changePlan(refused.deps, ws, owner, "starter");
    expect(r).toMatchObject({ ok: false, code: "YEARLY_SWITCH" });
    expect(r.ok ? "" : r.message).toContain("nothing was charged");
    // Between the two yearly plans, or down to one, it's an ordinary change.
    const toMaker = billingDeps(lite, {}, { "POST /subscriptions/sub_mock1/change-plan": () => ({ status: 422, json: {} }) });
    expect(await changePlan(toMaker.deps, ws, owner, "maker")).toMatchObject({ ok: false, code: "PROVIDER", detail: "REJECTED" });
    const down = billingDeps(active);
    expect(await changePlan(down.deps, ws, owner, "lite")).toMatchObject({ ok: true, value: { direction: "downgrade" } });
    expect(down.calls.find((c) => c.url.endsWith("/change-plan"))!.body).toMatchObject({ product_id: "pdt_mock_lite", effective_at: "next_billing_date" });
  });

  it("opens the portal for the workspace's own customer", async () => {
    const { deps, calls } = billingDeps(active);
    expect(await openPortal(deps, ws, owner)).toEqual({ ok: true, value: { url: "https://test.customer.dodopayments.com/portal/mock" } });
    expect(calls[0]!.url).toBe("https://test.dodopayments.com/customers/cus_mock1/customer-portal/session?return_url=https%3A%2F%2Fwww.farbaek.com%2Fapp%2Fbilling");
    expect(await openPortal(billingDeps(null).deps, ws, owner)).toMatchObject({ ok: false, code: "NOT_SUBSCRIBED" });
  });
});

describe("billing config", () => {
  const env = { BILLING_MODE: "test", DODO_PAYMENTS_API_KEY: "mock", DODO_PAYMENTS_WEBHOOK_KEY: "mock", BILLING_TEST_WORKSPACES: `${ORG}, not-a-uuid` };

  it("connects only in test mode with both keys, and live stays refused", () => {
    expect(readBillingConfig({})).toBeNull();
    expect(readBillingConfig({ ...env, DODO_PAYMENTS_WEBHOOK_KEY: "" })).toBeNull();
    expect(readBillingConfig({ ...env, BILLING_MODE: "live" })).toBeNull();
    const c = readBillingConfig(env)!;
    expect(c.baseUrl).toBe("https://test.dodopayments.com");
    expect([...c.testWorkspaces]).toEqual([ORG]);
    expect(checkoutOpenFor(c, ORG.toUpperCase())).toBe(true);
    expect(checkoutOpenFor(c, OTHER_ORG)).toBe(false);
  });

  it("goes live only with the keys and an owner's confirmation, then opens checkout to every workspace", () => {
    const live = { ...env, BILLING_MODE: "live" };
    expect(readBillingConfig(live, { confirmed: false })).toBeNull();
    const c = readBillingConfig(live, { confirmed: true })!;
    expect(c).toMatchObject({ mode: "live", baseUrl: "https://live.dodopayments.com" });
    expect(checkoutOpenFor(c, OTHER_ORG)).toBe(true);
    expect(readBillingConfig({ BILLING_MODE: "live", DODO_PAYMENTS_API_KEY: "mock" }, { confirmed: true })).toBeNull();
    // Office Space reads the keys before the confirmation, to make live products first.
    expect(readProviderConfig(live)?.mode).toBe("live");
  });

  it("describes its state by name only, never a value", () => {
    expect(billingStatus({})).toEqual({ on: false, detail: "Not connected" });
    expect(billingStatus({ BILLING_MODE: "live" }).on).toBe(false);
    expect(billingStatus({ ...env, BILLING_MODE: "live" }, false)).toEqual({ on: false, detail: "Live keys are set; an owner confirms Go live in Office Space" });
    expect(billingStatus({ ...env, BILLING_MODE: "live" }, true)).toEqual({ on: true, detail: "Live payments, open to every workspace" });
    expect(billingStatus({ BILLING_MODE: "test" }).detail).toBe("Test mode needs DODO_PAYMENTS_API_KEY and DODO_PAYMENTS_WEBHOOK_KEY");
    const on = billingStatus({ ...env, DODO_PAYMENTS_API_KEY: "secret_value_mock" });
    expect(on).toEqual({ on: true, detail: "Dodo test mode, open to 1 workspace" });
    expect(JSON.stringify(on)).not.toContain("secret_value_mock");
  });
});

describe("billing notices (mock states)", () => {
  const base: AppliedState = { state: "active", paidPlanId: "pro", paidThrough: new Date("2026-12-03T09:00:00Z"), suspendedReason: null, cancelAtPeriodEnd: false, startedAt: NOW };
  it("tells owners and admins about a change of state, and nothing on a renewal", () => {
    expect(billingNotice("trialing", base, "Mock Studio")).toMatchObject({ subject: "Mock Studio is on Pro", link: { path: "/app/billing" } });
    expect(billingNotice("trialing", base, "Mock Studio")!.lines[0]).toContain("renewing on December 3, 2026");
    expect(billingNotice("active", base, "Mock Studio")).toBeNull();
    expect(billingNotice("cancellation_scheduled", base, "Mock Studio")!.subject).toBe("Mock Studio keeps Pro");
  });

  it("says when a cancelled plan ends, and what a failed payment means", () => {
    const cancelling = billingNotice("active", { ...base, state: "cancellation_scheduled", cancelAtPeriodEnd: true }, "Mock Studio")!;
    expect(cancelling.lines[0]).toBe("Pro keeps working until December 3, 2026. Then Mock Studio moves to Free and nothing more is charged.");
    expect(billingNotice("active", { ...base, state: "past_due" }, "Mock Studio")).toMatchObject({ subject: "Mock Studio: a payment didn't go through", link: { label: "Update payment method" } });
    expect(billingNotice("past_due", { ...base, state: "suspended", suspendedReason: "payment" }, "Mock Studio")!.lines[1]).toContain("data are kept");
    expect(billingNotice("cancellation_scheduled", { ...base, state: "expired", paidPlanId: null, paidThrough: null }, "Mock Studio")!.subject).toBe("Mock Studio is on Free");
    for (const n of [cancelling]) expect(JSON.stringify(n)).not.toContain("—");
  });
});
