/**
 * Migration 18: security reports. One running check per project, started by
 * a contributor; finished once by the server with a real report; stale
 * checks are failed; members read their own workspace's reports only.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let project: string;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const admin = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const start = (actor: string = USERS.alice, p = project) => q<{ id: string }>("select public.app_start_security_report($1, $2, $3) as id", [org, actor, p]).then((r) => r[0]!.id);
const statement = { _type: "https://in-toto.io/Statement/v1", predicateType: "https://farbaek.dev/security-report/v1", predicate: { score: 82 } };
const finish = (id: string, status = "done", st: object | null = statement) =>
  q("select public.app_finish_security_report($1, $2, 82, 'B', $3, $4, $5, $6)", [id, status, JSON.stringify({ high: 1 }), st ? JSON.stringify(st) : null, "d".repeat(64), status === "failed" ? "boom" : null]);

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  await createOrg(db, USERS.bob, "Bob Labs");
  project = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Site', null, null) as id", [org, USERS.alice]))[0]!.id;
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("security reports", () => {
  it("runs one check per project at a time and records the report once", async () => {
    const id = await start();
    await expect(start()).rejects.toThrow(/CHECK_RUNNING/);
    await finish(id);
    expect(await admin("select status, score, grade, digest from public.security_reports where id = $1", [id])).toEqual([{ status: "done", score: 82, grade: "B", digest: "d".repeat(64) }]);
    await expect(finish(id)).rejects.toThrow(/CHECK_FINISHED/);
    expect(await admin("select action from public.audit_events where target = $1 order by id", [id])).toEqual([{ action: "security.check_started" }, { action: "security.check_finished" }]);
  });

  it("refuses a done report that isn't a security report, and records failures without one", async () => {
    const id = await start();
    await expect(finish(id, "done", { predicateType: "https://example.com/other" })).rejects.toThrow(/INVALID_REPORT/);
    await finish(id, "failed", null);
    expect(await admin("select status, score, statement, error from public.security_reports where id = $1", [id])).toEqual([{ status: "failed", score: null, statement: null, error: "boom" }]);
  });

  it("needs a contributor and an active project", async () => {
    await expect(start(USERS.bob)).rejects.toThrow(/FORBIDDEN/);
    await admin("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'viewer')", [org, USERS.unverified]);
    await expect(start(USERS.unverified)).rejects.toThrow(/FORBIDDEN/);
    const archived = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Old', null, null) as id", [org, USERS.alice]))[0]!.id;
    await admin("update public.projects set archived_at = now() where id = $1", [archived]);
    await expect(start(USERS.alice, archived)).rejects.toThrow(/PROJECT_ARCHIVED/);
  });

  it("fails checks whose server went away", async () => {
    const id = await start();
    await admin("update public.security_reports set started_at = now() - interval '1 hour' where id = $1", [id]);
    expect(await q<{ n: number }>("select public.app_interrupt_stale_security_reports(now() - interval '20 minutes') as n")).toEqual([{ n: 1 }]);
    expect(await admin("select status from public.security_reports where id = $1", [id])).toEqual([{ status: "failed" }]);
  });

  it("is read by members of the workspace only, and written by the server only", async () => {
    expect((await as(db, "authenticated", USERS.alice, async () => (await db.query("select id from public.security_reports")).rows)).length).toBeGreaterThan(0);
    expect(await as(db, "authenticated", USERS.bob, async () => (await db.query("select id from public.security_reports")).rows)).toEqual([]);
    await expect(as(db, "authenticated", USERS.alice, () => db.query("update public.security_reports set score = 100"))).rejects.toThrow(/permission denied/);
    await expect(as(db, "authenticated", USERS.alice, () => db.query("select public.app_start_security_report($1, $2, $3)", [org, USERS.alice, project]))).rejects.toThrow(/permission denied/);
  });
});
