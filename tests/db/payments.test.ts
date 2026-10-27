import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

/**
 * Migration v62 (ADR 0100): payments through Dodo, in test mode. Webhooks
 * are stored once by id; a subscription applies only from the server's own
 * read, never an older one; checkouts record consent and change nothing;
 * staff create products and replay events with one chained event each.
 * Browsers can't reach any of it. Subscriptions here are mock data.
 */

const OWNER = "00000000-0000-4000-8000-0000000000d0";
const VIEWER = "00000000-0000-4000-8000-0000000000d2";
const CONSENT = "I agree to pay $50.00 USD a month, plus any applicable tax calculated at checkout, for Farbaek Pro until I cancel.";
let db: PGlite;
let org: string;
const sessions: Record<string, string> = {};

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const su = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const staffEvents = async () => Number((await su<{ n: number }>("select count(*)::int as n from public.staff_audit_events"))[0]!.n);
const auditCount = async (action: string) => Number((await su<{ n: number }>("select count(*)::int as n from public.audit_events where org_id = $1 and action = $2", [org, action]))[0]!.n);
const account = async () =>
  (await su<{ state: string; paid_plan_id: string | null; paid_through: string | null; provider_subscription_id: string | null; cancel_at_period_end: boolean; subscription_started_at: string | null }>(
    "select state::text, paid_plan_id, paid_through, provider_subscription_id, cancel_at_period_end, subscription_started_at from public.billing_accounts where org_id = $1",
    [org],
  ))[0]!;

const record = (webhookId: string, type = "subscription.active") =>
  q<{ id: string | null }>("select public.app_billing_record_webhook('dodo', 'test', $1, $2, $3, 'sub_mock1', $4, now()) as id", [webhookId, type, JSON.stringify({ type, data: {} }), org]).then((r) => r[0]!.id);

const apply = (state: string, plan: string | null, syncedAt: string, sub = "sub_mock1", cancel = false) =>
  q<{ r: string }>(
    "select public.app_billing_apply_subscription($1, 'dodo', 'test', $2, 'cus_mock1', $3, $4, '2026-12-03T09:00:00Z', $5, $6, '2026-11-03T09:00:00Z', $7, 'test') as r",
    [org, sub, state, plan, state === "suspended" ? "payment" : null, cancel, syncedAt],
  ).then((r) => r[0]!.r);

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Mock Billing Studio");
  await su("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'member')", [org, USERS.bob]);
  for (const [id, email, role] of [
    [OWNER, "info@farbaek.com", "owner"],
    [VIEWER, "viewer@farbaek.com", "viewer"],
  ] as const) {
    await su("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())", [id, email]);
    await su("insert into public.staff_members (user_id, email, role) values ($1, $2, $3)", [id, email, role]);
    sessions[id] = crypto.randomUUID();
    await su("insert into public.staff_sessions (session_id, user_id, first_factor_at) values ($1, $2, now())", [sessions[id], id]);
  }
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("who can reach it", () => {
  it("keeps browsers out of the functions and the tables, and the server key out of direct writes", async () => {
    await expect(as(db, "authenticated", USERS.alice, () => db.query("select public.app_billing_apply_subscription($1, 'dodo', 'test', 'sub_x', null, 'active', 'max_3x', now(), null, false, now(), now(), 'forged')", [org]))).rejects.toThrow(/permission denied/);
    await expect(as(db, "anon", null, () => db.query("select public.app_billing_record_webhook('dodo', 'test', 'msg_x', 'subscription.active', '{}', null, null, now())"))).rejects.toThrow(/permission denied/);
    await expect(as(db, "authenticated", USERS.alice, () => db.query("select * from public.billing_checkouts"))).rejects.toThrow(/permission denied/);
    await expect(as(db, "authenticated", USERS.alice, () => db.query("select * from public.provider_webhook_events"))).rejects.toThrow(/permission denied/);
    await expect(q("insert into public.billing_products (provider, mode, plan_id, product_id, amount_cents, currency, catalog_version) values ('dodo', 'test', 'pro', 'pdt_x', 5000, 'USD', 'v')")).rejects.toThrow(/permission denied/);
    await expect(q("insert into public.provider_webhook_events (provider, mode, webhook_id, type, payload, event_at) values ('dodo', 'test', 'msg_x', 'subscription.active', '{}', now())")).rejects.toThrow(/permission denied/);
  });
});

