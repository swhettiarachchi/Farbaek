/**
 * Migration v71 (ADR 0112): plans bought through Apple. Apple is a second
 * provider for the same apply function as Dodo, keyed by the original
 * transaction id; each App Store Server Notification is recorded once; and
 * only the server can reach any of it. Subscriptions here are mock data.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const su = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const UUID = "9b9f6f8e-3b7e-4c47-9a36-0d1c2f3e4a5b";

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Mock Apple Studio");
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("plans bought through Apple", () => {
  it("applies an Apple subscription through the same function as Dodo's", async () => {
    const r = await q<{ r: string }>(
      "select public.app_billing_apply_subscription($1, 'apple', 'test', '2000000999000001', null, 'active', 'starter', '2026-11-28T12:00:00Z', null, false, '2026-10-29T12:00:00Z', '2026-10-29T12:00:00Z', 'apple.transaction') as r",
      [org],
    );
    expect(r[0]!.r).toBe("applied");
    expect(
      (await su<{ provider: string; state: string; paid_plan_id: string; provider_subscription_id: string }>("select provider, state::text, paid_plan_id, provider_subscription_id from public.billing_accounts where org_id = $1", [org]))[0],
    ).toEqual({ provider: "apple", state: "active", paid_plan_id: "starter", provider_subscription_id: "2000000999000001" });
  });

  it("still refuses providers it doesn't know", async () => {
    await expect(
      q("select public.app_billing_apply_subscription($1, 'stripe', 'test', 'sub_x', null, 'active', 'starter', now(), null, false, now(), now(), 'x')", [org]),
    ).rejects.toThrow(/billing_accounts_provider_check/);
  });

  it("records each notification once, and lets an unfinished one be tried again", async () => {
    const record = () => q<{ r: string }>("select public.app_apple_record_notification($1, 'SUBSCRIBED', 'INITIAL_BUY', 'Sandbox', '2000000999000001') as r", [UUID]).then((r) => r[0]!.r);
    expect(await record()).toBe("new");
    expect(await record()).toBe("retry");
    await q("select public.app_apple_finish_notification($1, 'failed', 'Database unavailable', $2)", [UUID, org]);
    expect(await record()).toBe("retry");
    await q("select public.app_apple_finish_notification($1, 'processed', null, $2)", [UUID, org]);
    expect(await record()).toBe("done");
    expect((await su<{ org_id: string; status: string }>("select org_id, status from public.apple_notifications where notification_uuid = $1", [UUID]))[0]).toEqual({ org_id: org, status: "processed" });
    await expect(q("select public.app_apple_record_notification($1, 'bad type', null, 'Sandbox', null)", [crypto.randomUUID()])).rejects.toThrow(/type_check/);
    await expect(q("select public.app_apple_finish_notification($1, 'done', null, null)", [UUID])).rejects.toThrow(/INVALID_STATUS/);
  });

  it("keeps notifications and their functions to the server", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      await expect(as(db, role, USERS.alice, () => db.query("select * from public.apple_notifications"))).rejects.toThrow(/permission denied/);
      await expect(as(db, role, USERS.alice, () => db.query("select public.app_apple_record_notification($1, 'TEST', null, 'Sandbox', null)", [crypto.randomUUID()]))).rejects.toThrow(/permission denied/);
      await expect(as(db, role, USERS.alice, () => db.query("select public.app_apple_finish_notification($1, 'processed', null, null)", [UUID]))).rejects.toThrow(/permission denied/);
    }
    await expect(q("insert into public.apple_notifications (notification_uuid, type, environment) values ($1, 'TEST', 'Sandbox')", [crypto.randomUUID()])).rejects.toThrow(/permission denied/);
  });
});
