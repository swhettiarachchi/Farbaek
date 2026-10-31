/**
 * Migration v86: importing a private repository with the workspace's GitHub
 * token (ADR 0144). Only the server records it, only for owners and admins,
 * with a repository and commit in the expected shape; each import is
 * audited once and marks the token as used.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let otherOrg: string;
let project: string;

const asService = <T>(fn: () => Promise<T>) => as(db, "service_role", null, fn);
const asUser = <T>(uid: string, fn: () => Promise<T>) => as(db, "authenticated", uid, fn);
const admin = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => asService(async () => (await db.query<T>(sql, params)).rows);
const SHA = "7fd1a60b01f91b314f59955a4e4d4e80d8edf11d";

const record = (actor: string, repository: string | null = "alice/shop", commit: string | null = SHA, target = project) =>
  q("select public.app_record_github_import($1, $2, $3, $4, $5)", [org, actor, target, repository, commit]);
const imports = () => admin<{ actor_id: string; metadata: Record<string, unknown> }>("select actor_id, metadata from public.audit_events where org_id = $1 and action = 'project.github_imported' order by id", [org]);

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  otherOrg = await createOrg(db, USERS.bob, "Bob Labs");
  project = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Shop', null, null) as id", [org, USERS.alice]))[0]!.id;
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("recording a private import", () => {
  it("needs the workspace's GitHub connection", async () => {
    await expect(record(USERS.alice)).rejects.toThrow(/GITHUB_NOT_CONNECTED/);
    await admin("insert into public.workspace_github (org_id, token_sealed, login, token_hint, set_by) values ($1, $2, 'alice', 'abcd', $3)", [org, `v1.k1.${"A".repeat(50)}`, USERS.alice]);
  });

  it("records it once, with the repository and commit, and marks the token as used", async () => {
    await record(USERS.alice);
    expect(await imports()).toEqual([{ actor_id: USERS.alice, metadata: { repository: "alice/shop", commit: SHA, with: "workspace token" } }]);
    const [g] = await admin<{ last_used_at: string | null }>("select last_used_at from public.workspace_github where org_id = $1", [org]);
    expect(g!.last_used_at).not.toBeNull();
    // A branch whose commit GitHub didn't name is recorded without one.
    await record(USERS.alice, "alice/shop", null);
    expect((await imports()).at(-1)!.metadata.commit).toBeNull();
  });

  it("is for owners and admins only", async () => {
    await admin("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'member')", [org, USERS.bob]);
    const before = (await imports()).length;
    await expect(record(USERS.bob)).rejects.toThrow(/FORBIDDEN/);
    await admin("update public.organization_members set role = 'admin' where org_id = $1 and user_id = $2", [org, USERS.bob]);
    await record(USERS.bob);
    expect((await imports()).length).toBe(before + 1);
  });

  it("refuses another workspace's project and malformed names", async () => {
    const theirs = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Theirs', null, null) as id", [otherOrg, USERS.bob]))[0]!.id;
    const before = (await imports()).length;
    await expect(record(USERS.alice, "alice/shop", SHA, theirs)).rejects.toThrow(/NOT_FOUND/);
    for (const bad of [null, "alice", "alice/shop/extra", "-alice/shop", "alice/sh op", `alice/${"x".repeat(101)}`]) {
      await expect(record(USERS.alice, bad), String(bad)).rejects.toThrow(/INVALID_REPOSITORY/);
    }
    await expect(record(USERS.alice, "alice/shop", "main")).rejects.toThrow(/INVALID_COMMIT/);
    expect((await imports()).length).toBe(before);
  });

  it("is the server's alone", async () => {
    for (const uid of [USERS.alice, USERS.bob]) {
      await expect(asUser(uid, () => db.query("select public.app_record_github_import($1, $2, $3, 'alice/shop', null)", [org, uid, project]))).rejects.toThrow(/permission denied/);
    }
    await expect(as(db, "anon", null, () => db.query("select public.app_record_github_import($1, $2, $3, 'alice/shop', null)", [org, USERS.alice, project]))).rejects.toThrow(/permission denied/);
  });
});