describe("webhooks", () => {
  it("are stored once by id, so a replay is a no-op", async () => {
    const first = await record("msg_mock_dup");
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(await record("msg_mock_dup")).toBeNull();
    expect((await q<{ n: number }>("select count(*)::int as n from public.provider_webhook_events where webhook_id = 'msg_mock_dup'"))[0]!.n).toBe(1);
  });

  it("are claimed once, retried with backoff, and dead after 8 attempts", async () => {
    const id = (await record("msg_mock_retry"))!;
    const claimed = await q<{ id: string; attempts: number }>("select * from public.app_billing_claim_webhooks(10, $1)", [id]);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]!.attempts).toBe(1);
    // A second claim while it's being processed finds nothing.
    expect(await q("select * from public.app_billing_claim_webhooks(10, $1)", [id])).toHaveLength(0);
    expect((await q<{ s: string }>("select public.app_billing_finish_webhook($1, 'failed', 'Dodo was unavailable.', null) as s", [id]))[0]!.s).toBe("failed");
    const row = (await q<{ next_attempt_at: string; last_error: string }>("select next_attempt_at, last_error from public.provider_webhook_events where id = $1", [id]))[0]!;
    expect(new Date(row.next_attempt_at).getTime()).toBeGreaterThan(Date.now() + 30_000);
    expect(row.last_error).toBe("Dodo was unavailable.");
    // Not due yet.
    expect(await q("select * from public.app_billing_claim_webhooks(10, $1)", [id])).toHaveLength(0);

    await su("update public.provider_webhook_events set attempts = 7, status = 'failed', next_attempt_at = now() - interval '1 second' where id = $1", [id]);
    expect(await q("select * from public.app_billing_claim_webhooks(10, $1)", [id])).toHaveLength(1);
    expect((await q<{ s: string }>("select public.app_billing_finish_webhook($1, 'failed', 'Still unavailable.', null) as s", [id]))[0]!.s).toBe("dead");
    await expect(q("select public.app_billing_finish_webhook($1, 'processed', null, null)", [id])).rejects.toThrow(/NOT_FOUND/);
  });
});

