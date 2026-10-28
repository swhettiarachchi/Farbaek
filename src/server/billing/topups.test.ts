/**
 * Top-ups (ADR 0102), against mocks: a fake fetch for Dodo and signed mock
 * webhooks. Nothing here talks to Dodo.
 */
import { describe, expect, it } from "vitest";
import type { TopupPack } from "@/core/billing/topups";
import { topupUnits } from "@/core/billing/topups";
import type { BillingConfig } from "./config";
import { createDodoClient, normalizePayment, type Fetch } from "./providers/dodo/client";
import { signWebhook } from "./providers/dodo/webhook";
import { setTopupCap, startTopup, type TopupDeps } from "./topups";
import type { BillingAccount } from "./use-cases";
import { receiveWebhook, type WebhookDeps } from "./webhooks";

const ORG = "00000000-0000-4000-8000-0000000000f1";
const NOW = new Date("2026-11-03T09:00:00Z");
const SECRET = `whsec_${Buffer.from("mock-signing-key-for-topups-only!!").toString("base64")}`;
const config: BillingConfig = { provider: "dodo", mode: "test", apiKey: "mock", webhookKey: SECRET, baseUrl: "https://test.dodopayments.com", testWorkspaces: new Set([ORG]), siteUrl: "https://www.farbaek.com" };
const owner = { userId: "00000000-0000-4000-8000-00000000a11c", email: "owner@example.test", role: "owner" as const };
const ws = { id: ORG, onTrial: false };
const active: BillingAccount = { state: "active", planId: "pro", subscriptionId: "sub_mock", customerId: "cus_mock", paidThrough: null };

type Call = { url: string; method: string; body: Record<string, unknown> | undefined };

function deps(over: Partial<TopupDeps> = {}, account: BillingAccount | null = active) {
  const calls: Call[] = [];
  const recorded: unknown[] = [];
  const fetchImpl: Fetch = async (url, init) => {
    calls.push({ url, method: String(init.method), body: init.body ? JSON.parse(String(init.body)) : undefined });
    return new Response(JSON.stringify({ session_id: "cks_mock_topup", checkout_url: "https://test.checkout.dodopayments.com/session/cks_mock_topup" }));
  };
  const d: TopupDeps = {
    config,
    provider: createDodoClient({ apiKey: "mock", baseUrl: config.baseUrl, mode: "test", fetch: fetchImpl }),
    account: async () => account,
    topupProduct: async (pack: TopupPack) => `pdt_mock_topup_${pack}`,
    setCap: async () => ({ ok: true }),
    recordTopup: async (input) => (recorded.push(input), { ok: true }),
    ...over,
  };
  return { d, calls, recorded };
}

describe("buying a top-up (mock provider)", () => {
  it("opens a one-time checkout marked as a top-up, and records the units at the plan's rate", async () => {
    const { d, calls, recorded } = deps();
    expect(await startTopup(d, ws, owner, 2500, true)).toEqual({ ok: true, value: { url: "https://test.checkout.dodopayments.com/session/cks_mock_topup" } });
    expect(calls[0]!.body).toMatchObject({ product_cart: [{ product_id: "pdt_mock_topup_2500", quantity: 1 }], metadata: { farbaek_org: ORG, farbaek_topup: "1" }, return_url: "https://www.farbaek.com/app/billing?topup=done" });
    expect(recorded[0]).toMatchObject({ sessionId: "cks_mock_topup", packCents: 2500, units: topupUnits("pro", 2500) });
    expect((recorded[0] as { consentText: string }).consentText).toContain("$25.00 USD once");
  });

  it("checks role, the list, the plan, the pack and consent before calling the provider", async () => {
    const { d, calls } = deps();
    expect(await startTopup(d, ws, { ...owner, role: "member" }, 1000, true)).toMatchObject({ code: "FORBIDDEN" });
    expect(await startTopup(d, { ...ws, id: "00000000-0000-4000-8000-0000000000f2" }, owner, 1000, true)).toMatchObject({ code: "NOT_OPEN" });
    expect(await startTopup(d, ws, owner, 1234, true)).toMatchObject({ code: "INVALID_PACK" });
    expect(await startTopup(d, ws, owner, 1000, false)).toMatchObject({ code: "CONSENT_REQUIRED" });
    expect(await startTopup(deps({}, { ...active, state: "trialing", planId: null }).d, ws, owner, 1000, true)).toMatchObject({ code: "NOT_SUBSCRIBED" });
    expect(await startTopup(deps({ topupProduct: async () => null }).d, ws, owner, 1000, true)).toMatchObject({ code: "NO_PRODUCT" });
    expect(calls).toHaveLength(0);
  });

  it("passes on the database's limit refusals", async () => {
    const { d } = deps({ recordTopup: async () => ({ ok: false, code: "CAP_REACHED" }) });
    expect(await startTopup(d, ws, owner, 5000, true)).toMatchObject({ ok: false, code: "CAP_REACHED" });
    expect(await startTopup(deps({ recordTopup: async () => ({ ok: false, code: "NO_CAP" }) }).d, ws, owner, 1000, true)).toMatchObject({ code: "NO_CAP" });
  });

  it("sets the limit in whole dollars, clears it when empty, and refuses anything else", async () => {
    const seen: (number | null)[] = [];
    const { d } = deps({ setCap: async (i) => (seen.push(i.cents), { ok: true }) });
    expect(await setTopupCap(d, ws, owner, " 50 ")).toEqual({ ok: true, value: { cents: 5000 } });
    expect(await setTopupCap(d, ws, owner, "")).toEqual({ ok: true, value: { cents: null } });
    expect(await setTopupCap(d, ws, owner, "1001")).toMatchObject({ code: "INVALID_CAP" });
    expect(await setTopupCap(d, ws, owner, "12.5")).toMatchObject({ code: "INVALID_CAP" });
    expect(await setTopupCap(d, ws, { ...owner, role: "viewer" }, "50")).toMatchObject({ code: "FORBIDDEN" });
    expect(seen).toEqual([5000, null]);
  });
});

