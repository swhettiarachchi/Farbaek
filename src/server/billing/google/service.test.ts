import { describe, expect, it } from "vitest";
import type { GooglePlaySubscription } from "@/core/billing/google-play";
import type { GooglePlayClient, VoidedPurchase } from "./client";
import { claimGooglePlayPurchase, openGooglePlayIntent, runGooglePlaySync, subscriptionRef, syncGooglePurchase, tokenSha256, type BindOutcome, type GoogleDeps, type GooglePurchaseRow } from "./service";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";
const NOW = new Date("2026-11-03T12:00:00Z");
const day = 86_400_000;
const TOKEN = "abc.def-ghi_jkl.purchase.0001";

const answer = (over: Partial<GooglePlaySubscription> = {}, item: Record<string, unknown> = {}): GooglePlaySubscription => ({
  subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
  startTime: new Date(NOW.getTime() - 60_000).toISOString(),
  acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING",
  testPurchase: {},
  lineItems: [{ productId: "farbaek_starter_monthly", expiryTime: new Date(NOW.getTime() + 30 * day).toISOString(), autoRenewingPlan: { autoRenewEnabled: true }, ...item }],
  ...over,
});

/** In-memory stand-ins for the database functions and Google, recording what happened. */
function fake(opts: { answers?: Record<string, GooglePlaySubscription | null>; bind?: BindOutcome; voided?: VoidedPurchase[]; rows?: GooglePurchaseRow[] } = {}) {
  const calls: string[] = [];
  const rows = new Map<string, GooglePurchaseRow>((opts.rows ?? []).map((r) => [r.tokenSha256, r]));
  const answers = opts.answers ?? { [TOKEN]: answer() };
  const client: GooglePlayClient = {
    async getSubscription(t) {
      calls.push(`get:${t}`);
      if (!(t in answers)) throw new Error("Google unavailable");
      return answers[t] ?? null;
    },
    async acknowledge(p, t) {
      calls.push(`ack:${p}:${t}`);
    },
    async voidedSince() {
      return opts.voided ?? [];
    },
  };
  let voidedSince: Date | null = null;
  const deps: GoogleDeps = {
    client,
    async openIntent(i) {
      calls.push(`intent:${i.productId}`);
    },
    async bind(i) {
      calls.push(`bind:${i.mode}:${i.predecessorSha256 ? "successor" : "first"}`);
      const outcome = opts.bind ?? "bound";
      if (outcome === "bound" || outcome === "successor") {
        rows.set(i.tokenSha256, { tokenSha256: i.tokenSha256, purchaseToken: i.purchaseToken, orgId: i.orgId, productId: i.productId, mode: i.mode, status: "active", acknowledged: false, lastSyncedAt: null });
      }
      return outcome;
    },
    async purchase(sha) {
      return rows.get(sha) ?? null;
    },
    async apply(i) {
      calls.push(`apply:${i.plan.state}:${i.plan.planId}`);
      return "applied";
    },
    async markChecked(i) {
      calls.push(`checked:${i.status}`);
      const r = rows.get(i.tokenSha256);
      if (r) rows.set(i.tokenSha256, { ...r, status: i.status, lastSyncedAt: i.syncedAt });
    },
    async markAcknowledged(sha) {
      calls.push("acknowledged");
      const r = rows.get(sha);
      if (r) rows.set(sha, { ...r, acknowledged: true });
    },
    async due() {
      return [...rows.values()].filter((r) => r.status === "active");
    },
    async voidedSince() {
      return voidedSince;
    },
    async setVoidedSince(at) {
      voidedSince = at;
    },
    now: () => NOW,
  };
  return { deps, calls, rows };
}

const claim = (deps: GoogleDeps, over: Partial<{ orgId: string; role: "owner" | "admin" | "member" | null; purchaseToken: unknown }> = {}) =>
  claimGooglePlayPurchase(deps, { orgId: ORG, actor: USER, role: "owner", purchaseToken: TOKEN, ...over });

