import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

/**
 * Migration v64 (ADR 0102): top-ups with a spend cap. No limit means no
 * top-ups; open checkouts count toward the limit; a top-up becomes one
 * 12-month grant, once, only for its own checkout session. Mock data.
 */

const OWNER = "00000000-0000-4000-8000-0000000000e0";
const VIEWER = "00000000-0000-4000-8000-0000000000e2";
const CONSENT = "I agree to pay $10.00 USD once, plus any applicable tax calculated at checkout, for more Farbaek Pro AI usage.";
let db: PGlite;
let org: string;
const sessions: Record<string, string> = {};
let n = 0;

const su = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const audits = async (action: string) => Number((await su<{ n: number }>("select count(*)::int as n from public.audit_events where org_id = $1 and action = $2", [org, action]))[0]!.n);
const setCap = (cents: number | null, actor: string = USERS.alice) => q("select public.app_billing_set_topup_cap($1, $2, $3)", [org, actor, cents]);
const start = (pack: number, actor: string = USERS.alice) => {
  n += 1;
  return q<{ id: string }>("select public.app_billing_start_topup($1, $2, 'dodo', 'test', $3, 'pdt_mock_topup', $4, 1234, $5) as id", [org, actor, `cks_mock_topup_${n}`, pack, CONSENT]).then((r) => ({ id: r[0]!.id, session: `cks_mock_topup_${n}` }));
};
const complete = (session: string, payment: string) => q<{ r: string }>("select public.app_billing_complete_topup($1, $2, $3) as r", [org, session, payment]).then((r) => r[0]!.r);

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Mock Topup Studio");
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
  it("keeps browsers out", async () => {
    await expect(as(db, "authenticated", USERS.alice, () => db.query("select public.app_billing_set_topup_cap($1, $2, 5000)", [org, USERS.alice]))).rejects.toThrow(/permission denied/);
    await expect(as(db, "authenticated", USERS.alice, () => db.query("select * from public.billing_topups"))).rejects.toThrow(/permission denied/);
    await expect(q("insert into public.billing_topup_products (provider, mode, pack_cents, product_id, catalog_version) values ('dodo', 'test', 1000, 'pdt_x', 'v')")).rejects.toThrow(/permission denied/);
  });
});

describe("the spend cap", () => {
  it("is set by owners and admins, and top-ups need a paid plan and a limit", async () => {
    await expect(setCap(5000, USERS.bob)).rejects.toThrow(/FORBIDDEN/);
    await expect(setCap(200000)).rejects.toThrow(/INVALID_REQUEST/);
    // Not subscribed yet.
    await expect(start(1000)).rejects.toThrow(/NOT_SUBSCRIBED/);
    await su("update public.billing_accounts set state = 'active', paid_plan_id = 'pro' where org_id = $1", [org]);
    await expect(start(1000)).rejects.toThrow(/NO_CAP/);
    await setCap(3500);
    expect(await audits("billing.topup_cap_set")).toBe(1);
  });

  it("counts open checkouts and paid top-ups this month", async () => {
    const first = await start(2500);
    // 2,500 open + 1,000 = 3,500: fits exactly.
    const second = await start(1000);
    await expect(start(1000)).rejects.toThrow(/CAP_REACHED/);
    await expect(start(1000, USERS.bob)).rejects.toThrow(/FORBIDDEN/);
    expect(await audits("billing.topup_started")).toBe(2);
    // An open checkout older than a day no longer holds room.
    await su("update public.billing_topups set created_at = now() - interval '2 days' where id = $1", [second.id]);
    const third = await start(1000);
    expect(third.id).toMatch(/^[0-9a-f-]{36}$/);
    // Paying the first keeps its room this month.
    expect(await complete(first.session, "pay_mock_1")).toBe("paid");
    await expect(start(1000)).rejects.toThrow(/CAP_REACHED/);
  });
});

describe("completing a top-up", () => {
  it("adds one 12-month grant for the checkout session it was paid through, once", async () => {
    await setCap(100000);
    const t = await start(5000);
    await expect(complete("cks_someone_else", "pay_mock_2")).rejects.toThrow(/NOT_FOUND/);
    expect(await complete(t.session, "pay_mock_2")).toBe("paid");
    expect(await complete(t.session, "pay_mock_2")).toBe("already");
    // The same session paid again with a different payment is refused, not granted twice.
    await expect(complete(t.session, "pay_mock_other")).rejects.toThrow(/INVALID_REQUEST/);
    const grants = await su<{ kind: string; units: string; months: number }>(
      "select kind, units, round(extract(epoch from (expires_at - starts_at)) / 86400 / 30.4)::int as months from public.usage_grants where org_id = $1 and source_key = $2",
      [org, `topup:${t.id}`],
    );
    expect(grants.map((g) => ({ ...g, units: Number(g.units) }))).toEqual([{ kind: "topup", units: 1234, months: 12 }]);
    expect(await audits("billing.topup_paid")).toBe(2);
  });
});

describe("Office Space", () => {
  it("lets owners record a pack's product once, with one chained event", async () => {
    const record = (actor: string, pack: number, product: string) =>
      q("select public.app_staff_record_topup_product($1, $2, 'dodo', 'test', $3, $4, '2026-10-18.1', null, null)", [actor, sessions[actor], pack, product]);
    const events = async () => Number((await su<{ n: number }>("select count(*)::int as n from public.staff_audit_events"))[0]!.n);
    const before = await events();
    await expect(record(VIEWER, 1000, "pdt_mock_v")).rejects.toThrow(/STAFF_FORBIDDEN/);
    await record(OWNER, 1000, "pdt_mock_topup_10");
    await expect(record(OWNER, 1000, "pdt_mock_topup_10b")).rejects.toThrow(/PRODUCT_EXISTS/);
    expect(await events()).toBe(before + 1);
  });
});
