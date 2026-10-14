/**
 * Migration 9: owners and admins archive projects. Archiving frees the
 * project's slot and name, keeps everything readable, and refuses changes.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const asUser = <T>(uid: string, fn: () => Promise<T>) => as(db, "authenticated", uid, fn);

async function project(name: string, limit: number | null = null): Promise<string> {
  return (await q<{ id: string }>("select public.app_create_project($1, $2, $3, null, $4) as id", [org, USERS.alice, name, limit]))[0]!.id;
}
const archive = (id: string, actor: string = USERS.alice) => q("select public.app_archive_project($1, $2)", [id, actor]);
const importOne = (id: string) =>
  q("select public.app_import_files($1, $2, $3, 524288, 4194304, 26214400, 3000)", [id, USERS.alice, JSON.stringify([{ path: "README.md", content: "# hi\n" }])]);

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  await q("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'member')", [org, USERS.bob]);
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("archiving a project", () => {
  it("is for owners and admins only", async () => {
    const id = await project("Members can't");
    await expect(archive(id, USERS.bob)).rejects.toThrow(/FORBIDDEN/);
    await archive(id, USERS.alice);
    await expect(archive(id, USERS.alice)).rejects.toThrow(/ALREADY_ARCHIVED/);
    const audit = await q<{ action: string }>("select action from public.audit_events where target = $1", [id]);
    expect(audit.map((a) => a.action)).toContain("project.archived");
  });

  it("frees the slot under the plan limit and the name", async () => {
    const used = (await q<{ n: number }>("select count(*)::int as n from public.projects where org_id = $1 and archived_at is null", [org]))[0]!.n;
    const id = await project("Reusable name", used + 1);
    await expect(project("One too many", used + 1)).rejects.toThrow(/QUOTA_EXCEEDED/);
    await archive(id);
    await expect(project("Reusable name", used + 1)).resolves.toMatch(/[0-9a-f-]{36}/);
  });

  it("keeps files and history readable to members, and refuses changes with a clear error", async () => {
    const id = await project("Read-only later");
    await importOne(id);
    await archive(id);
    await expect(importOne(id)).rejects.toThrow(/PROJECT_ARCHIVED/);
    await expect(q("select public.app_save_file($1, $2, 'b.md', 'x', 0, 524288, 26214400, 3000)", [id, USERS.alice])).rejects.toThrow(/PROJECT_ARCHIVED/);
    const files = await asUser(USERS.bob, () => db.query("select path from public.project_files where project_id = $1", [id]));
    expect(files.rows).toEqual([{ path: "README.md" }]);
    const content = await asUser(USERS.bob, () => db.query<{ content: string }>("select content from public.get_project_file($1, 'README.md')", [id]));
    expect(content.rows[0]!.content).toBe("# hi\n");
  });

  it("can't be called from the browser", async () => {
    const id = await project("Server only");
    await expect(asUser(USERS.alice, () => db.query("select public.app_archive_project($1, $2)", [id, USERS.alice]))).rejects.toThrow(/permission denied/);
    await expect(asUser(USERS.alice, () => db.query("update public.projects set archived_at = now() where id = $1", [id]))).rejects.toThrow(/permission denied/);
  });
});