describe("the client (fake fetch)", () => {
  it("creates one-time top-up products and reads payments back", async () => {
    const bodies: Record<string, unknown>[] = [];
    const client = createDodoClient({ apiKey: "k", baseUrl: config.baseUrl, mode: "test", fetch: async (_u, init) => (bodies.push(JSON.parse(String(init.body))), new Response(JSON.stringify({ product_id: "pdt_new" }))) });
    await client.createProduct({ once: true, name: "Top-up", description: "x", amountCents: 1000, currency: "USD" });
    expect(bodies[0]).toMatchObject({ tax_category: "saas", price: { type: "one_time_price", price: 1000, currency: "USD", tax_inclusive: false } });
    expect(normalizePayment({ payment_id: "pay_1", status: "succeeded", checkout_session_id: "cks_1", metadata: { farbaek_org: ORG, farbaek_topup: "1" }, product_cart: [{ product_id: "pdt_1", quantity: 1 }] })).toEqual({
      id: "pay_1",
      status: "succeeded",
      checkoutSessionId: "cks_1",
      orgId: ORG,
      topup: true,
      productIds: ["pdt_1"],
    });
  });
});

describe("a top-up payment's webhook (signed mock deliveries)", () => {
  function hook(payment: Record<string, unknown>, ref: { paymentId: string; topup: boolean } | null) {
    const completed: [string, string, string][] = [];
    const finished: [string, string | null][] = [];
    const d: WebhookDeps = {
      config,
      provider: createDodoClient({ apiKey: "mock", baseUrl: config.baseUrl, mode: "test", fetch: async () => new Response(JSON.stringify(payment)) }),
      record: async (e) => e.webhookId,
      claim: async (_l, id) => (id ? [{ id, mode: "test", type: "payment.succeeded", subscriptionId: null, orgId: ORG, attempts: 1 }] : []),
      finish: async (_id, status, error) => (finished.push([status, error]), status),
      planForProduct: async () => null,
      orgForSubscription: async () => null,
      apply: async () => "applied",
      now: () => NOW,
      paymentOf: async () => ref,
      completeTopup: async (org, session, pay) => (completed.push([org, session, pay]), "paid"),
    };
    return { d, completed, finished };
  }
  async function deliver(d: WebhookDeps, id = "msg_topup_1") {
    const body = JSON.stringify({ type: "payment.succeeded", timestamp: NOW.toISOString(), data: { payload_type: "Payment", payment_id: "pay_mock", metadata: { farbaek_org: ORG, farbaek_topup: "1" } } });
    const at = Math.floor(NOW.getTime() / 1000);
    const later: (() => Promise<void>)[] = [];
    const res = await receiveWebhook(new Request("https://www.farbaek.com/api/webhooks/dodo", { method: "POST", headers: { "webhook-id": id, "webhook-timestamp": String(at), "webhook-signature": `v1,${signWebhook(id, at, body, SECRET)}` }, body }), d, (w) => later.push(w));
    for (const w of later) await w();
    return res.status;
  }
  const paid = { payment_id: "pay_mock", status: "succeeded", checkout_session_id: "cks_mock_topup", metadata: { farbaek_org: ORG, farbaek_topup: "1" } };

  it("adds the top-up once the payment reads back as succeeded, by its checkout session", async () => {
    const { d, completed, finished } = hook(paid, { paymentId: "pay_mock", topup: true });
    expect(await deliver(d)).toBe(200);
    expect(completed).toEqual([[ORG, "cks_mock_topup", "pay_mock"]]);
    expect(finished).toEqual([["processed", null]]);
  });

  it("waits while the payment isn't succeeded, and ignores payments that aren't top-ups", async () => {
    const pending = hook({ ...paid, status: "processing" }, { paymentId: "pay_mock", topup: true });
    await deliver(pending.d);
    expect(pending.completed).toEqual([]);
    expect(pending.finished[0]?.[0]).toBe("failed");
    const other = hook(paid, { paymentId: "pay_mock", topup: false });
    await deliver(other.d);
    expect(other.completed).toEqual([]);
    expect(other.finished).toEqual([["ignored", null]]);
  });

  it("trusts the payment read back, not the webhook: no session, no top-up", async () => {
    const { d, completed, finished } = hook({ ...paid, checkout_session_id: null }, { paymentId: "pay_mock", topup: true });
    await deliver(d);
    expect(completed).toEqual([]);
    expect(finished[0]).toEqual(["failed", "The payment doesn't name a Farbaek top-up checkout."]);
  });
});
