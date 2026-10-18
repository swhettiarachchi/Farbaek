/**
 * Migration 15: the usage wallet. AI usage is reserved from grants under the
 * organization lock, soonest expiry first; settling to the real cost or
 * refunding gives usage back to the same grants; free-retry refunds are
 * capped; only the server can write. Also the new plan ids.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let bobOrg: string;
let task: string;

const asService = <T>(fn: () => Promise<T>) => as(db, "service_role", null, fn);
const asUser = <T>(uid: string, fn: () => Promise<T>) => as(db, "authenticated", uid, fn);
const admin = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

const DAY = 86_400_000;
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();

let seq = 0;
const grant = (units: number, key = "plan:current", startsIn = -DAY, expiresIn = 30 * DAY) => ({ kind: key.split(":")[0], units, starts_at: iso(startsIn), expires_at: iso(expiresIn), source_key: key });

async function reserve(units: number, opts: { org?: string; actor?: string; grant?: object | null; key?: string; task?: string | null } = {}) {
  return asService(async () => {
    const r = await db.query<{ id: string }>("select public.app_reserve_usage($1, $2, $3, 'agent_step', $4, $5, $6) as id", [
      opts.org ?? org,
      opts.actor ?? USERS.alice,
      opts.key ?? `key-${++seq}`,
      opts.task === undefined ? task : opts.task,
      units,
      opts.grant === undefined ? JSON.stringify(grant(10_000)) : opts.grant === null ? null : JSON.stringify(opts.grant),
    ]);
    return r.rows[0]!.id;
  });
}

async function settle(entry: string, status: "settled" | "refunded", units: number, opts: { reason?: string | null; cap?: number | null; owner?: string } = {}) {
  return asService(() =>
    db.query("select public.app_settle_usage($1, $2, $3, $4, 'claude-sonnet-5-5', 1200, 800, 5000, 90000, $5, $6)", [
      opts.owner ?? org,
      entry,
      status,
      units,
      opts.reason ?? (status === "refunded" ? "failed" : null),
      opts.cap === undefined ? 1_000 : opts.cap,
    ]),
  );
}

const grants = () => admin<{ source_key: string; units: number; used: number }>("select source_key, units, used from public.usage_grants where org_id = $1 order by expires_at", [org]);
const ledger = (id: string) => admin<{ status: string; credits: number; reserved_units: number; grants: { grant: string; units: number }[]; refund_reason: string | null }>("select status, credits, reserved_units, grants, refund_reason from public.ai_credit_ledger where id = $1", [id]).then((r) => r[0]!);

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  bobOrg = await createOrg(db, USERS.bob, "Bob Labs");
  task = await asService(async () => {
    const p = await db.query<{ id: string }>("select public.app_create_project($1, $2, 'Storefront', null, null) as id", [org, USERS.alice]);
    const t = await db.query<{ id: string }>("select public.app_create_task($1, $2, $3, 'Fix the hero') as id", [org, USERS.alice, p.rows[0]!.id]);
    return t.rows[0]!.id;
  });
}, 60_000);

beforeEach(async () => {
  await admin("delete from public.ai_credit_ledger where org_id = $1", [org]);
  await admin("delete from public.usage_grants where org_id = $1", [org]);
});

afterAll(async () => {
  await db.close();
});

describe("plans", () => {
  it("accepts only the new plan ids, and trials carry Pro", async () => {
    await admin("update public.billing_accounts set state = 'active', paid_plan_id = 'max_2x' where org_id = $1", [bobOrg]);
    await expect(admin("update public.billing_accounts set paid_plan_id = 'team' where org_id = $1", [bobOrg])).rejects.toThrow(/paid_plan_id_check/);
    expect(await admin("select distinct plan_id from public.trials")).toEqual([{ plan_id: "pro" }]);
  });
});

describe("reserving usage", () => {
  it("issues the period's grant once and draws from it", async () => {
    const a = await reserve(300);
    await reserve(200);
    expect(await grants()).toEqual([{ source_key: "plan:current", units: 10000, used: 500 }]);
    expect(await ledger(a)).toMatchObject({ status: "reserved", credits: 300, reserved_units: 300 });
  });

  it("spends rolled-over usage first, then this period's, and refuses what isn't there", async () => {
    // Last month's grant expires sooner, so it is drawn first.
    await admin("insert into public.usage_grants (org_id, kind, units, starts_at, expires_at, source_key) values ($1, 'plan', 1000, $2, $3, 'plan:last')", [org, iso(-40 * DAY), iso(20 * DAY)]);
    const r = await reserve(1_500);
    expect(await grants()).toEqual([
      { source_key: "plan:last", units: 1000, used: 1000 },
      { source_key: "plan:current", units: 10000, used: 500 },
    ]);
    expect((await ledger(r)).grants.map((g) => g.units)).toEqual([1_000, 500]);
    await expect(reserve(9_501)).rejects.toThrow(/QUOTA_EXCEEDED/);
    // A refused reservation draws nothing.
    expect((await grants())[1]).toMatchObject({ used: 500 });
  });

  it("never draws from expired or future grants", async () => {
    await admin("insert into public.usage_grants (org_id, kind, units, starts_at, expires_at, source_key) values ($1, 'plan', 5000, $2, $3, 'plan:old'), ($1, 'plan', 5000, $4, $5, 'plan:next')", [
      org,
      iso(-70 * DAY),
      iso(-DAY),
      iso(DAY),
      iso(60 * DAY),
    ]);
    await expect(reserve(100, { grant: null })).rejects.toThrow(/QUOTA_EXCEEDED/);
  });

  it("validates grants, units, keys, membership and tasks", async () => {
    await expect(reserve(100, { grant: { ...grant(100), expires_at: iso(90 * DAY) } })).rejects.toThrow(/INVALID_GRANT/);
    await expect(reserve(100, { grant: { ...grant(100), source_key: "topup:x" } })).rejects.toThrow(/INVALID_GRANT/);
    await expect(reserve(0)).rejects.toThrow(/INVALID_CREDITS/);
    await reserve(1, { key: "same" });
    await expect(reserve(1, { key: "same" })).rejects.toThrow(/DUPLICATE_REQUEST/);
    await expect(reserve(1, { actor: USERS.bob })).rejects.toThrow(/FORBIDDEN/);
    await expect(reserve(1, { org: bobOrg, actor: USERS.bob })).rejects.toThrow(/NOT_FOUND/);
  });
});

describe("settling usage", () => {
  it("gives back what a call didn't use, to the grants it drew from", async () => {
    const r = await reserve(1_000);
    await settle(r, "settled", 640);
    expect(await ledger(r)).toMatchObject({ status: "settled", credits: 640, reserved_units: 1_000 });
    expect((await grants())[0]).toMatchObject({ used: 640 });
  });

  it("draws the difference when a call cost more, and absorbs what isn't there", async () => {
    const r = await reserve(9_000);
    await settle(r, "settled", 9_500);
    expect((await grants())[0]).toMatchObject({ used: 9500 });
    const s = await reserve(400);
    await settle(s, "settled", 1_000);
    expect(await ledger(s)).toMatchObject({ credits: 500 });
    expect((await grants())[0]).toMatchObject({ used: 10000 });
  });

  it("refunds failed calls in full, and closes an entry only once", async () => {
    const r = await reserve(800);
    await settle(r, "refunded", 120);
    expect(await ledger(r)).toMatchObject({ status: "refunded", refund_reason: "failed", grants: [] });
    expect((await grants())[0]).toMatchObject({ used: 0 });
    await expect(settle(r, "settled", 10)).rejects.toThrow(/NOT_FOUND/);
    await expect(settle(r, "refunded", 10, { reason: null })).rejects.toThrow(/INVALID_STATUS|NOT_FOUND/);
  });

  it("caps free retries per 31 days", async () => {
    const a = await reserve(600);
    await settle(a, "refunded", 600, { reason: "free_retry", cap: 1_000 });
    const b = await reserve(600);
    await expect(settle(b, "refunded", 600, { reason: "free_retry", cap: 1_000 })).rejects.toThrow(/RETRY_CAP/);
    await settle(b, "settled", 600);
    expect((await grants())[0]).toMatchObject({ used: 600 });
  });
});

describe("access", () => {
  it("only the server reserves and settles", async () => {
    await expect(asUser(USERS.alice, () => db.query("select public.app_reserve_usage($1, $2, 'k', 'agent_step', null, 1, null)", [org, USERS.alice]))).rejects.toThrow(/permission denied/);
    await expect(asUser(USERS.alice, () => db.query("select public.app_settle_usage($1, gen_random_uuid(), 'settled', 1, null, 0, 0, 0, 0, null, 0)", [org]))).rejects.toThrow(/permission denied/);
  });

  it("members read their own grants only, and browsers can't write them", async () => {
    await reserve(10);
    expect(await asUser(USERS.alice, async () => (await db.query("select units from public.usage_grants where org_id = $1", [org])).rows)).toHaveLength(1);
    expect(await asUser(USERS.bob, async () => (await db.query("select units from public.usage_grants where org_id = $1", [org])).rows)).toEqual([]);
    await expect(asUser(USERS.alice, () => db.query("update public.usage_grants set used = 0 where org_id = $1", [org]))).rejects.toThrow(/permission denied/);
    await expect(as(db, "anon", null, () => db.query("select * from public.usage_grants"))).rejects.toThrow(/permission denied/);
  });
});
