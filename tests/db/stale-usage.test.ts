/**
 * Migration v107 (stage 272, ADR 0279): usage reserved by a call whose server stopped before it settled goes back to the workspace's
 * plan. Only reservations too old to have a call behind them are closed; one still open and young, or already settled or refunded,
 * is never touched; running it again changes nothing; and only the server may run it. SYNTHETIC values.
 */
import type { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let bobOrg: string;

const asService = <T>(fn: () => Promise<T>) => as(db, "service_role", null, fn);
const admin = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

const DAY = 86_400_000;
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
const GRANT = JSON.stringify({ kind: "plan", units: 10_000, starts_at: iso(-DAY), expires_at: iso(30 * DAY), source_key: "plan:current" });

let seq = 0;
/** A paid reservation, as a call makes before the model is asked. */
const reserve = (units: number, o: { org?: string; actor?: string } = {}) =>
  asService(async () => (await db.query<{ id: string }>("select public.app_reserve_usage($1, $2, $3, 'agent_step', null, $4, $5) as id", [o.org ?? org, o.actor ?? USERS.alice, `key-${++seq}`, units, GRANT])).rows[0]!.id);
/** Makes a reservation as old as one a stopped server left behind. */
const age = (id: string, minutes: number) => admin("update public.ai_credit_ledger set created_at = now() - make_interval(mins => $2) where id = $1", [id, minutes]);
const release = (minutes = 60, limit = 500) => asService(async () => (await db.query<{ released: number; units: string | number; returned: string | number }>("select * from public.app_release_stale_usage($1, $2)", [minutes, limit])).rows[0]!);
const used = async (o = org) => Number((await admin<{ used: number }>("select coalesce(sum(used), 0) as used from public.usage_grants where org_id = $1", [o]))[0]!.used);
const entry = async (id: string) => (await admin<{ status: string; refund_reason: string | null; credits: number; reserved_units: number; grants: unknown[]; settled_at: string | null }>("select status, refund_reason, credits, reserved_units, grants, settled_at from public.ai_credit_ledger where id = $1", [id]))[0]!;

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  bobOrg = await createOrg(db, USERS.bob, "Bob Labs");
}, 60_000);

beforeEach(async () => {
  await admin("delete from public.ai_credit_ledger");
  await admin("delete from public.usage_grants");
});

afterAll(async () => {
  await db.close();
});

