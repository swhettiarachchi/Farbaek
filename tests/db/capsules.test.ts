/**
 * Migration 25: Workspace Capsules (ADR 0037). The server records each Capsule
 * a workspace packs or opens; members read their own workspace's records;
 * browsers can neither call the function nor write the table.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let other: string;
let project: string;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const admin = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const DIGEST = "b".repeat(64);

const record = (direction: string, actor: string = USERS.alice, p: string | null = project, o = org) =>
  q<{ id: number }>("select public.app_record_capsule($1, $2, $3, $4, $5, 'Harbor Café', 3, 1200, 2) as id", [o, actor, p, direction, DIGEST]);

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  other = await createOrg(db, USERS.bob, "Bob Labs");
  project = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Harbor Café', null, null) as id", [org, USERS.alice]))[0]!.id;
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("workspace capsules", () => {
  it("records an export and an import, with an audit event each", async () => {
    await record("export");
    await record("import");
    expect(await admin("select direction, digest, files, bytes, excluded, created_by from public.workspace_capsules order by id")).toEqual([
      { direction: "export", digest: DIGEST, files: 3, bytes: 1200, excluded: 2, created_by: USERS.alice },
      { direction: "import", digest: DIGEST, files: 3, bytes: 1200, excluded: 2, created_by: USERS.alice },
    ]);
    expect(await admin("select action from public.audit_events where action like 'capsule.%' order by id")).toEqual([{ action: "capsule.exported" }, { action: "capsule.imported" }]);
  });

  it("refuses non-members, another workspace's project and bad input", async () => {
    await expect(record("export", USERS.bob)).rejects.toThrow(/FORBIDDEN/);
    await expect(record("import", USERS.bob)).rejects.toThrow(/FORBIDDEN/);
    await expect(record("export", USERS.alice, project, other)).rejects.toThrow(/FORBIDDEN|NOT_FOUND/);
    await expect(record("sideways")).rejects.toThrow(/INVALID_INPUT/);
    await expect(q("select public.app_record_capsule($1, $2, $3, 'export', 'not-a-digest', 'x', 1, 1, 0)", [org, USERS.alice, project])).rejects.toThrow(/INVALID_INPUT/);
  });

  it("lets members read only their own workspace's records", async () => {
    const mine = await as(db, "authenticated", USERS.alice, async () => (await db.query("select direction from public.workspace_capsules")).rows);
    const theirs = await as(db, "authenticated", USERS.bob, async () => (await db.query("select direction from public.workspace_capsules")).rows);
    expect(mine.length).toBe(2);
    expect(theirs).toEqual([]);
  });

  it("keeps browsers out of the function and the table", async () => {
    await expect(
      as(db, "authenticated", USERS.alice, () => db.query("select public.app_record_capsule($1, $2, $3, 'export', $4, 'x', 1, 1, 0)", [org, USERS.alice, project, DIGEST])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      as(db, "authenticated", USERS.alice, () => db.query("insert into public.workspace_capsules (org_id, direction, digest, project_name, files, bytes) values ($1, 'export', $2, 'x', 1, 1)", [org, DIGEST])),
    ).rejects.toThrow(/permission denied/);
  });

  it("limits records to 30 a minute per workspace", async () => {
    for (let i = 0; i < 28; i += 1) await record("export");
    await expect(record("export")).rejects.toThrow(/RATE_LIMITED/);
  });
});
