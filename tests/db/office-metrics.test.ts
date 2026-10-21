import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createOrg, createTestDb, USERS } from "./harness";

/**
 * Migration v22 (ADR 0032, phase 3): trial extensions capped by role, and
 * the owner's numbers read in one call with no revenue in them.
 */

const CEO = "00000000-0000-4000-8000-0000000000c0";
const SUPPORT = "00000000-0000-4000-8000-0000000000c1";
const ADMIN = "00000000-0000-4000-8000-0000000000c2";
const REASON = "The customer lost a week to a provider outage";

let db: PGlite;
let org: string;
const sessions: Record<string, string> = {};
const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const su = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const events = async () => Number((await su<{ n: number }>("select count(*)::int as n from public.staff_audit_events"))[0]!.n);
const trialDays = async () => Number((await su<{ d: number }>("select extract(epoch from ends_at - started_at) / 86400 as d from public.trials where org_id = $1", [org]))[0]!.d);
const extend = (who: string, days: number) => q("select public.app_staff_extend_trial($1, $2, $3, $4, $5, null, null) as ends", [who, sessions[who], org, days, REASON]);

async function signIn(user: string) {
  const session = crypto.randomUUID();
  await su("insert into auth.sessions (id, user_id) values ($1, $2)", [session, user]);
  sessions[user] = session;
  return session;
}

beforeAll(async () => {
  db = await createTestDb();
  await su(
    "insert into auth.users (id, email, email_confirmed_at) values ($1, 'info@farbaek.com', now()), ($2, 'sam@farbaek.test', now()), ($3, 'ada@farbaek.test', now())",
    [CEO, SUPPORT, ADMIN],
  );
  await q("select public.app_staff_begin_session($1, $2, now(), null, null, 'info@farbaek.com')", [CEO, await signIn(CEO)]);
  for (const [user, email, role] of [
    [SUPPORT, "sam@farbaek.test", "support"],
    [ADMIN, "ada@farbaek.test", "admin"],
  ] as const) {
    await q("select public.app_staff_invite($1, $2, $3, $4, 3, $5, 'step_up', null, null)", [CEO, sessions[CEO], email, role, REASON]);
    await q("select public.app_staff_accept_invite($1, $2, now(), null, null)", [user, await signIn(user)]);
  }
  org = await createOrg(db, USERS.alice, "Alice Studio");
  await su("insert into public.usage_grants (org_id, kind, units, starts_at, expires_at, source_key) select org_id, 'trial', 50000, started_at, ends_at, 'trial:x' from public.trials where org_id = $1", [org]);
}, 90_000);

afterAll(async () => {
  await db.close();
});

describe("extending a trial", () => {
  it("lets support add a week once, and moves the trial's usage with it", async () => {
    expect(await trialDays()).toBeCloseTo(14, 3);
    const before = await events();
    await expect(extend(SUPPORT, 8)).rejects.toThrow(/TRIAL_CAP/);
    await extend(SUPPORT, 7);
    expect(await trialDays()).toBeCloseTo(21, 3);
    expect(await su("select (expires_at = (select ends_at from public.trials where org_id = $1)) as moved from public.usage_grants where org_id = $1 and kind = 'trial'", [org])).toEqual([{ moved: true }]);
    await expect(extend(SUPPORT, 3)).rejects.toThrow(/ALREADY_EXTENDED/);
    expect(await events()).toBe(before + 1);
    expect(await su("select action from public.audit_events where org_id = $1 and action = 'farbaek.trial_extended'", [org])).toHaveLength(1);
  });

  it("caps admins at two weeks and every trial at 44 days in all", async () => {
    await expect(extend(ADMIN, 15)).rejects.toThrow(/TRIAL_CAP/);
    await expect(extend(CEO, 30)).rejects.toThrow(/TRIAL_LIMIT/);
    await extend(CEO, 23);
    expect(await trialDays()).toBeCloseTo(44, 3);
    await expect(extend(ADMIN, 1)).rejects.toThrow(/TRIAL_LIMIT/);
    await expect(q("select public.app_staff_extend_trial($1, $2, $3, 3, $4, null, null)", [CEO, sessions[CEO], crypto.randomUUID(), REASON])).rejects.toThrow(/NO_TRIAL/);
    await expect(as(db, "authenticated", USERS.alice, () => db.query("select public.app_staff_extend_trial($1, $2, $3, 3, $4, null, null)", [CEO, sessions[CEO], org, REASON]))).rejects.toThrow(/permission denied/);
  });
});

describe("the owner's numbers", () => {
  it("count sign-ups, workspaces and trials, with 14 days of history and no revenue", async () => {
    const m = (await q<{ m: Record<string, Record<string, unknown> | unknown[]> }>("select public.app_office_metrics(now()) as m"))[0]!.m;
    expect(m.signups).toMatchObject({ total: 6, last7: 6, last30: 6 });
    expect((m.signups as { byDay: number[] }).byDay).toHaveLength(14);
    expect((m.signups as { byDay: number[] }).byDay.at(-1)).toBe(6);
    expect(m.workspaces).toMatchObject({ total: 1, new7: 1, suspended: 0 });
    expect(m.trials).toMatchObject({ started30: 1, active: 1, ended: 0, extended: 1, paid: 0 });
    expect(m.aiUnitsByDay).toHaveLength(14);
    expect(m.activation).toEqual({ cohort: 0, activated: 0 });
    expect(JSON.stringify(m)).not.toMatch(/email|revenue|mrr/i);
    await expect(as(db, "authenticated", USERS.alice, () => db.query("select public.app_office_metrics(now())"))).rejects.toThrow(/permission denied/);
  });
});

describe("quick search", () => {
  type Found = { workspaces: { id: string; name: string }[]; people: { email: string; orgId: string | null }[]; sites: unknown[] };
  const search = async (text: string) => (await q<{ r: Found }>("select public.app_office_search($1) as r", [text]))[0]!.r;

  it("finds workspaces by name or id prefix and people by email, with their workspace", async () => {
    expect((await search("alice st")).workspaces.map((w) => w.name)).toEqual(["Alice Studio"]);
    expect((await search(org.slice(0, 8))).workspaces).toHaveLength(1);
    expect((await search("ALICE@")).people).toEqual([expect.objectContaining({ email: "alice@example.test", orgId: org })]);
    expect((await search("bob@")).people).toEqual([expect.objectContaining({ orgId: null })]);
  });

  it("treats wildcards as text and ignores one-letter queries", async () => {
    expect(await search("%%")).toEqual({ workspaces: [], people: [], sites: [] });
    expect(await search("_")).toEqual({ workspaces: [], people: [], sites: [] });
    expect((await search("a_")).workspaces).toEqual([]);
    await expect(as(db, "authenticated", USERS.alice, () => db.query("select public.app_office_search('alice')"))).rejects.toThrow(/permission denied/);
  });
});