describe("usage a stopped server left reserved", () => {
  it("goes back to the plan it was drawn from, and the entry says why it was closed", async () => {
    const stale = await reserve(300);
    expect(await used()).toBe(300);
    await age(stale, 90);
    const r = await release();
    expect(r.released).toBe(1);
    expect(Number(r.units)).toBe(300);
    expect(Number(r.returned)).toBe(300);
    expect(await used()).toBe(0);
    const e = await entry(stale);
    // Nothing is counted (what the provider used was never reported); what had been reserved stays on the record.
    expect(e).toMatchObject({ status: "refunded", refund_reason: "interrupted", credits: 0, reserved_units: 300, grants: [] });
    expect(e.settled_at).not.toBeNull();
  });

  it("leaves alone a reservation young enough to have a call behind it, and ones already settled or refunded", async () => {
    const live = await reserve(200);
    const settled = await reserve(400);
    const refunded = await reserve(500);
    await asService(() => db.query("select public.app_settle_usage($1, $2, 'settled', 250, 'claude-sonnet-5-5', 1200, 800, 0, 0, null, null)", [org, settled]));
    await asService(() => db.query("select public.app_settle_usage($1, $2, 'refunded', 0, null, null, null, null, null, 'failed', null)", [org, refunded]));
    await age(live, 20);
    await age(settled, 600);
    await age(refunded, 600);
    expect(await used()).toBe(450);
    const r = await release();
    expect(r.released).toBe(0);
    expect(await used()).toBe(450);
    expect(await entry(live)).toMatchObject({ status: "reserved", refund_reason: null });
    expect(await entry(settled)).toMatchObject({ status: "settled", credits: 250 });
    expect(await entry(refunded)).toMatchObject({ status: "refunded", refund_reason: "failed" });
  });

  it("is safe to run again: a closed reservation is given back once", async () => {
    const stale = await reserve(300);
    const kept = await reserve(100);
    await age(stale, 61);
    expect((await release()).released).toBe(1);
    expect(await used()).toBe(100);
    expect((await release()).released).toBe(0);
    expect(await used()).toBe(100);
    expect(await entry(kept)).toMatchObject({ status: "reserved" });
  });

  it("works across workspaces in one run, within its batch", async () => {
    const mine = [await reserve(100), await reserve(150)];
    const theirs = await reserve(250, { org: bobOrg, actor: USERS.bob });
    for (const id of [...mine, theirs]) await age(id, 120);
    const first = await release(60, 2);
    expect(first.released).toBe(2);
    const second = await release(60, 2);
    expect(second.released).toBe(1);
    expect(await used()).toBe(0);
    expect(await used(bobOrg)).toBe(0);
  });

  it("gives a reservation drawn from two grants back to both, and says how much went to a plan still running", async () => {
    // Last period's grant, with a little left and soon to end, is drawn first; then this period's.
    await admin("insert into public.usage_grants (org_id, kind, units, starts_at, expires_at, source_key) values ($1, 'plan', 100, $2, $3, 'plan:last')", [org, iso(-40 * DAY), iso(2 * DAY)]);
    const both = await reserve(250);
    const grants = () => admin<{ source_key: string; used: number }>("select source_key, used from public.usage_grants where org_id = $1 order by expires_at", [org]);
    expect((await grants()).map((g) => [g.source_key, Number(g.used)])).toEqual([
      ["plan:last", 100],
      ["plan:current", 150],
    ]);
    // The older grant's period ends before the job runs: its share goes back to it, but is no use to anyone now.
    await admin("update public.usage_grants set expires_at = now() - interval '1 minute' where org_id = $1 and source_key = 'plan:last'", [org]);
    await age(both, 90);
    const r = await release();
    expect(r.released).toBe(1);
    expect(Number(r.units)).toBe(250);
    expect(Number(r.returned)).toBe(150);
    expect((await grants()).map((g) => [g.source_key, Number(g.used)])).toEqual([
      ["plan:last", 0],
      ["plan:current", 0],
    ]);
  });

  it("closes a reservation whose grant has since been removed, without failing", async () => {
    const stale = await reserve(300);
    await age(stale, 90);
    await admin("update public.ai_credit_ledger set grants = jsonb_build_array(jsonb_build_object('grant', gen_random_uuid(), 'units', 300)) where id = $1", [stale]);
    const r = await release();
    expect(r.released).toBe(1);
    expect(Number(r.units)).toBe(300);
    expect(Number(r.returned)).toBe(0);
    expect(await entry(stale)).toMatchObject({ status: "refunded", refund_reason: "interrupted" });
  });

  it("closes a free call's reservation without giving anything back, and keeps it in Farbaek's totals for the day", async () => {
    const free = await asService(async () => (await db.query<{ id: string }>("select public.app_reserve_free_usage($1, $2, $3, 'survey_assist', 40) as id", [org, USERS.alice, `free-${++seq}`])).rows[0]!.id);
    const today = async () => Number((await asService(async () => (await db.query<{ n: string | number }>("select public.app_platform_ai_units_today() as n")).rows))[0]!.n);
    const before = await today();
    expect(before).toBe(40);
    // Old enough to be closed, still today's.
    await age(free, 61);
    const r = await release();
    expect(r.released).toBe(1);
    expect(Number(r.units)).toBe(0);
    expect(Number(r.returned)).toBe(0);
    // A free entry counts towards the daily limits whatever became of it (v97): closing it doesn't take it out of them.
    expect(await entry(free)).toMatchObject({ status: "refunded", refund_reason: "interrupted", credits: 40 });
    expect(await today()).toBe(before);
  });

  it("can't settle afterwards: a call that somehow comes back finds its reservation closed", async () => {
    const stale = await reserve(300);
    await age(stale, 90);
    await release();
    await expect(asService(() => db.query("select public.app_settle_usage($1, $2, 'settled', 280, 'claude-sonnet-5-5', 1200, 800, 0, 0, null, null)", [org, stale]))).rejects.toThrow();
    expect(await used()).toBe(0);
  });

  it("refuses an age that could take a reservation from a call still running, and anyone but the server", async () => {
    const young = await reserve(100);
    await age(young, 20);
    await expect(release(10)).rejects.toThrow(/INVALID_REQUEST/);
    await expect(asService(() => db.query("select * from public.app_release_stale_usage(null, 10)"))).rejects.toThrow(/INVALID_REQUEST/);
    await expect(as(db, "authenticated", USERS.alice, async () => db.query("select * from public.app_release_stale_usage(60, 10)"))).rejects.toThrow();
    await expect(as(db, "anon", null, async () => db.query("select * from public.app_release_stale_usage(60, 10)"))).rejects.toThrow();
    expect(await entry(young)).toMatchObject({ status: "reserved" });
    // No call may write the hourly job's own reason.
    const other = await reserve(100);
    await expect(asService(() => db.query("select public.app_settle_usage($1, $2, 'refunded', 0, null, null, null, null, null, 'interrupted', null)", [org, other]))).rejects.toThrow();
  });

  it("reads back as the owner's check of production does", async () => {
    const line = readFileSync("scripts/vps/check-migrations.ps1", "utf8")
      .split("\n")
      .find((l) => l.includes("'v107 stale usage'"));
    expect(line).toBeTruthy();
    const expression = line!
      .slice(line!.indexOf("'v107 stale usage',") + "'v107 stale usage',".length)
      .trim()
      .replace(/;$/, "");
    expect((await admin<{ ok: boolean }>(`select (${expression}) as ok`))[0]!.ok).toBe(true);
  });
});
