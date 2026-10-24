/**
 * Migration v36 (ADR 0063): trial reminders are claimed once, recorded with
 * what happened, retried at most three times when they fail, and only for
 * workspaces still on a trial. People choose which emails they get.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let alice: string;
let bob: string;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const asUser = async <T = Record<string, unknown>>(uid: string, sql: string, params: unknown[] = []) => as(db, "authenticated", uid, async () => (await db.query<T>(sql, params)).rows);
const claim = (org: string, kind: string) => q<{ c: boolean }>("select public.app_claim_trial_reminder($1, $2) as c", [org, kind]).then((r) => r[0]!.c);
const finish = (org: string, kind: string, status: string, recipients = 1, detail: string | null = null) =>
  q<{ f: boolean }>("select public.app_finish_trial_reminder($1, $2, $3, $4, $5) as f", [org, kind, status, recipients, detail]).then((r) => r[0]!.f);
const row = (org: string, kind: string) =>
  q<{ status: string; attempts: number; recipients: number; detail: string | null }>("select status, attempts, recipients, detail from public.trial_reminders where org_id = $1 and kind = $2", [org, kind]).then((r) => r[0]);
const candidates = (now = "now()") =>
  q<{ org_id: string; org_name: string; recorded: string[]; owners: string[] }>(`select org_id, org_name, recorded, owners from public.app_trial_reminder_candidates(${now})`);

beforeAll(async () => {
  db = await createTestDb();
  alice = await createOrg(db, USERS.alice, "Alice Studio");
  bob = await createOrg(db, USERS.bob, "Bob Labs");
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("claiming and recording a reminder", () => {
  it("claims once, then records what the mail server said", async () => {
    expect(await claim(alice, "day_7")).toBe(true);
    expect(await claim(alice, "day_7")).toBe(false);
    expect(await finish(alice, "day_7", "accepted", 1)).toBe(true);
    expect(await row(alice, "day_7")).toEqual({ status: "accepted", attempts: 1, recipients: 1, detail: null });
    // Only a claimed one can be finished, and only once.
    expect(await finish(alice, "day_7", "failed")).toBe(false);
    expect(await claim(alice, "day_7")).toBe(false);
  });

  it("retries a failed one, three tries in all", async () => {
    expect(await claim(alice, "day_12")).toBe(true);
    await finish(alice, "day_12", "failed", 0, "The mail server refused it: 451");
    expect(await claim(alice, "day_12")).toBe(true);
    await finish(alice, "day_12", "failed", 0, "451 again");
    expect(await claim(alice, "day_12")).toBe(true);
    await finish(alice, "day_12", "failed", 0, "451 a third time");
    expect(await claim(alice, "day_12")).toBe(false);
    expect(await row(alice, "day_12")).toMatchObject({ status: "failed", attempts: 3, detail: "451 a third time" });
  });

  it("skips one that won't be sent, unless it's already recorded", async () => {
    expect(await q("select public.app_skip_trial_reminder($1, 'day_13', 'superseded') as s", [bob])).toEqual([{ s: true }]);
    expect(await q("select public.app_skip_trial_reminder($1, 'day_7', 'too_late') as s", [alice])).toEqual([{ s: false }]);
    expect(await row(bob, "day_13")).toEqual({ status: "skipped", attempts: 0, recipients: 0, detail: "superseded" });
    await expect(q("select public.app_skip_trial_reminder($1, 'expiry', 'because')", [bob])).rejects.toThrow(/INVALID_REASON/);
    await expect(q("select public.app_finish_trial_reminder($1, 'day_13', 'delivered', 1, null)", [bob])).rejects.toThrow(/INVALID_STATUS/);
    await expect(claim(bob, "day_99")).rejects.toThrow();
  });
});

describe("who gets reminders", () => {
  it("lists workspaces on a trial with their owners and what's recorded; a retryable failure doesn't count", async () => {
    const list = await candidates();
    const a = list.find((c) => c.org_id === alice)!;
    expect(a.org_name).toBe("Alice Studio");
    expect(a.owners).toEqual([USERS.alice]);
    // day_12 failed three times, so it counts as recorded; a fresh failure wouldn't.
    expect(a.recorded).toEqual(["day_12", "day_7"]);
    await claim(bob, "expiry");
    await finish(bob, "expiry", "failed", 0, "451");
    expect((await candidates()).find((c) => c.org_id === bob)!.recorded).toEqual(["day_13"]);
  });

  it("leaves out workspaces no longer on a trial, suspended ones, and trials that ended over three days ago", async () => {
    await q("update public.billing_accounts set state = 'free' where org_id = $1", [bob]);
    expect((await candidates()).map((c) => c.org_id)).not.toContain(bob);
    await q("update public.billing_accounts set state = 'trialing' where org_id = $1", [bob]);
    await q("update public.organizations set suspended_at = now() where id = $1", [bob]);
    expect((await candidates()).map((c) => c.org_id)).not.toContain(bob);
    await q("update public.organizations set suspended_at = null where id = $1", [bob]);
    expect((await candidates("now() + interval '16 days'")).map((c) => c.org_id)).toContain(alice);
    expect((await candidates("now() + interval '18 days'")).map((c) => c.org_id)).not.toContain(alice);
  });
});

describe("email preferences", () => {
  it("are saved by the server and read only by their owner", async () => {
    await q("select public.app_set_email_preferences($1, false, true)", [USERS.alice]);
    expect(await asUser(USERS.alice, "select work_updates, trial_reminders from public.email_preferences")).toEqual([{ work_updates: false, trial_reminders: true }]);
    expect(await asUser(USERS.bob, "select * from public.email_preferences")).toEqual([]);
    await q("select public.app_set_email_preferences($1, true, false)", [USERS.alice]);
    expect(await q("select work_updates, trial_reminders from public.email_preferences where user_id = $1", [USERS.alice])).toEqual([{ work_updates: true, trial_reminders: false }]);
  });
});

describe("from the browser", () => {
  it("members read their workspace's reminders, and nobody can write them or call the functions", async () => {
    expect((await asUser(USERS.alice, "select kind from public.trial_reminders order by kind")).map((r) => r.kind)).toEqual(["day_12", "day_7"]);
    expect(await asUser(USERS.bob, "select kind from public.trial_reminders where org_id = $1", [alice])).toEqual([]);
    await expect(asUser(USERS.alice, "insert into public.trial_reminders (org_id, kind, status) values ($1, 'expiry', 'accepted')", [alice])).rejects.toThrow(/permission denied/);
    await expect(asUser(USERS.alice, "insert into public.email_preferences (user_id) values ($1)", [USERS.alice])).rejects.toThrow(/permission denied/);
    for (const call of [
      ["select public.app_claim_trial_reminder($1, 'expiry')", [alice]],
      ["select public.app_set_email_preferences($1, false, false)", [USERS.alice]],
      ["select * from public.app_trial_reminder_candidates()", []],
    ] as const) {
      await expect(asUser(USERS.alice, call[0], [...call[1]])).rejects.toThrow(/permission denied/);
    }
  });
});
