/**
 * Migration v39 (ADR 0067): rate limit windows are deleted within a day of
 * starting, whichever key they belong to, and a window can't be longer than
 * a day.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createTestDb } from "./harness";

let db: PGlite;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const limit = async (key: string, seconds: number, max: number) => (await q<{ ok: boolean }>("select public.app_rate_limit($1, $2, $3) as ok", [key, seconds, max]))[0]!.ok;
const keys = async () => (await db.query<{ key: string }>("select key from private.rate_limit_windows order by key")).rows.map((r) => r.key);

beforeAll(async () => {
  db = await createTestDb();
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("rate limit windows", () => {
  it("still counts requests per key per window", async () => {
    const results: boolean[] = [];
    for (let i = 0; i < 4; i++) results.push(await limit("sign-in-email:a", 900, 3));
    expect(results).toEqual([true, true, true, false]);
    expect(await limit("sign-in-email:b", 900, 3)).toBe(true);
  });

  it("deletes other keys' windows once they started more than a day ago", async () => {
    await db.exec(`
      insert into private.rate_limit_windows (key, window_start, hits) values
        ('sign-in-ip:old', now() - interval '25 hours', 4),
        ('sign-in-ip:recent', now() - interval '2 hours', 2);
    `);
    await limit("sign-in-ip:new", 3600, 20);
    const left = await keys();
    expect(left).not.toContain("sign-in-ip:old");
    expect(left).toContain("sign-in-ip:recent");
    expect(left).toContain("sign-in-ip:new");
  });

  it("refuses windows longer than a day, or empty ones", async () => {
    await expect(limit("x", 86_401, 1)).rejects.toThrow(/INVALID_WINDOW/);
    await expect(limit("x", 0, 1)).rejects.toThrow(/INVALID_WINDOW/);
    expect(await limit("x", 86_400, 1)).toBe(true);
  });

  it("stays out of reach of browsers", async () => {
    await expect(as(db, "authenticated", USERS.alice, () => db.query("select public.app_rate_limit('x', 60, 10)"))).rejects.toThrow(/permission denied/);
    await expect(as(db, "anon", null, () => db.query("select public.app_rate_limit('x', 60, 10)"))).rejects.toThrow(/permission denied/);
  });
});