describe("plans bought through Google Play (ADR 0154)", () => {
  it("opens an intent only for an owner or admin and a known plan", async () => {
    const { deps, calls } = fake();
    expect(await openGooglePlayIntent(deps, { orgId: ORG, actor: USER, role: "member", productId: "farbaek_starter_monthly" })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await openGooglePlayIntent(deps, { orgId: ORG, actor: USER, role: "admin", productId: "com.other.plan" })).toMatchObject({ ok: false, code: "UNKNOWN_PRODUCT" });
    expect(await openGooglePlayIntent(deps, { orgId: ORG, actor: USER, role: "admin", productId: "farbaek_starter_monthly" })).toEqual({ ok: true, value: null });
    expect(calls).toEqual(["intent:farbaek_starter_monthly"]);
  });

  it("binds a first purchase, applies it, then acknowledges it, in that order", async () => {
    const { deps, calls, rows } = fake();
    const r = await claim(deps);
    expect(r).toEqual({ ok: true, value: { state: "active", planId: "starter", paidThrough: new Date(NOW.getTime() + 30 * day).toISOString(), pending: false } });
    expect(calls).toEqual([`get:${TOKEN}`, "bind:test:first", "apply:active:starter", `ack:farbaek_starter_monthly:${TOKEN}`, "acknowledged", "checked:active"]);
    expect(rows.get(tokenSha256(TOKEN))).toMatchObject({ acknowledged: true, mode: "test" });
    expect(subscriptionRef(tokenSha256(TOKEN))).toMatch(/^gp_[0-9a-f]{64}$/);
  });

  it("refuses without acknowledging, so Google refunds the purchase", async () => {
    for (const [bind, code] of [
      ["no_intent", "NO_INTENT"],
      ["bound_elsewhere", "ANOTHER_WORKSPACE"],
      ["needs_successor", "ALREADY_SUBSCRIBED"],
      ["paid_elsewhere", "PAID_ELSEWHERE"],
    ] as const) {
      const { deps, calls } = fake({ bind });
      const r = await claim(deps);
      expect(r, bind).toMatchObject({ ok: false, code });
      expect(r.ok ? "" : r.message, bind).toContain("refunds");
      expect(calls.some((c) => c.startsWith("ack") || c.startsWith("apply")), bind).toBe(false);
    }
    expect(await claim(fake().deps, { role: "member" })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await claim(fake().deps, { purchaseToken: "bad token with spaces" })).toMatchObject({ ok: false, code: "INVALID_TOKEN" });
    expect(await claim(fake({ answers: { [TOKEN]: null } }).deps)).toMatchObject({ ok: false, code: "UNKNOWN_PURCHASE" });
    expect(await claim(fake({ answers: { [TOKEN]: answer({}, { productId: "someone_elses_plan" }) } }).deps)).toMatchObject({ ok: false, code: "UNKNOWN_PRODUCT" });
    expect(await claim(fake({ answers: { [TOKEN]: answer({ lineItems: [{ productId: "farbaek_lite_monthly" }, { productId: "farbaek_pro_monthly" }] }) } }).deps)).toMatchObject({
      ok: false,
      code: "UNKNOWN_PRODUCT",
    });
    expect(await claim(fake({ answers: {} }).deps)).toMatchObject({ ok: false, code: "GOOGLE_UNAVAILABLE" });
  });

  it("never moves a token another workspace holds", async () => {
    const sha = tokenSha256(TOKEN);
    const { deps, calls } = fake({ rows: [{ tokenSha256: sha, purchaseToken: TOKEN, orgId: OTHER, productId: "farbaek_starter_monthly", mode: "live", status: "active", acknowledged: true, lastSyncedAt: null }] });
    expect(await claim(deps)).toMatchObject({ ok: false, code: "ANOTHER_WORKSPACE" });
    expect(calls).toEqual([]);
  });

  it("treats a plan change as a successor, and never applies the replaced token as expired", async () => {
    const OLD = "old.token.purchase.0000";
    const { deps, calls, rows } = fake({ answers: { [TOKEN]: answer({ linkedPurchaseToken: OLD, testPurchase: undefined }), [OLD]: answer({ subscriptionState: "SUBSCRIPTION_STATE_EXPIRED", canceledStateContext: { replacementCancellation: {} } }) } });
    rows.set(tokenSha256(OLD), { tokenSha256: tokenSha256(OLD), purchaseToken: OLD, orgId: ORG, productId: "farbaek_lite_monthly", mode: "live", status: "active", acknowledged: true, lastSyncedAt: null });
    expect(await claim(deps)).toMatchObject({ ok: true });
    expect(calls).toContain("bind:live:successor");
    calls.length = 0;
    expect(await syncGooglePurchase(deps, rows.get(tokenSha256(OLD))!)).toMatchObject({ state: "superseded" });
    expect(calls).toEqual([`get:${OLD}`, "checked:superseded"]);
  });

  it("waits while the payment is pending, then acknowledges once it's active", async () => {
    const answers: Record<string, GooglePlaySubscription> = { [TOKEN]: answer({ subscriptionState: "SUBSCRIPTION_STATE_PENDING" }) };
    const { deps, calls, rows } = fake({ answers });
    expect(await claim(deps)).toMatchObject({ ok: true, value: { pending: true } });
    expect(calls.some((c) => c.startsWith("ack") || c.startsWith("apply"))).toBe(false);
    answers[TOKEN] = answer();
    calls.length = 0;
    await syncGooglePurchase(deps, rows.get(tokenSha256(TOKEN))!);
    expect(calls).toEqual([`get:${TOKEN}`, "apply:active:starter", `ack:farbaek_starter_monthly:${TOKEN}`, "acknowledged", "checked:active"]);
  });

  it("refreshes a token already bound here at most every 5 minutes", async () => {
    const { deps, calls } = fake();
    await claim(deps);
    calls.length = 0;
    expect(await claim(deps)).toMatchObject({ ok: true, value: { state: "checked_recently" } });
    expect(calls).toEqual([]);
  });

  it("checks refunded purchases and due ones every hour, and one failure doesn't stop the rest", async () => {
    const REFUNDED = "refunded.token.purchase.0002";
    const BROKEN = "broken.token.purchase.0003";
    const row = (t: string): GooglePurchaseRow => ({ tokenSha256: tokenSha256(t), purchaseToken: t, orgId: ORG, productId: "farbaek_starter_monthly", mode: "live", status: "active", acknowledged: true, lastSyncedAt: null });
    const { deps, calls } = fake({
      answers: { [REFUNDED]: answer({ subscriptionState: "SUBSCRIPTION_STATE_EXPIRED" }) },
      rows: [row(REFUNDED), row(BROKEN)],
      voided: [{ purchaseToken: REFUNDED, orderId: "GPA.1234-5678", voidedAt: NOW }, { purchaseToken: "not.ours.token.0004", orderId: null, voidedAt: NOW }],
    });
    expect(await runGooglePlaySync(deps)).toEqual({ checked: 1, failed: 1, voided: 2 });
    expect(calls).toContain("apply:expired:null");
    // An ended purchase isn't acknowledged.
    expect(calls.some((c) => c.startsWith("ack"))).toBe(false);
    expect(await deps.voidedSince()).toEqual(new Date(NOW.getTime() - 5 * 60_000));
  });
});
