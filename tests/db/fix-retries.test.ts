import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

/**
 * Migration v63 (ADR 0101): a fix for a task whose checks failed, and the
 * free retry when the fix's own checks fail too. The link is for
 * contributors, one open fix at a time; the refund gives back whole settled
 * entries within the 31-day cap, re-credits the grants they drew from, runs
 * once, and never for a fix that passed. Ledger rows here are mock data.
 */

let db: PGlite;
let org: string;
let project: string;

const su = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);

const task = async (title: string, state: string) =>
  (await su<{ id: string }>("insert into public.tasks (org_id, project_id, title, created_by) values ($1, $2, $3, $4) returning id", [org, project, title, USERS.alice]).then(async (r) => {
    await su("update public.tasks set state = $2 where id = $1", [r[0]!.id, state]);
    return r;
  }))[0]!.id;
const link = (fix: string, source: string, actor: string = USERS.alice) => q("select public.app_link_fix_task($1, $2, $3, $4)", [org, actor, fix, source]);
const refund = (fix: string, cap: number) => q<{ units: string }>("select public.app_refund_fix_task($1, $2) as units", [fix, cap]).then((r) => Number(r[0]!.units));
let grant: string;
let n = 0;
const settled = async (taskId: string, credits: number, ago = "1 hour") => {
  n += 1;
  await su(
    `insert into public.ai_credit_ledger (org_id, actor_id, idempotency_key, operation, task_id, credits, status, settled_at, grants)
     values ($1, $2, $3, 'agent_step', $4, $5::integer, 'settled', now() - $6::interval, jsonb_build_array(jsonb_build_object('grant', $7::text, 'units', $8::bigint)))`,
    [org, USERS.alice, `mock-${n}`, taskId, credits, ago, grant, credits],
  );
  await su("update public.usage_grants set used = used + $2 where id = $1", [grant, credits]);
};
const grantUsed = async () => Number((await su<{ used: string }>("select used from public.usage_grants where id = $1", [grant]))[0]!.used);
const audits = async (action: string) => Number((await su<{ n: number }>("select count(*)::int as n from public.audit_events where org_id = $1 and action = $2", [org, action]))[0]!.n);

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Mock Fix Studio");
  await su("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'viewer')", [org, USERS.bob]);
  project = (await su<{ id: string }>("insert into public.projects (org_id, name, created_by) values ($1, 'Mock site', $2) returning id", [org, USERS.alice]))[0]!.id;
  grant = (await su<{ id: string }>("insert into public.usage_grants (org_id, kind, units, starts_at, expires_at, source_key) values ($1, 'plan', 100000, now() - interval '1 day', now() + interval '30 days', 'plan:mock') returning id", [org]))[0]!.id;
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("who can reach it", () => {
  it("keeps browsers out", async () => {
    const source = await task("Browser source", "FAILED");
    const fix = await task("Browser fix", "RECEIVED");
    await expect(as(db, "authenticated", USERS.alice, () => db.query("select public.app_link_fix_task($1, $2, $3, $4)", [org, USERS.alice, fix, source]))).rejects.toThrow(/permission denied/);
    await expect(as(db, "authenticated", USERS.alice, () => db.query("select public.app_refund_fix_task($1, 1000)", [fix]))).rejects.toThrow(/permission denied/);
    await expect(as(db, "authenticated", USERS.alice, () => db.query("update public.tasks set fix_of_task_id = $2 where id = $1", [fix, source]))).rejects.toThrow(/permission denied/);
  });
});

describe("linking a fix", () => {
  it("needs a contributor, a task whose checks failed, a fresh task, and one open fix at a time", async () => {
    const source = await task("Add the contact form", "FAILED");
    const fix = await task("Fix: Add the contact form", "CONTRACT_DRAFTED");
    await expect(link(fix, source, USERS.bob)).rejects.toThrow(/FORBIDDEN/);
    const verified = await task("Verified one", "VERIFIED");
    await expect(link(fix, verified)).rejects.toThrow(/INVALID_TRANSITION/);
    const busy = await task("Already running", "EXECUTING");
    await expect(link(busy, source)).rejects.toThrow(/INVALID_REQUEST/);

    await link(fix, source);
    expect((await su<{ fix_of_task_id: string }>("select fix_of_task_id from public.tasks where id = $1", [fix]))[0]!.fix_of_task_id).toBe(source);
    expect(await audits("task.fix_started")).toBe(1);
    const second = await task("Fix again", "RECEIVED");
    await expect(link(second, source)).rejects.toThrow(/FIX_OPEN/);
    await expect(link(fix, source)).rejects.toThrow(/INVALID_REQUEST/);
    // Once the first fix has ended, another can start.
    await su("update public.tasks set state = 'FAILED' where id = $1", [fix]);
    await link(second, source);
  });
});

describe("the free retry", () => {
  it("gives back a failed fix's settled usage within the cap, re-credits the grant, and runs once", async () => {
    const source = await task("Make the header sticky", "FAILED");
    const fix = await task("Fix: Make the header sticky", "RECEIVED");
    await link(fix, source);
    await settled(fix, 300);
    await settled(fix, 300);
    await settled(fix, 600);
    await su("update public.tasks set state = 'FAILED' where id = $1", [fix]);
    const before = await grantUsed();

    // Whole entries only: 300 + 300 fit in 1,000; the 600 would pass it.
    expect(await refund(fix, 1000)).toBe(600);
    expect(await grantUsed()).toBe(before - 600);
    const rows = await su<{ status: string; refund_reason: string | null }>("select status, refund_reason from public.ai_credit_ledger where task_id = $1 order by credits, settled_at", [fix]);
    expect(rows.map((r) => r.status)).toEqual(["refunded", "refunded", "settled"]);
    expect(await audits("usage.free_retry")).toBe(1);
    // Once only.
    expect(await refund(fix, 100000)).toBe(0);
    expect(await audits("usage.free_retry")).toBe(1);
  });

  it("counts the last 31 days of free retries against the cap", async () => {
    const source = await task("Fix the footer", "FAILED");
    const fix = await task("Fix: Fix the footer", "RECEIVED");
    await link(fix, source);
    await settled(fix, 500);
    await su("update public.tasks set state = 'PARTIALLY_VERIFIED' where id = $1", [fix]);
    // 600 already given back this month, so 500 more passes a cap of 1,000.
    expect(await refund(fix, 1000)).toBe(0);
    expect(await refund(fix, 1100)).toBe(0); // already settled once, even with nothing given
  });

  it("gives nothing for a fix that passed, a task that isn't a fix, or a cap of 0", async () => {
    const source = await task("Add a blog", "FAILED");
    const fix = await task("Fix: Add a blog", "RECEIVED");
    await link(fix, source);
    await settled(fix, 100);
    await su("update public.tasks set state = 'VERIFIED' where id = $1", [fix]);
    expect(await refund(fix, 100000)).toBe(0);
    const plain = await task("Plain task", "FAILED");
    await settled(plain, 100);
    expect(await refund(plain, 100000)).toBe(0);
    await su("update public.tasks set state = 'FAILED' where id = $1", [fix]);
    expect(await refund(fix, 0)).toBe(0);
    expect((await su<{ fix_refunded_at: string | null }>("select fix_refunded_at from public.tasks where id = $1", [fix]))[0]!.fix_refunded_at).toBeNull();
  });
});
