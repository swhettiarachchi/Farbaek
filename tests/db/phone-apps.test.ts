/**
 * Migration v70: phones signed in to Farbaek (ADR 0110). Codes work once,
 * only for the phone holding the PKCE verifier, and only for two minutes;
 * a phone's record is checked on every request, disconnecting ends its
 * Supabase session, and people read their own phones' names, never their
 * sessions or push tokens.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createTestDb } from "./harness";

let db: PGlite;
const asService = <T>(fn: () => Promise<T>) => as(db, "service_role", null, fn);
const admin = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => asService(async () => (await db.query<T>(sql, params)).rows);

const hash = (n: number) => n.toString(16).padStart(64, "0");
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const OTHER_CHALLENGE = "x".repeat(43);
const session = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const TOKEN = "a".repeat(64);

const createCode = (user: string, n: number, challenge = CHALLENGE) => q("select public.app_phone_code_create($1, $2, $3, 'ios', 'iPhone')", [user, hash(n), challenge]);
const redeem = (n: number, challenge = CHALLENGE) => q<{ user_id: string; platform: string; device_name: string }>("select * from public.app_phone_code_redeem($1, $2)", [hash(n), challenge]);
const register = async (user: string, s: string, name = "iPhone") => (await q<{ id: string }>("select public.app_phone_register($1, $2, 'ios', $3, '1.0') as id", [user, s, name]))[0]!.id;
const seen = (s: string) => q<{ device_id: string; user_id: string; push: boolean }>("select * from public.app_phone_seen($1)", [s]);

beforeAll(async () => {
  db = await createTestDb();
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("phone sign-in codes", () => {
  it("redeems a code once, for the matching challenge only", async () => {
    await createCode(USERS.alice, 1);
    expect(await redeem(1)).toEqual([{ user_id: USERS.alice, platform: "ios", device_name: "iPhone" }]);
    expect(await redeem(1)).toEqual([]);
  });

  it("uses up a code on a wrong answer, so it can't be tried again", async () => {
    await createCode(USERS.alice, 2);
    expect(await redeem(2, OTHER_CHALLENGE)).toEqual([]);
    expect(await redeem(2)).toEqual([]);
  });

  it("refuses an expired code", async () => {
    await createCode(USERS.alice, 3);
    await admin("update public.phone_connect_codes set expires_at = now() - interval '1 second' where code_hash = $1", [hash(3)]);
    expect(await redeem(3)).toEqual([]);
  });

  it("keeps at most five open codes a person", async () => {
    for (let n = 10; n < 15; n++) await createCode(USERS.bob, n);
    await expect(createCode(USERS.bob, 15)).rejects.toThrow(/TOO_MANY_CODES/);
  });

  it("checks its inputs", async () => {
    await expect(q("select public.app_phone_code_create($1, 'nothex', $2, 'ios', 'iPhone')", [USERS.alice, CHALLENGE])).rejects.toThrow(/code_hash/);
    await expect(q("select public.app_phone_code_create($1, $2, 'short', 'ios', 'iPhone')", [USERS.alice, hash(20)])).rejects.toThrow(/challenge/);
    await expect(q("select public.app_phone_code_create($1, $2, $3, 'blackberry', 'iPhone')", [USERS.alice, hash(21), CHALLENGE])).rejects.toThrow(/platform/);
  });
});

describe("connected phones", () => {
  it("knows a connected phone by its session, and refuses it once disconnected, ending its sign-in", async () => {
    await admin("insert into auth.sessions (id, user_id) values ($1, $2)", [session(1), USERS.alice]);
    const id = await register(USERS.alice, session(1));
    expect(await seen(session(1))).toEqual([{ device_id: id, user_id: USERS.alice, platform: "ios", push: false }]);
    expect(await seen(session(999))).toEqual([]);

    // Someone else can't disconnect it.
    expect((await q<{ r: boolean | null }>("select public.app_phone_revoke($1, $2) as r", [USERS.bob, id]))[0]!.r).toBeNull();
    expect(await seen(session(1))).toHaveLength(1);

    expect((await q<{ r: boolean | null }>("select public.app_phone_revoke($1, $2) as r", [USERS.alice, id]))[0]!.r).toBe(true);
    expect(await seen(session(1))).toEqual([]);
    expect(await admin("select 1 from auth.sessions where id = $1", [session(1)])).toEqual([]);
  });

  it("keeps ten phones a person, disconnecting the one used longest ago", async () => {
    const ids: string[] = [];
    for (let n = 100; n < 110; n++) {
      await admin("insert into auth.sessions (id, user_id) values ($1, $2)", [session(n), USERS.bob]);
      ids.push(await register(USERS.bob, session(n), `Phone ${n}`));
      await admin("update public.phone_devices set last_seen_at = now() - make_interval(mins => $2) where id = $1", [ids.at(-1), 200 - n]);
    }
    await admin("insert into auth.sessions (id, user_id) values ($1, $2)", [session(110), USERS.bob]);
    await register(USERS.bob, session(110), "Phone 110");
    // Phone 100 was seen longest ago.
    expect(await seen(session(100))).toEqual([]);
    expect(await admin("select 1 from auth.sessions where id = $1", [session(100)])).toEqual([]);
    expect(await seen(session(101))).toHaveLength(1);
    expect((await admin<{ n: number }>("select count(*)::int as n from public.phone_devices where user_id = $1 and revoked_at is null", [USERS.bob]))[0]!.n).toBe(10);
  });

  it("moves a push token to the phone that reports it, and drops it when Apple says it's gone or keeps failing", async () => {
    await register(USERS.alice, session(200));
    await register(USERS.alice, session(201));
    expect((await q<{ ok: boolean }>("select public.app_phone_set_push($1, $2, 'production') as ok", [session(200), TOKEN]))[0]!.ok).toBe(true);
    expect((await seen(session(200)))[0]!.push).toBe(true);
    await q("select public.app_phone_set_push($1, $2, 'production')", [session(201), TOKEN.toUpperCase()]);
    expect((await seen(session(200)))[0]!.push).toBe(false);
    expect((await seen(session(201)))[0]!.push).toBe(true);

    for (let i = 0; i < 19; i++) await q("select public.app_phone_note_push($1, 'failed')", [TOKEN]);
    expect((await seen(session(201)))[0]!.push).toBe(true);
    await q("select public.app_phone_note_push($1, 'failed')", [TOKEN]);
    expect((await seen(session(201)))[0]!.push).toBe(false);

    await q("select public.app_phone_set_push($1, $2, 'development')", [session(201), TOKEN]);
    await q("select public.app_phone_note_push($1, 'gone')", [TOKEN]);
    expect((await seen(session(201)))[0]!.push).toBe(false);

    await expect(q("select public.app_phone_set_push($1, 'not-hex', 'production')", [session(201)])).rejects.toThrow(/push_token/);
    expect((await q<{ ok: boolean }>("select public.app_phone_set_push($1, $2, 'production') as ok", [session(999), TOKEN]))[0]!.ok).toBe(false);
  });
});

describe("who can reach phones", () => {
  it("lets people read their own phones' names, never sessions or push tokens, and write nothing", async () => {
    const mine = await as(db, "authenticated", USERS.alice, async () => (await db.query<{ name: string; user_id: string }>("select name, user_id from public.phone_devices")).rows);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((d) => d.user_id === USERS.alice)).toBe(true);
    await expect(as(db, "authenticated", USERS.alice, () => db.query("select session_id from public.phone_devices"))).rejects.toThrow(/permission denied/);
    await expect(as(db, "authenticated", USERS.alice, () => db.query("select push_token from public.phone_devices"))).rejects.toThrow(/permission denied/);
    await expect(as(db, "authenticated", USERS.alice, () => db.query("update public.phone_devices set name = 'x'"))).rejects.toThrow(/permission denied/);
    await expect(as(db, "authenticated", USERS.alice, () => db.query("select * from public.phone_connect_codes"))).rejects.toThrow(/permission denied/);
  });

  it("keeps every function to the server", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      await expect(as(db, role, USERS.alice, () => db.query("select public.app_phone_seen($1)", [session(200)]))).rejects.toThrow(/permission denied/);
      await expect(as(db, role, USERS.alice, () => db.query("select * from public.app_phone_code_redeem($1, $2)", [hash(1), CHALLENGE]))).rejects.toThrow(/permission denied/);
      await expect(as(db, role, USERS.alice, () => db.query("select public.app_phone_register($1, $2, 'ios', 'x', null)", [USERS.alice, session(300)]))).rejects.toThrow(/permission denied/);
      await expect(as(db, role, USERS.alice, () => db.query("select public.app_phone_revoke($1, $2)", [USERS.alice, session(1)]))).rejects.toThrow(/permission denied/);
    }
  });
});
