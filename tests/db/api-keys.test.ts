/**
 * Migration v90: developer API keys (stage 177, ADR 0187). Only owners and
 * admins make and revoke them, at most 10 working at once; each change is
 * audited with the key's first characters, never the key or its hash;
 * browsers can list keys but never read a hash; and a key works only while
 * it's unrevoked, unexpired and its maker is still an owner or admin there.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let otherOrg: string;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const su = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const hash = (n: number) => n.toString(16).padStart(64, "0");
const create = async (actor: string, n: number, days = 90, orgId = org, name = `Key ${n}`) =>
  (await q<{ id: string }>("select public.app_create_api_key($1, $2, $3, $4, 'fbk_abcd', $5) as id", [orgId, actor, name, hash(n), days]))[0]!.id;
const session = (n: number) => q<{ key_id: string; org_id: string; user_id: string; role: string; suspended: boolean }>("select * from public.app_api_key_session($1)", [hash(n)]);

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  otherOrg = await createOrg(db, USERS.bob, "Bob Labs");
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("making and revoking keys", () => {
  it("lets an owner make a key that works at once, as them, and records it without the hash", async () => {
    const id = await create(USERS.alice, 1);
    expect(await session(1)).toEqual([{ key_id: id, org_id: org, user_id: USERS.alice, role: "owner", suspended: false }]);
    const event = await su<{ metadata: Record<string, unknown> }>("select metadata from public.audit_events where org_id = $1 and action = 'api_key.created'", [org]);
    expect(event.map((e) => e.metadata)).toEqual([{ name: "Key 1", key_starts: "fbk_abcd", days: 90 }]);
    expect(JSON.stringify(event)).not.toContain(hash(1));
  });

  it("refuses members, viewers and other workspaces' people", async () => {
    await expect(create(USERS.bob, 2)).rejects.toThrow(/FORBIDDEN/);
    for (const role of ["member", "viewer"]) {
      await su("insert into public.organization_members (org_id, user_id, role) values ($1, $2, $3) on conflict (org_id, user_id) do update set role = excluded.role", [org, USERS.bob, role]);
      await expect(create(USERS.bob, 2)).rejects.toThrow(/FORBIDDEN/);
    }
    await su("delete from public.organization_members where org_id = $1 and user_id = $2", [org, USERS.bob]);
  });

  it("only offers 30, 90 or 365 days, and keeps names and hashes to their shape", async () => {
    await expect(create(USERS.alice, 3, 7)).rejects.toThrow(/INVALID_REQUEST/);
    await expect(create(USERS.alice, 3, 90, org, "  ")).rejects.toThrow(/api_keys_name_check/);
    await expect(create(USERS.alice, 3, 90, org, "line\nbreak")).rejects.toThrow(/api_keys_name_check/);
    await expect(q("select public.app_create_api_key($1, $2, 'x', 'not-a-hash', 'fbk_abcd', 90)", [org, USERS.alice])).rejects.toThrow(/token_sha256/);
    await expect(q("select public.app_create_api_key($1, $2, 'x', $3, 'abcd', 90)", [org, USERS.alice, hash(3)])).rejects.toThrow(/hint/);
  });

  it("keeps at most 10 working keys in a workspace", async () => {
    for (let n = 10; n < 19; n++) await create(USERS.alice, n);
    await expect(create(USERS.alice, 19)).rejects.toThrow(/QUOTA_EXCEEDED/);
    // Revoking one makes room.
    const [first] = await su<{ id: string }>("select id from public.api_keys where token_sha256 = $1", [hash(10)]);
    await q("select public.app_revoke_api_key($1, $2, $3)", [org, USERS.alice, first!.id]);
    await create(USERS.alice, 19);
  });

  it("revokes once, for good, only within its own workspace, and says when there's nothing to revoke", async () => {
    const id = await create(USERS.bob, 30, 30, otherOrg);
    await expect(q("select public.app_revoke_api_key($1, $2, $3)", [org, USERS.alice, id])).rejects.toThrow(/NOT_FOUND/);
    await q("select public.app_revoke_api_key($1, $2, $3)", [otherOrg, USERS.bob, id]);
    expect(await session(30)).toEqual([]);
    await expect(q("select public.app_revoke_api_key($1, $2, $3)", [otherOrg, USERS.bob, id])).rejects.toThrow(/NOT_FOUND/);
  });
});

describe("what a key may do", () => {
  it("stops when it expires", async () => {
    // In Bob's workspace: Alice's already has its 10 working keys from the test above.
    await create(USERS.bob, 40, 30, otherOrg);
    await su("update public.api_keys set created_at = now() - interval '31 days', expires_at = now() - interval '1 day' where token_sha256 = $1", [hash(40)]);
    expect(await session(40)).toEqual([]);
  });

  it("is revoked for good when its maker stops being an owner or admin, even if they become one again", async () => {
    await su("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'admin')", [otherOrg, USERS.alice]);
    await create(USERS.alice, 41, 90, otherOrg);
    expect((await session(41))[0]?.role).toBe("admin");
    await su("update public.organization_members set role = 'member' where org_id = $1 and user_id = $2", [otherOrg, USERS.alice]);
    expect(await session(41)).toEqual([]);
    // Promoted again: the key that may have leaked stays off.
    await su("update public.organization_members set role = 'admin' where org_id = $1 and user_id = $2", [otherOrg, USERS.alice]);
    expect(await session(41)).toEqual([]);
    const [row] = await su<{ revoked_at: string | null }>("select revoked_at from public.api_keys where token_sha256 = $1", [hash(41)]);
    expect(row!.revoked_at).not.toBeNull();
    const audit = await su<{ actor_id: string | null; metadata: Record<string, unknown> }>("select actor_id, metadata from public.audit_events where org_id = $1 and action = 'api_key.revoked' and metadata->>'reason' = 'role_changed'", [otherOrg]);
    expect(audit).toEqual([{ actor_id: null, metadata: { key_starts: "fbk_abcd", reason: "role_changed" } }]);
  });

  it("is revoked for good when its maker leaves, and a role change between owner and admin leaves keys alone", async () => {
    await create(USERS.alice, 42, 90, otherOrg);
    await su("update public.organization_members set role = 'owner' where org_id = $1 and user_id = $2", [otherOrg, USERS.alice]);
    expect((await session(42))[0]?.role).toBe("owner");
    await su("delete from public.organization_members where org_id = $1 and user_id = $2", [otherOrg, USERS.alice]);
    expect(await session(42)).toEqual([]);
    await su("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'admin')", [otherOrg, USERS.alice]);
    expect(await session(42)).toEqual([]);
    await su("delete from public.organization_members where org_id = $1 and user_id = $2", [otherOrg, USERS.alice]);
  });

  it("doesn't stand in the way of deleting a whole workspace that has keys", async () => {
    const doomed = await createOrg(db, USERS.bob, "Short-lived");
    await create(USERS.bob, 43, 90, doomed);
    await su("delete from public.organizations where id = $1", [doomed]);
    expect(await su("select id from public.api_keys where org_id = $1", [doomed])).toEqual([]);
  });

  it("says when the workspace is suspended, and refuses new keys there", async () => {
    await su("update public.organizations set suspended_at = now() where id = $1", [org]);
    expect((await session(1))[0]?.suspended).toBe(true);
    await expect(create(USERS.alice, 50)).rejects.toThrow(/SUSPENDED/);
    await su("update public.organizations set suspended_at = null where id = $1", [org]);
  });

  it("knows nothing of a key it never made", async () => {
    expect(await session(999)).toEqual([]);
  });
});

describe("who can see keys", () => {
  it("lets owners and admins list their workspace's keys but never read a hash", async () => {
    const rows = await as(db, "authenticated", USERS.alice, async () => (await db.query<{ name: string }>("select name from public.api_keys where org_id = $1", [org])).rows);
    expect(rows.length).toBeGreaterThan(0);
    await expect(as(db, "authenticated", USERS.alice, () => db.query("select token_sha256 from public.api_keys"))).rejects.toThrow(/permission denied/);
  });

  it("hides them from other workspaces' people and from members", async () => {
    expect(await as(db, "authenticated", USERS.bob, async () => (await db.query("select id from public.api_keys where org_id = $1", [org])).rows)).toEqual([]);
    await su("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'member')", [org, USERS.bob]);
    expect(await as(db, "authenticated", USERS.bob, async () => (await db.query("select id from public.api_keys where org_id = $1", [org])).rows)).toEqual([]);
    await su("delete from public.organization_members where org_id = $1 and user_id = $2", [org, USERS.bob]);
  });

  it("keeps the functions away from browsers", async () => {
    await expect(as(db, "authenticated", USERS.alice, () => db.query("select * from public.app_api_key_session($1)", [hash(1)]))).rejects.toThrow(/permission denied/);
    await expect(as(db, "authenticated", USERS.alice, () => db.query("select public.app_create_api_key($1, $2, 'x', $3, 'fbk_abcd', 90)", [org, USERS.alice, hash(60)]))).rejects.toThrow(/permission denied/);
  });
});
