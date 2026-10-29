/**
 * Migration v73 (ADR 0114): when Apple says a person stopped using Sign in
 * with Apple with Farbaek, they're signed out everywhere, their phones are
 * disconnected and Apple's token is forgotten. Their account stays. Mock
 * data; auth.identities is a stand-in with the columns the function reads.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createTestDb } from "./harness";

let db: PGlite;
const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const su = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const SUB = "001234.abcdef0123456789.1200";

beforeAll(async () => {
  db = await createTestDb();
  await su("create table if not exists auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid not null, provider text not null, provider_id text not null)");
  await su("insert into auth.identities (user_id, provider, provider_id) values ($1, 'apple', $2), ($3, 'email', $4)", [USERS.alice, SUB, USERS.bob, String(USERS.bob)]);
  await su("insert into auth.sessions (id, user_id) values (gen_random_uuid(), $1), (gen_random_uuid(), $1), (gen_random_uuid(), $2)", [USERS.alice, USERS.bob]);
  await su("insert into public.phone_devices (user_id, session_id, platform, name, push_token, push_environment) values ($1, gen_random_uuid(), 'ios', 'iPhone', $2, 'production')", [USERS.alice, "a".repeat(64)]);
  await q("select public.app_apple_sign_in_keep($1, 'r.0.alice-token')", [USERS.alice]);
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("Apple says the person stopped using Sign in with Apple", () => {
  it("signs them out everywhere, disconnects their phones and forgets Apple's token, and nobody else's", async () => {
    expect(await q<{ r: string }>("select public.app_apple_sign_in_ended($1) as r", [SUB])).toEqual([{ r: USERS.alice }]);
    expect(await su("select id from auth.sessions where user_id = $1", [USERS.alice])).toEqual([]);
    expect(await su("select count(*)::int as n from auth.sessions where user_id = $1", [USERS.bob])).toEqual([{ n: 1 }]);
    const phone = (await su<{ revoked: boolean; push_token: string | null }>("select revoked_at is not null as revoked, push_token from public.phone_devices where user_id = $1", [USERS.alice]))[0];
    expect(phone).toEqual({ revoked: true, push_token: null });
    expect(await su("select * from public.apple_sign_in_tokens where user_id = $1", [USERS.alice])).toEqual([]);
    // The account stays.
    expect(await su("select count(*)::int as n from auth.users where id = $1", [USERS.alice])).toEqual([{ n: 1 }]);
  });

  it("does nothing for an Apple id no account has, and refuses one that isn't an id", async () => {
    expect(await q<{ r: string | null }>("select public.app_apple_sign_in_ended('001234.nobody.1') as r")).toEqual([{ r: null }]);
    await expect(q("select public.app_apple_sign_in_ended('has spaces')")).rejects.toThrow(/INVALID_SUB/);
  });

  it("is the server's alone", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      await expect(as(db, role, USERS.alice, () => db.query("select public.app_apple_sign_in_ended($1)", [SUB]))).rejects.toThrow(/permission denied/);
    }
  });
});