describe("checkout", () => {
  it("is for owners and admins, records the consent and its hash, and changes no plan", async () => {
    const start = (actor: string, session: string) =>
      q<{ id: string }>("select public.app_billing_start_checkout($1, $2, 'dodo', 'test', $3, 'pro', 'pdt_mock_pro', 5000, $4) as id", [org, actor, session, CONSENT]);
    await expect(start(USERS.bob, "cks_mock_member")).rejects.toThrow(/FORBIDDEN/);
    const before = await account();
    await start(USERS.alice, "cks_mock_1");
    await start(USERS.alice, "cks_mock_2");
    const rows = await q<{ session_id: string; status: string; consent_sha256: string }>("select session_id, status, consent_sha256 from public.billing_checkouts where org_id = $1 order by created_at", [org]);
    expect(rows.map((r) => [r.session_id, r.status])).toEqual([
      ["cks_mock_1", "expired"],
      ["cks_mock_2", "open"],
    ]);
    expect(rows[1]!.consent_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(await account()).toEqual(before);
    expect(await auditCount("billing.checkout_started")).toBe(2);
  });
});

describe("applying a subscription", () => {
  it("applies the server's read once, skips an older read, and records one audit event per change", async () => {
    expect(await apply("active", "pro", "2026-11-03T09:01:00Z")).toBe("applied");
    expect(await account()).toMatchObject({ state: "active", paid_plan_id: "pro", provider_subscription_id: "sub_mock1", cancel_at_period_end: false });
    expect((await account()).subscription_started_at).not.toBeNull();
    expect((await q<{ status: string }>("select status from public.billing_checkouts where session_id = 'cks_mock_2'"))[0]!.status).toBe("completed");
    expect(await auditCount("billing.subscription_changed")).toBe(1);

    expect(await apply("active", "pro", "2026-11-03T09:02:00Z")).toBe("unchanged");
    // An older read (a webhook processed late) never overwrites a newer one.
    expect(await apply("past_due", "pro", "2026-11-03T09:00:30Z")).toBe("stale");
    expect((await account()).state).toBe("active");
    expect(await auditCount("billing.subscription_changed")).toBe(1);

    expect(await apply("active", "pro", "2026-11-04T00:00:00Z", "sub_mock1", true)).toBe("applied");
    expect((await account()).cancel_at_period_end).toBe(true);
    expect(await apply("expired", null, "2026-12-04T00:00:00Z")).toBe("applied");
    expect(await account()).toMatchObject({ state: "expired", paid_plan_id: null, paid_through: null, cancel_at_period_end: false });
    expect(await auditCount("billing.subscription_changed")).toBe(3);
  });

  it("ignores an ended subscription that isn't the workspace's current one", async () => {
    expect(await apply("active", "max", "2026-12-05T00:00:00Z", "sub_mock2")).toBe("applied");
    expect(await apply("expired", null, "2026-12-06T00:00:00Z", "sub_mock_old")).toBe("other_subscription");
    expect((await account()).paid_plan_id).toBe("max");
  });

  it("refuses an invalid state and a live state without a plan", async () => {
    await expect(apply("trialing", "pro", "2026-12-07T00:00:00Z", "sub_mock2")).rejects.toThrow(/INVALID_STATE/);
    await expect(apply("active", null, "2026-12-07T00:00:00Z", "sub_mock2")).rejects.toThrow(/PLAN_REQUIRED/);
  });

  it("refuses a second checkout while subscribed", async () => {
    await expect(q("select public.app_billing_start_checkout($1, $2, 'dodo', 'test', 'cks_mock_3', 'pro', 'pdt_mock_pro', 5000, $3)", [org, USERS.alice, CONSENT])).rejects.toThrow(/ALREADY_SUBSCRIBED/);
  });
});

describe("Office Space", () => {
  it("lets owners record products, once each, with one chained event", async () => {
    const recordProduct = (actor: string, plan: string, product: string) =>
      q("select public.app_staff_record_billing_product($1, $2, 'dodo', 'test', $3, $4, 5000, 'USD', '2026-10-18.1', null, null)", [actor, sessions[actor], plan, product]);
    const before = await staffEvents();
    await expect(recordProduct(VIEWER, "pro", "pdt_mock_v")).rejects.toThrow(/STAFF_FORBIDDEN/);
    await recordProduct(OWNER, "pro", "pdt_mock_pro");
    await expect(recordProduct(OWNER, "pro", "pdt_mock_pro_again")).rejects.toThrow(/PRODUCT_EXISTS/);
    expect(await staffEvents()).toBe(before + 1);
  });

  it("replays only failed or dead events, with one chained event", async () => {
    const id = (await q<{ id: string }>("select id from public.provider_webhook_events where webhook_id = 'msg_mock_retry'"))[0]!.id;
    const fresh = (await record("msg_mock_fresh"))!;
    const replay = (actor: string, event: string) => q("select public.app_staff_replay_webhook($1, $2, $3, null, null)", [actor, sessions[actor], event]);
    const before = await staffEvents();
    await expect(replay(VIEWER, id)).rejects.toThrow(/STAFF_FORBIDDEN/);
    await expect(replay(OWNER, fresh)).rejects.toThrow(/NOT_REPLAYABLE/);
    await replay(OWNER, id);
    expect((await q<{ status: string; attempts: number }>("select status, attempts from public.provider_webhook_events where id = $1", [id]))[0]).toEqual({ status: "received", attempts: 0 });
    expect(await staffEvents()).toBe(before + 1);
  });
});
