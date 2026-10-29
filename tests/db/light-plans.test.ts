import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

/**
 * Migrations v66 and v67 (ADR 0105): Lite and Maker, billed yearly or monthly. The plan checks
 * take the two new plans, a product records its interval, and the renewal
 * reminder goes once per renewal date, only to workspaces on a yearly plan
 * that's still set to renew in 16 to 30 days. Mock data.
 */

const OWNER = "00000000-0000-4000-8000-0000000000f0";
const CAROL = "00000000-0000-4000-8000-0000000000c3";
let db: PGlite;
let liteOrg: string;
let cancellingOrg: string;
let proOrg: string;
let session: string;

const su = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const candidates = (now = "now()") => q<{ org_id: string; plan_id: string }>(`select org_id, plan_id from public.app_billing_renewal_candidates(${now}, array['lite', 'maker'])`);
const subscribe = (org: string, plan: string, renewsIn: string, cancel = false) =>
  su(
    `update public.billing_accounts set state = $2, paid_plan_id = $3, paid_through = now() + $4::interval, provider = 'dodo', provider_mode = 'live', provider_customer_id = 'cus_' || left(md5($1::text), 8), provider_subscription_id = 'sub_' || left(md5($1::text), 8), subscription_started_at = now() - interval '11 months', cancel_at_period_end = $5 where org_id = $1`,
    [org, cancel ? "cancellation_scheduled" : "active", plan, renewsIn, cancel],
  );

beforeAll(async () => {
  db = await createTestDb();
  liteOrg = await createOrg(db, USERS.alice, "Mock Lite Studio");
  cancellingOrg = await createOrg(db, USERS.bob, "Mock Cancelling Studio");
  await su("insert into auth.users (id, email, email_confirmed_at) values ($1, 'carol@example.test', now())", [CAROL]);
  proOrg = await createOrg(db, CAROL, "Mock Pro Studio");
  await subscribe(liteOrg, "lite", "20 days");
  await subscribe(cancellingOrg, "maker", "20 days", true);
  // Paid monthly (v67): renews too, but monthly plans get no yearly reminder.
  await subscribe(proOrg, "maker_monthly", "20 days");
  await su("insert into auth.users (id, email, email_confirmed_at) values ($1, 'info@farbaek.com', now())", [OWNER]);
  await su("insert into public.staff_members (user_id, email, role) values ($1, 'info@farbaek.com', 'owner')", [OWNER]);
  session = crypto.randomUUID();
  await su("insert into public.staff_sessions (session_id, user_id, first_factor_at) values ($1, $2, now())", [session, OWNER]);
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("Lite and Maker", () => {
  it("keeps browsers out of the reminder table and functions", async () => {
    await expect(as(db, "authenticated", USERS.alice, () => db.query("select * from public.billing_renewal_reminders"))).rejects.toThrow(/permission denied/);
    await expect(as(db, "anon", null, () => db.query("select public.app_billing_claim_renewal_reminder($1, now())", [liteOrg]))).rejects.toThrow(/permission denied/);
    await expect(as(db, "authenticated", USERS.alice, () => db.query("select * from public.app_billing_renewal_candidates(now(), array['lite'])"))).rejects.toThrow(/permission denied/);
  });

  it("accepts the two plans and records a yearly product", async () => {
    expect((await su<{ paid_plan_id: string }>("select paid_plan_id from public.billing_accounts where org_id = $1", [liteOrg]))[0]!.paid_plan_id).toBe("lite");
    expect((await su<{ paid_plan_id: string }>("select paid_plan_id from public.billing_accounts where org_id = $1", [proOrg]))[0]!.paid_plan_id).toBe("maker_monthly");
    await expect(su("update public.billing_accounts set paid_plan_id = 'mini' where org_id = $1", [liteOrg])).rejects.toThrow(/check constraint/);
    await q("select public.app_staff_record_billing_product($1, $2, 'dodo', 'live', 'lite', 'pdt_mock_lite', 1188, 'USD', '2026-10-18.1', null, null, 'year')", [OWNER, session]);
    // Without an interval it's monthly, as before.
    await q("select public.app_staff_record_billing_product($1, $2, 'dodo', 'live', 'starter', 'pdt_mock_starter', 999, 'USD', '2026-10-18.1', null, null)", [OWNER, session]);
    expect(await su("select plan_id, interval, amount_cents from public.billing_products order by plan_id")).toEqual([
      { plan_id: "lite", interval: "year", amount_cents: 1188 },
      { plan_id: "starter", interval: "month", amount_cents: 999 },
    ]);
    await expect(q("select public.app_staff_record_billing_product($1, $2, 'dodo', 'live', 'maker', 'pdt_mock_maker', 2388, 'USD', '2026-10-18.1', null, null, 'week')", [OWNER, session])).rejects.toThrow(/check constraint/);
  });

  it("finds only yearly plans still set to renew in 16 to 30 days", async () => {
    expect(await candidates()).toEqual([{ org_id: liteOrg, plan_id: "lite" }]);
    // 40 days out is too early, 10 days out too late.
    expect(await candidates("now() - interval '20 days'")).toEqual([]);
    expect(await candidates("now() + interval '10 days'")).toEqual([]);
  });

  it("claims a renewal once, takes back a failed one, and records the result", async () => {
    const renews = (await su<{ paid_through: string }>("select paid_through from public.billing_accounts where org_id = $1", [liteOrg]))[0]!.paid_through;
    const claim = async () => (await q<{ ok: boolean }>("select public.app_billing_claim_renewal_reminder($1, $2) as ok", [liteOrg, renews]))[0]!.ok;
    const finish = (status: string, n: number) => q("select public.app_billing_finish_renewal_reminder($1, $2, $3, $4, null)", [liteOrg, renews, status, n]);
    expect(await claim()).toBe(true);
    expect(await claim()).toBe(false);
    expect(await candidates()).toEqual([]);
    await finish("failed", 0);
    expect(await candidates()).toEqual([{ org_id: liteOrg, plan_id: "lite" }]);
    expect(await claim()).toBe(true);
    await finish("accepted", 2);
    expect(await claim()).toBe(false);
    expect(await su("select status, recipients from public.billing_renewal_reminders")).toEqual([{ status: "accepted", recipients: 2 }]);
    await expect(finish("sent", 1)).rejects.toThrow(/INVALID_REQUEST/);
  });
});
