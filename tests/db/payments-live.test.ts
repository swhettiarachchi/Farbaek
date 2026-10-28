import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

/**
 * Migration v65 (ADR 0104): going live. Only an owner with a fresh
 * authenticator code and a reason turns live payments on or off; turning
 * them on ends every test-mode plan and test top-up, with one chained staff
 * event and one audit event per workspace. Mock data.
 */

const OWNER = "00000000-0000-4000-8000-0000000000f0";
const ADMIN = "00000000-0000-4000-8000-0000000000f1";
const REASON = "Dodo verified the business; terms approved by the owner";
let db: PGlite;
let testOrg: string;
let paidOrg: string;
const sessions: Record<string, string> = {};

const su = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const staffEvents = async () => Number((await su<{ n: number }>("select count(*)::int as n from public.staff_audit_events"))[0]!.n);
const confirm = (actor: string, strength = "step_up", reason = REASON) =>
  q<{ r: { test_plans_ended: number; test_topups_ended: number } }>("select public.app_staff_confirm_payments_live($1, $2, $3, '2026-10-28', $4, null, null) as r", [actor, sessions[actor], strength, reason]).then((x) => x[0]!.r);
const end = (actor: string, strength = "step_up") => q("select public.app_staff_end_payments_live($1, $2, $3, $4, null, null)", [actor, sessions[actor], strength, REASON]);

beforeAll(async () => {
  db = await createTestDb();
  testOrg = await createOrg(db, USERS.alice, "Mock Test Plan Studio");
  paidOrg = await createOrg(db, USERS.bob, "Mock Live Studio");
  // A test-mode Pro subscription with a test top-up grant, and a workspace that's untouched by test mode.
  await su(
    "update public.billing_accounts set state = 'cancellation_scheduled', paid_plan_id = 'pro', paid_through = now() + interval '20 days', provider = 'dodo', provider_mode = 'test', provider_customer_id = 'cus_mock', provider_subscription_id = 'sub_mock', subscription_started_at = now() - interval '1 day', cancel_at_period_end = true where org_id = $1",
    [testOrg],
  );
  const topup = (await su<{ id: string }>(
    "insert into public.billing_topups (org_id, provider, mode, session_id, product_id, pack_cents, units, consent_text, consent_sha256, status, payment_id, paid_at) values ($1, 'dodo', 'test', 'cks_mock_t', 'pdt_mock', 1000, 500, $2, $3, 'paid', 'pay_mock_t', now()) returning id",
    [testOrg, "I agree to pay $10.00 USD once for more Farbaek AI usage, as a mock.", "a".repeat(64)],
  ))[0]!.id;
  await su("insert into public.usage_grants (org_id, kind, units, starts_at, expires_at, source_key) values ($1, 'topup', 500, now() - interval '1 hour', now() + interval '12 months', $2)", [testOrg, `topup:${topup}`]);
  for (const [id, email, role] of [
    [OWNER, "info@farbaek.com", "owner"],
    [ADMIN, "admin@farbaek.com", "admin"],
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

describe("going live", () => {
  it("keeps browsers out", async () => {
    await expect(as(db, "authenticated", USERS.alice, () => db.query("select * from public.billing_go_live"))).rejects.toThrow(/permission denied/);
    await expect(as(db, "authenticated", OWNER, () => db.query("select public.app_staff_confirm_payments_live($1, $2, 'step_up', '2026-10-28', $3, null, null)", [OWNER, sessions[OWNER], REASON]))).rejects.toThrow(/permission denied/);
  });

  it("is for owners, with a fresh authenticator code and a reason, recording nothing when refused", async () => {
    const before = await staffEvents();
    await expect(confirm(ADMIN)).rejects.toThrow(/STAFF_FORBIDDEN/);
    await expect(confirm(OWNER, "aal2")).rejects.toThrow(/STEP_UP_REQUIRED/);
    await expect(confirm(OWNER, "step_up", "short")).rejects.toThrow(/REASON_REQUIRED/);
    expect(await staffEvents()).toBe(before);
    expect(await su("select 1 from public.billing_go_live")).toHaveLength(0);
  });

  it("ends every test-mode plan and test top-up, with one staff event and one audit event per workspace", async () => {
    const before = await staffEvents();
    const untouched = (await su<{ state: string }>("select state::text from public.billing_accounts where org_id = $1", [paidOrg]))[0]!.state;
    expect(await confirm(OWNER)).toEqual({ test_plans_ended: 1, test_topups_ended: 1 });
    expect(await staffEvents()).toBe(before + 1);
    const acct = (await su<Record<string, unknown>>("select state::text, paid_plan_id, provider_mode, provider_subscription_id, cancel_at_period_end from public.billing_accounts where org_id = $1", [testOrg]))[0];
    expect(acct).toEqual({ state: "free", paid_plan_id: null, provider_mode: null, provider_subscription_id: null, cancel_at_period_end: false });
    expect((await su("select 1 from public.audit_events where org_id = $1 and action = 'billing.test_plan_ended'", [testOrg]))).toHaveLength(1);
    expect((await su<{ live: boolean }>("select expires_at <= now() as live from public.usage_grants where org_id = $1 and kind = 'topup'", [testOrg]))[0]!.live).toBe(true);
    // A workspace that never used test mode is untouched.
    expect((await su<{ state: string }>("select state::text from public.billing_accounts where org_id = $1", [paidOrg]))[0]!.state).toBe(untouched);
    expect(await su("select 1 from public.audit_events where org_id = $1 and action = 'billing.test_plan_ended'", [paidOrg])).toHaveLength(0);
    const row = (await su<{ terms_version: string; ended_at: string | null }>("select terms_version, ended_at from public.billing_go_live"))[0];
    expect(row).toEqual({ terms_version: "2026-10-28", ended_at: null });
  });

  it("turns off once, by an owner with a code", async () => {
    await expect(end(OWNER, "aal2")).rejects.toThrow(/STEP_UP_REQUIRED/);
    await end(OWNER);
    expect((await su<{ ended: boolean }>("select ended_at is not null as ended from public.billing_go_live"))[0]!.ended).toBe(true);
    await expect(end(OWNER)).rejects.toThrow(/NOTHING_TO_CHANGE/);
    // Confirming again turns it back on.
    expect(await confirm(OWNER)).toEqual({ test_plans_ended: 0, test_topups_ended: 0 });
    expect((await su<{ ended: string | null }>("select ended_at as ended from public.billing_go_live"))[0]!.ended).toBeNull();
  });
});
