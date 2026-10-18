/**
 * Core schema (migration 1, with later migrations applied): tenant
 * isolation, trial rules and least-privilege grants under the
 * `authenticated` role. See tests/db/harness.ts for what this covers.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PLAN_CATALOG_VERSION, TRIAL } from "@/core/billing/catalog";
import { USERS, as as runAs, createOrg as createOrgIn, createTestDb, readMigration } from "./harness";

const MIGRATION = readMigration("20261013120000_core_schema.sql");
// Migration 15 moved workspaces onto the current catalog.
const PLANS_MIGRATION = readMigration("20261018180000_plans_and_wallet.sql");
const { alice: ALICE, bob: BOB, unverified: UNVERIFIED } = USERS;

let db: PGlite;
const as = <T>(role: "authenticated" | "anon", uid: string | null, fn: () => Promise<T>) => runAs(db, role, uid, fn);
const asUser = <T>(uid: string, fn: () => Promise<T>) => as("authenticated", uid, fn);
const createOrg = (uid: string, name: string) => createOrgIn(db, uid, name);

let aliceOrg: string;

beforeAll(async () => {
  db = await createTestDb();
  aliceOrg = await createOrg(ALICE, "Alice Studio");
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("migration", () => {
  it("enables row level security on every public table", async () => {
    const r = await db.query<{ relname: string; relrowsecurity: boolean }>(
      "select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by 1",
    );
    expect(r.rows.length).toBeGreaterThanOrEqual(9);
    expect(r.rows.filter((t) => !t.relrowsecurity)).toEqual([]);
  });

  it("matches the TypeScript catalog: trial length and catalog version", () => {
    expect(MIGRATION).toContain(`interval '${TRIAL.lengthDays} days'`);
    expect(PLANS_MIGRATION).toContain(`'${PLAN_CATALOG_VERSION}'`);
  });
});

describe("create_organization", () => {
  it("makes the caller owner and starts exactly one 14-day Pro trial", async () => {
    const rows = await asUser(ALICE, async () => ({
      members: (await db.query("select user_id, role from public.organization_members where org_id = $1", [aliceOrg])).rows,
      trial: (await db.query<{ plan_id: string; length: string }>(
        "select plan_id, (ends_at - started_at)::text as length from public.trials where org_id = $1",
        [aliceOrg],
      )).rows,
      billing: (await db.query("select state, plan_catalog_version from public.billing_accounts where org_id = $1", [aliceOrg])).rows,
      audit: (await db.query("select action from public.audit_events where org_id = $1", [aliceOrg])).rows,
    }));
    expect(rows.members).toEqual([{ user_id: ALICE, role: "owner" }]);
    expect(rows.trial).toEqual([{ plan_id: "pro", length: "14 days" }]);
    expect(rows.billing).toEqual([{ state: "trialing", plan_catalog_version: PLAN_CATALOG_VERSION }]);
    expect(rows.audit).toEqual([{ action: "organization.created" }]);
  });

  it("starts later organizations on Free: one trial per user", async () => {
    const second = await createOrg(ALICE, "Alice Side Project");
    const r = await asUser(ALICE, () =>
      db.query("select o.name, b.state, (t.org_id is not null) as has_trial from public.organizations o join public.billing_accounts b on b.org_id = o.id left join public.trials t on t.org_id = o.id where o.id = $1", [second]),
    );
    expect(r.rows).toEqual([{ name: "Alice Side Project", state: "free", has_trial: false }]);
  });

  it("refuses unverified users", async () => {
    await expect(createOrg(UNVERIFIED, "Nope")).rejects.toThrow(/EMAIL_NOT_VERIFIED/);
  });

  it("refuses blank or overlong names", async () => {
    await expect(createOrg(BOB, "   ")).rejects.toThrow(/INVALID_NAME/);
    await expect(createOrg(BOB, "x".repeat(81))).rejects.toThrow(/INVALID_NAME/);
  });

  it("can't be called anonymously", async () => {
    await expect(as("anon", null, () => db.query("select public.create_organization('Anon')"))).rejects.toThrow(/permission denied/);
  });
});

describe("tenant isolation", () => {
  it("hides one organization's data from another user", async () => {
    await createOrg(BOB, "Bob Labs");
    const seen = await asUser(BOB, async () => ({
      orgs: (await db.query<{ name: string }>("select name from public.organizations order by name")).rows.map((r) => r.name),
      aliceTrial: (await db.query("select * from public.trials where org_id = $1", [aliceOrg])).rows,
      aliceBilling: (await db.query("select * from public.billing_accounts where org_id = $1", [aliceOrg])).rows,
      aliceMembers: (await db.query("select * from public.organization_members where org_id = $1", [aliceOrg])).rows,
      aliceAudit: (await db.query("select * from public.audit_events where org_id = $1", [aliceOrg])).rows,
    }));
    expect(seen.orgs).toEqual(["Bob Labs"]);
    expect(seen.aliceTrial).toEqual([]);
    expect(seen.aliceBilling).toEqual([]);
    expect(seen.aliceMembers).toEqual([]);
    expect(seen.aliceAudit).toEqual([]);
  });

  it("stops a user creating tasks in someone else's organization", async () => {
    await expect(
      asUser(BOB, () => db.query("insert into public.tasks (org_id, title, created_by) values ($1, 'sneaky', $2)", [aliceOrg, BOB])),
    ).rejects.toThrow(/permission denied|row-level security/);
  });

  it("stops renaming someone else's organization", async () => {
    const r = await asUser(BOB, () => db.query("update public.organizations set name = 'taken' where id = $1", [aliceOrg]));
    expect(r.affectedRows).toBe(0);
    const name = await asUser(ALICE, () => db.query<{ name: string }>("select name from public.organizations where id = $1", [aliceOrg]));
    expect(name.rows[0]!.name).toBe("Alice Studio");
  });
});

describe("least privilege", () => {
  it("doesn't let the browser create tasks directly (the server does)", async () => {
    await expect(
      asUser(ALICE, () => db.query("insert into public.tasks (org_id, title, created_by) values ($1, 'x', $2)", [aliceOrg, ALICE])),
    ).rejects.toThrow(/permission denied/);
  });

  it("doesn't let the browser set task state or version", async () => {
    await expect(
      asUser(ALICE, () => db.query("insert into public.tasks (org_id, title, created_by, state) values ($1, 'x', $2, 'VERIFIED')", [aliceOrg, ALICE])),
    ).rejects.toThrow(/permission denied/);
    await expect(asUser(ALICE, () => db.query("update public.tasks set state = 'VERIFIED'"))).rejects.toThrow(/permission denied/);
  });

  it("doesn't let the browser write billing, trials, usage or audit", async () => {
    const attempts = [
      ["update public.billing_accounts set state = 'active', paid_plan_id = 'max_3x' where org_id = $1", [aliceOrg]],
      ["update public.trials set ends_at = ends_at + interval '30 days' where org_id = $1", [aliceOrg]],
      ["insert into public.evaluation_events (org_id, idempotency_key, outcome) values ($1, 'k', 'ALLOW')", [aliceOrg]],
      ["insert into public.audit_events (org_id, action) values ($1, 'forged')", [aliceOrg]],
      ["delete from public.audit_events where org_id = $1", [aliceOrg]],
      ["truncate public.audit_events", []],
    ] as const;
    for (const [sql, params] of attempts) {
      await expect(asUser(ALICE, () => db.query(sql, [...params])), sql).rejects.toThrow(/permission denied/);
    }
  });

  it("lets owners rename their organization", async () => {
    const r = await asUser(ALICE, () => db.query("update public.organizations set name = 'Alice Studio Ltd' where id = $1", [aliceOrg]));
    expect(r.affectedRows).toBe(1);
  });
});

describe("constraints", () => {
  it("counts an evaluation idempotency key once per organization", async () => {
    await db.query("insert into public.evaluation_events (org_id, idempotency_key, outcome) values ($1, 'req-1', 'BLOCK')", [aliceOrg]);
    await expect(
      db.query("insert into public.evaluation_events (org_id, idempotency_key, outcome) values ($1, 'req-1', 'ALLOW')", [aliceOrg]),
    ).rejects.toThrow(/duplicate key/);
  });

  it("rejects a trial that isn't exactly 14 days", async () => {
    const org = (await db.query<{ id: string }>("insert into public.organizations (name) values ('Edge') returning id")).rows[0]!.id;
    await expect(
      db.query("insert into public.trials (org_id, started_at, ends_at) values ($1, now(), now() + interval '30 days')", [org]),
    ).rejects.toThrow(/trials_length_14_days/);
  });
});
