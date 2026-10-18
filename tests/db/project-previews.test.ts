/**
 * Migration 17: previews of a project's files. A preview points at a
 * session and port, or at a project, never both; members open them for
 * themselves; one launch, while open, only for the person who opened it and
 * only while the project isn't archived; owners and admins can close them.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let project: string;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const admin = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
let n = 0;
const id = () => `${"a".repeat(24)}${String.fromCharCode(97 + (n % 26))}${String.fromCharCode(97 + Math.floor(++n / 26) % 26)}`;

const open = (previewId: string, actor: string = USERS.alice, ttl = 3600) => q("select public.app_create_project_preview($1, $2, $3, $4)", [project, actor, previewId, ttl]);
const launch = (previewId: string, user: string = USERS.alice) => q<{ session_id: string | null; port: number | null }>("select * from public.app_launch_sandbox_preview($1, $2)", [previewId, user]);
const revoke = (previewId: string, actor: string) => q("select public.app_revoke_sandbox_preview($1, $2)", [previewId, actor]);

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  project = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Site', null, null) as id", [org, USERS.alice]))[0]!.id;
  // Bob is a viewer here: viewers can look at files, so they can preview them.
  await admin("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'viewer')", [org, USERS.bob]);
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("project previews", () => {
  it("opens a preview for a member and launches it once, with no session or port", async () => {
    const p = id();
    await open(p);
    expect(await admin("select session_id, port, project_id from public.sandbox_previews where id = $1", [p])).toEqual([{ session_id: null, port: null, project_id: project }]);
    expect(await launch(p)).toEqual([{ session_id: null, port: null, expires_at: expect.anything() }]);
    await expect(launch(p)).rejects.toThrow(/PREVIEW_UNAVAILABLE/);
    expect(await admin("select 1 from public.audit_events where action = 'preview.opened' and target = $1", [p])).toHaveLength(1);
  });

  it("lets a viewer preview, but not someone outside the workspace, and only the opener launches", async () => {
    const p = id();
    await open(p, USERS.bob);
    await expect(launch(p, USERS.alice)).rejects.toThrow(/PREVIEW_UNAVAILABLE/);
    expect(await launch(p, USERS.bob)).toHaveLength(1);
    await expect(open(id(), USERS.unverified)).rejects.toThrow(/FORBIDDEN/);
  });

  it("refuses odd ids and lifetimes, caps open previews, and stops at an archived project", async () => {
    await expect(open("not-an-id")).rejects.toThrow(/INVALID_REQUEST/);
    await expect(open(id(), USERS.alice, 10)).rejects.toThrow(/INVALID_LIMITS/);
    const p = id();
    await open(p);
    await admin("update public.projects set archived_at = now() where id = $1", [project]);
    await expect(launch(p)).rejects.toThrow(/PREVIEW_UNAVAILABLE/);
    await admin("update public.projects set archived_at = null where id = $1", [project]);
    await admin("delete from public.sandbox_previews where created_by = $1", [USERS.alice]);
    for (let i = 0; i < 10; i += 1) await open(id());
    await expect(open(id())).rejects.toThrow(/PREVIEW_LIMIT/);
  });

  it("is closed by its opener or an owner, not by another member", async () => {
    await admin("delete from public.sandbox_previews");
    const p = id();
    await open(p, USERS.bob);
    await revoke(p, USERS.alice);
    expect((await admin<{ revoked_at: string | null }>("select revoked_at from public.sandbox_previews where id = $1", [p]))[0]!.revoked_at).not.toBeNull();
    const mine = id();
    await open(mine);
    await expect(revoke(mine, USERS.bob)).rejects.toThrow(/FORBIDDEN/);
  });

  it("keeps a preview pointing at exactly one thing", async () => {
    await expect(admin("insert into public.sandbox_previews (id, org_id, created_by, expires_at) values ($1, $2, $3, now() + interval '1 hour')", [id(), org, USERS.alice])).rejects.toThrow(/sandbox_previews_target/);
    await expect(
      admin("insert into public.sandbox_previews (id, org_id, created_by, expires_at, project_id, port) values ($1, $2, $3, now() + interval '1 hour', $4, 3000)", [id(), org, USERS.alice, project]),
    ).rejects.toThrow(/sandbox_previews_target/);
  });

  it("is server-only to open", async () => {
    await expect(as(db, "authenticated", USERS.alice, () => db.query("select public.app_create_project_preview($1, $2, $3, 3600)", [project, USERS.alice, id()]))).rejects.toThrow(/permission denied/);
  });
});
