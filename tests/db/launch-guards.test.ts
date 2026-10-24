/**
 * Migration v38 (ADR 0065): no trial for a disposable address, the reason a
 * workspace started on Free, and the platform's daily AI limit.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
const TEMP = "00000000-0000-4000-8000-0000000071a1";
const SUB = "00000000-0000-4000-8000-0000000071a2";

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const billing = (org: string) => q<{ state: string; trial_withheld: string | null }>("select state, trial_withheld from public.billing_accounts where org_id = $1", [org]).then((r) => r[0]!);
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
const grant = (units: number) => JSON.stringify({ kind: "plan", units, starts_at: iso(-86_400_000), expires_at: iso(30 * 86_400_000), source_key: "plan:current" });
let seq = 0;
const reserve = (org: string, units: number, limit: number | null | "omit") =>
  limit === "omit"
    ? q("select public.app_reserve_usage($1, $2, $3, 'agent_step', null, $4, $5) as id", [org, USERS.alice, `g-${++seq}`, units, grant(1_000_000)])
    : q("select public.app_reserve_usage($1, $2, $3, 'agent_step', null, $4, $5, $6) as id", [org, USERS.alice, `g-${++seq}`, units, grant(1_000_000), limit]);

beforeAll(async () => {
  db = await createTestDb();
  await db.query("insert into auth.users (id, email, email_confirmed_at) values ($1, 'quick@mailinator.com', now()), ($2, 'x@inbox.mailinator.com', now())", [TEMP, SUB]);
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("trials and throwaway addresses", () => {
  it("starts a workspace on Free for a disposable domain or one of its subdomains, and says why", async () => {
    expect(await billing(await createOrg(db, TEMP, "Temp"))).toEqual({ state: "free", trial_withheld: "disposable_address" });
    expect(await billing(await createOrg(db, SUB, "Sub"))).toEqual({ state: "free", trial_withheld: "disposable_address" });
    // No claim is spent, so the person's real address can still have its trial later.
    expect((await q<{ n: number }>("select count(*)::int as n from public.trial_claims"))[0]!.n).toBe(0);
  });

  it("gives a lasting address its trial once, and says why the next workspace started on Free", async () => {
    expect(await billing(await createOrg(db, USERS.alice, "Alice Studio"))).toEqual({ state: "trialing", trial_withheld: null });
    expect(await billing(await createOrg(db, USERS.alice, "Alice Two"))).toEqual({ state: "free", trial_withheld: "address_used" });
  });

  it("matches whole labels only, and never lets the browser read the list", async () => {
    const check = (e: string) => db.query<{ d: boolean }>("select private.is_disposable_email($1) as d", [e]).then((r) => r.rows[0]!.d);
    expect(await check("a@mailinator.com")).toBe(true);
    expect(await check("a@mailinator.example.org")).toBe(false);
    expect(await check("a@gmail.com")).toBe(false);
    expect(await check("broken")).toBe(false);
    await expect(as(db, "authenticated", USERS.alice, () => db.query("select domain from public.disposable_email_domains limit 1"))).rejects.toThrow(/permission denied/);
  });
});

describe("the platform's daily AI limit", () => {
  it("refuses a reservation that would take the whole platform past today's limit, across workspaces", async () => {
    const a = (await q<{ id: string }>("select org_id as id from public.organization_members where user_id = $1 order by org_id limit 1", [USERS.alice]))[0]!.id;
    const bob = await createOrg(db, USERS.bob, "Bob Labs");
    await q("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'member')", [bob, USERS.alice]);
    await reserve(a, 600, 1000);
    await expect(reserve(bob, 500, 1000)).rejects.toThrow(/PLATFORM_DAILY_LIMIT/);
    await reserve(bob, 400, 1000);
    await expect(reserve(a, 1, 1000)).rejects.toThrow(/PLATFORM_DAILY_LIMIT/);
    // Refunded work doesn't count; no limit means none; older callers still work.
    await q("update public.ai_credit_ledger set status = 'refunded', refund_reason = 'failed', settled_at = now() where org_id = $1", [a]);
    await reserve(a, 500, 1000);
    await reserve(a, 50_000, null);
    await reserve(a, 10, "omit");
  });
});
