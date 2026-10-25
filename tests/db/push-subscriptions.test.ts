/**
 * Migration v49: push subscriptions (ADR 0079). Only the browsers' push
 * services, one person each, at most ten a person, read only by their
 * owner, and dropped when gone or after twenty failures in a row.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
const asService = <T>(fn: () => Promise<T>) => as(db, "service_role", null, fn);
const admin = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => asService(async () => (await db.query<T>(sql, params)).rows);

const P256DH = "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
const AUTH = "BTBZMqHH6r4Tts7J_aSIgg";
const endpoint = (n: number | string) => `https://fcm.googleapis.com/fcm/send/device-${n}`;
const save = (user: string, ep: string, label = "Chrome on Android") => q("select public.app_save_push_subscription($1, $2, $3, $4, $5)", [user, ep, P256DH, AUTH, label]);
const count = async (user: string) => (await admin<{ n: number }>("select count(*)::int as n from public.push_subscriptions where user_id = $1", [user]))[0]!.n;

beforeAll(async () => {
  db = await createTestDb();
  await createOrg(db, USERS.alice, "Alice Studio");
  await createOrg(db, USERS.bob, "Bob Labs");
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("push subscriptions", () => {
  it("keeps a device for a person, from the browsers' push services only", async () => {
    await save(USERS.alice, endpoint(1));
    expect(await count(USERS.alice)).toBe(1);
    await expect(save(USERS.alice, "https://evil.example/push/1")).rejects.toThrow(/push_subscriptions_endpoint_check/);
    await expect(q("select public.app_save_push_subscription($1, $2, 'BAD', $3, 'x')", [USERS.alice, endpoint(2), AUTH])).rejects.toThrow(/p256dh/);
  });

  it("moves a device to whoever signs in on it, and keeps at most ten a person", async () => {
    await save(USERS.bob, endpoint(1), "Safari on iPhone");
    expect(await count(USERS.alice)).toBe(0);
    expect(await count(USERS.bob)).toBe(1);
    for (let i = 10; i < 22; i++) await save(USERS.alice, endpoint(i));
    expect(await count(USERS.alice)).toBe(10);
    // The oldest went first.
    expect((await admin("select 1 from public.push_subscriptions where endpoint = $1", [endpoint(10)])).length).toBe(0);
    expect((await admin("select 1 from public.push_subscriptions where endpoint = $1", [endpoint(21)])).length).toBe(1);
  });

  it("drops a gone device, and one that keeps failing", async () => {
    await q("select public.app_note_push_result($1, 'sent')", [endpoint(21)]);
    await q("select public.app_note_push_result($1, 'gone')", [endpoint(21)]);
    expect((await admin("select 1 from public.push_subscriptions where endpoint = $1", [endpoint(21)])).length).toBe(0);
    for (let i = 0; i < 19; i++) await q("select public.app_note_push_result($1, 'failed')", [endpoint(20)]);
    expect((await admin<{ failures: number }>("select failures from public.push_subscriptions where endpoint = $1", [endpoint(20)]))[0]!.failures).toBe(19);
    await q("select public.app_note_push_result($1, 'failed')", [endpoint(20)]);
    expect((await admin("select 1 from public.push_subscriptions where endpoint = $1", [endpoint(20)])).length).toBe(0);
  });

  it("lets a person read only their own devices, never the keys, and write nothing directly", async () => {
    const mine = (await as(db, "authenticated", USERS.bob, () => db.query<{ label: string }>("select label from public.push_subscriptions"))).rows;
    expect(mine).toEqual([{ label: "Safari on iPhone" }]);
    await expect(as(db, "authenticated", USERS.bob, () => db.query("select p256dh from public.push_subscriptions"))).rejects.toThrow(/permission denied/);
    await expect(as(db, "authenticated", USERS.bob, () => db.query("delete from public.push_subscriptions"))).rejects.toThrow(/permission denied/);
    await expect(as(db, "authenticated", USERS.bob, () => db.query("select public.app_save_push_subscription($1, $2, $3, $4, 'x')", [USERS.bob, endpoint(99), P256DH, AUTH]))).rejects.toThrow(/permission denied/);
    await q("select public.app_delete_push_subscription($1, $2)", [USERS.bob, endpoint(1)]);
    expect(await count(USERS.bob)).toBe(0);
  });
});
