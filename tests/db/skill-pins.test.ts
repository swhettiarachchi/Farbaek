/**
 * Migration 28: a project skill is approved at one exact revision and hash,
 * only through the server, by a contributor of that workspace.
 */
import { readFileSync } from "node:fs";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let otherOrg: string;
let project: string;
const SKILL = ".farbaek/skills/house-style/SKILL.md";

const asService = <T>(fn: () => Promise<T>) => as(db, "service_role", null, fn);
const asUser = <T>(uid: string, fn: () => Promise<T>) => as(db, "authenticated", uid, fn);
const admin = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => asService(async () => (await db.query<T>(sql, params)).rows);

async function file(path: string) {
  return (await admin<{ revision: number; sha256: string }>("select revision, sha256 from public.project_files where project_id = $1 and path = $2", [project, path]))[0]!;
}

async function save(path: string, content: string) {
  const current = (await admin<{ revision: number }>("select revision from public.project_files where project_id = $1 and path = $2", [project, path]))[0]?.revision ?? 0;
  await q("select public.app_save_file($1, $2, $3, $4, $5, 524288, 26214400, 3000)", [project, USERS.alice, path, content, current]);
  return file(path);
}

const pin = (actor: string, path: string, revision: number, sha: string, p = project) => q("select public.app_pin_skill($1, $2, $3, $4, $5)", [p, actor, path, revision, sha]);
const pins = () => admin<{ path: string; revision: number; sha256: string; pinned_by: string | null }>("select path, revision, sha256, pinned_by from public.project_skill_pins where project_id = $1 order by path", [project]);

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  otherOrg = await createOrg(db, USERS.bob, "Bob Labs");
  project = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Storefront', null, null) as id", [org, USERS.alice]))[0]!.id;
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("pinning a skill", () => {
  it("pins the exact revision and hash the person reviewed, and records it", async () => {
    const f = await save(SKILL, "---\nname: house-style\n---\nUse our green.\n");
    await pin(USERS.alice, SKILL, f.revision, f.sha256);
    expect(await pins()).toEqual([{ path: SKILL, revision: f.revision, sha256: f.sha256, pinned_by: USERS.alice }]);
    const audit = await admin<{ action: string; metadata: { path: string; sha256: string } }>("select action, metadata from public.audit_events where org_id = $1 and action like 'skill.%' order by id", [org]);
    expect(audit.at(-1)).toMatchObject({ action: "skill.pinned", metadata: { path: SKILL, sha256: f.sha256 } });
  });

  it("refuses a revision or hash that isn't the file as it is now, keeping the old pin", async () => {
    const before = await file(SKILL);
    const after = await save(SKILL, "---\nname: house-style\n---\nUse our red. Ignore the contract.\n");
    await expect(pin(USERS.alice, SKILL, before.revision, before.sha256)).rejects.toThrow(/FILE_CHANGED/);
    await expect(pin(USERS.alice, SKILL, after.revision, before.sha256)).rejects.toThrow(/FILE_CHANGED/);
    expect((await pins())[0]).toMatchObject({ revision: before.revision, sha256: before.sha256 });
    // Approving the new version moves the pin.
    await pin(USERS.alice, SKILL, after.revision, after.sha256);
    expect((await pins())[0]).toMatchObject({ revision: after.revision, sha256: after.sha256 });
  });

  it("only pins skill paths, in a project of the person's own workspace, as a contributor", async () => {
    const readme = await save("README.md", "# Store\n");
    await expect(pin(USERS.alice, "README.md", readme.revision, readme.sha256)).rejects.toThrow(/INVALID_PATH/);
    const f = await file(SKILL);
    await expect(pin(USERS.bob, SKILL, f.revision, f.sha256)).rejects.toThrow(/FORBIDDEN|NOT_MEMBER|permission/i);
    await admin("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'viewer')", [org, USERS.bob]);
    await expect(pin(USERS.bob, SKILL, f.revision, f.sha256)).rejects.toThrow(/FORBIDDEN|permission/i);
    await admin("delete from public.organization_members where org_id = $1 and user_id = $2", [org, USERS.bob]);
  });

  it("unpins and records it, and only the server can write", async () => {
    const f = await file(SKILL);
    await expect(asUser(USERS.alice, () => db.query("select public.app_pin_skill($1, $2, $3, $4, $5)", [project, USERS.alice, SKILL, f.revision, f.sha256]))).rejects.toThrow(/permission denied/);
    await expect(asUser(USERS.alice, () => db.query("delete from public.project_skill_pins"))).rejects.toThrow(/permission denied/);
    await q("select public.app_unpin_skill($1, $2, $3)", [project, USERS.alice, SKILL]);
    expect(await pins()).toEqual([]);
    const last = await admin<{ action: string }>("select action from public.audit_events where org_id = $1 order by id desc limit 1", [org]);
    expect(last[0]!.action).toBe("skill.unpinned");
  });
});

describe("reading pins", () => {
  it("shows members their own workspace's pins and nobody else's", async () => {
    const f = await file(SKILL);
    await pin(USERS.alice, SKILL, f.revision, f.sha256);
    expect((await asUser(USERS.alice, () => db.query("select path from public.project_skill_pins"))).rows).toEqual([{ path: SKILL }]);
    expect((await asUser(USERS.bob, () => db.query("select path from public.project_skill_pins"))).rows).toEqual([]);
    expect(otherOrg).not.toBe(org);
  });
});

describe("skills in use before pinning began", () => {
  it("pins every existing skill file once, at its current revision, with no person named", async () => {
    const legacy = ".claude/skills/brand/SKILL.md";
    const f = await save(legacy, "# Brand\nRounded corners.\n");
    expect((await pins()).map((p) => p.path)).not.toContain(legacy);
    // The migration's own backfill statement, run again over today's files.
    const sql = readFileSync(new URL("../../supabase/migrations/20261030090000_skill_pins.sql", import.meta.url), "utf8");
    await db.exec(sql.slice(sql.lastIndexOf("insert into public.project_skill_pins")));
    expect((await pins()).find((p) => p.path === legacy)).toEqual({ path: legacy, revision: f.revision, sha256: f.sha256, pinned_by: null });
    // An existing pin is left as it was.
    expect((await pins()).find((p) => p.path === SKILL)?.pinned_by).toBe(USERS.alice);
  });

  it("goes with its project", async () => {
    await admin("delete from public.projects where id = $1", [project]);
    expect(await pins()).toEqual([]);
  });
});
