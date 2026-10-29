/**
 * Migration v72 (ADR 0113): Apple's refresh token for each person who signs
 * in with Apple, kept so deleting the account can revoke it. Only the
 * server reaches it, and it goes with the account. Tokens here are mock data.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createTestDb } from "./harness";

let db: PGlite;
const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const su = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

beforeAll(async () => {
  db = await createTestDb();
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("Apple sign-in tokens", () => {
  it("keeps the latest token per person, and forgets it", async () => {
    await q("select public.app_apple_sign_in_keep($1, 'r.0.first-token')", [USERS.alice]);
    await q("select public.app_apple_sign_in_keep($1, 'r.0.second-token')", [USERS.alice]);
    expect(await q("select refresh_token from public.apple_sign_in_tokens where user_id = $1", [USERS.alice])).toEqual([{ refresh_token: "r.0.second-token" }]);
    await q("select public.app_apple_sign_in_forget($1)", [USERS.alice]);
    expect(await q("select refresh_token from public.apple_sign_in_tokens where user_id = $1", [USERS.alice])).toEqual([]);
    await expect(q("select public.app_apple_sign_in_keep($1, 'has spaces')", [USERS.alice])).rejects.toThrow(/refresh_token_check/);
  });

  it("goes with the account", async () => {
    const user = crypto.randomUUID();
    await su("insert into auth.users (id, email, email_confirmed_at) values ($1, 'apple@privaterelay.example.test', now())", [user]);
    await q("select public.app_apple_sign_in_keep($1, 'r.0.gone-token')", [user]);
    await su("delete from auth.users where id = $1", [user]);
    expect(await su("select * from public.apple_sign_in_tokens where user_id = $1", [user])).toEqual([]);
  });

  it("keeps tokens and their functions to the server", async () => {
    await q("select public.app_apple_sign_in_keep($1, 'r.0.bob-token')", [USERS.bob]);
    for (const role of ["anon", "authenticated"] as const) {
      await expect(as(db, role, USERS.bob, () => db.query("select * from public.apple_sign_in_tokens"))).rejects.toThrow(/permission denied/);
      await expect(as(db, role, USERS.bob, () => db.query("select public.app_apple_sign_in_keep($1, 'r.0.stolen-token')", [USERS.bob]))).rejects.toThrow(/permission denied/);
      await expect(as(db, role, USERS.bob, () => db.query("select public.app_apple_sign_in_forget($1)", [USERS.bob]))).rejects.toThrow(/permission denied/);
    }
    await expect(q("insert into public.apple_sign_in_tokens (user_id, refresh_token) values ($1, 'r.0.direct-token')", [USERS.alice])).rejects.toThrow(/permission denied/);
  });
});
