/**
 * Migration 2: projects and the service-role-only write functions.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let otherOrg: string;

const asService = <T>(fn: () => Promise<T>) => as(db, "service_role", null, fn);
const asUser = <T>(uid: string, fn: () => Promise<T>) => as(db, "authenticated", uid, fn);

async function createProject(actor: string, name: string, limit: number | null = null, orgId = org): Promise<string> {
  return asService(async () => {
    const r = await db.query<{ id: string }>("select public.app_create_project($1, $2, $3, $4, $5) as id", [orgId, actor, name, null, limit]);
    return r.rows[0]!.id;
  });
}

async function createTask(actor: string, project: string, title: string, orgId = org): Promise<string> {
  return asService(async () => {
    const r = await db.query<{ id: string }>("select public.app_create_task($1, $2, $3, $4) as id", [orgId, actor, project, title]);
    return r.rows[0]!.id;
  });
}

async function transition(task: string, eventId: string, from: string, to: string, expected: number, actor: string | null = USERS.alice) {
  return asService(async () => {
    const r = await db.query<{ v: number }>("select public.app_apply_task_transition($1, $2, 'user', $3, $4, 'cancel', $5, $6, $7) as v", [
      task,
      actor,
      actor ?? "system",
      eventId,
      from,
      to,
      expected,
    ]);
    return r.rows[0]!.v;
  });
}

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  otherOrg = await createOrg(db, USERS.bob, "Bob Labs");
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("grants", () => {
  it.each([
    ["app_create_project", "select public.app_create_project(gen_random_uuid(), gen_random_uuid(), 'x', null, 1)"],
    ["app_create_task", "select public.app_create_task(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'x')"],
    ["app_apply_task_transition", "select public.app_apply_task_transition(gen_random_uuid(), null, 'user', 'x', 'e', 'cancel', 'RECEIVED', 'CANCELLED', 0)"],
  ])("only the server can call %s", async (_name, sql) => {
    await expect(asUser(USERS.alice, () => db.query(sql))).rejects.toThrow(/permission denied/);
    await expect(as(db, "anon", null, () => db.query(sql))).rejects.toThrow(/permission denied/);
  });

  it("doesn't let the browser write projects", async () => {
    await expect(asUser(USERS.alice, () => db.query("insert into public.projects (org_id, name) values ($1, 'x')", [org]))).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("app_create_project", () => {
  it("creates a project for a contributor and audits it", async () => {
    const id = await createProject(USERS.alice, "Storefront");
    const rows = await asUser(USERS.alice, async () => ({
      project: (await db.query("select name, created_by from public.projects where id = $1", [id])).rows,
      audit: (await db.query("select action from public.audit_events where target = $1", [id])).rows,
    }));
    expect(rows.project).toEqual([{ name: "Storefront", created_by: USERS.alice }]);
    expect(rows.audit).toEqual([{ action: "project.created" }]);
  });

  it("refuses non-members", async () => {
    await expect(createProject(USERS.bob, "Intruder")).rejects.toThrow(/FORBIDDEN/);
  });

  it("enforces the plan limit passed by the server", async () => {
    const limited = await createOrg(db, USERS.alice, "Limited");
    await createProject(USERS.alice, "One", 1, limited);
    await expect(createProject(USERS.alice, "Two", 1, limited)).rejects.toThrow(/QUOTA_EXCEEDED/);
    await expect(createProject(USERS.alice, "Two", null, limited)).resolves.toBeTypeOf("string");
  });

  it("rejects duplicate names in one organization, case-insensitively", async () => {
    await createProject(USERS.alice, "Docs site");
    await expect(createProject(USERS.alice, "docs SITE")).rejects.toThrow(/DUPLICATE_NAME/);
  });

  it("rejects blank names", async () => {
    await expect(createProject(USERS.alice, "   ")).rejects.toThrow(/INVALID_NAME/);
  });

  it("keeps projects private to their organization", async () => {
    const bobProject = await createProject(USERS.bob, "Bob's app", 5, otherOrg);
    const seen = await asUser(USERS.alice, () => db.query("select id from public.projects where id = $1", [bobProject]));
    expect(seen.rows).toEqual([]);
  });
});

describe("app_create_task", () => {
  it("creates a task at RECEIVED, version 0", async () => {
    const project = await createProject(USERS.alice, "Tasks project");
    const task = await createTask(USERS.alice, project, "Rewrite product copy");
    const r = await asUser(USERS.alice, () => db.query("select state, version, project_id from public.tasks where id = $1", [task]));
    expect(r.rows).toEqual([{ state: "RECEIVED", version: 0, project_id: project }]);
  });

  it("refuses a project from another organization", async () => {
    const bobProject = await createProject(USERS.bob, "Bob's other app", 5, otherOrg);
    await expect(createTask(USERS.alice, bobProject, "Cross-tenant")).rejects.toThrow(/NOT_FOUND/);
  });

  it("refuses blank titles", async () => {
    const project = await createProject(USERS.alice, "Title checks");
    await expect(createTask(USERS.alice, project, " ")).rejects.toThrow(/INVALID_TITLE/);
  });
});

describe("app_apply_task_transition", () => {
  it("applies a transition, bumps the version and records history", async () => {
    const project = await createProject(USERS.alice, "Transitions");
    const task = await createTask(USERS.alice, project, "Cancel me");
    expect(await transition(task, "evt-1", "RECEIVED", "CANCELLED", 0)).toBe(1);
    const r = await asUser(USERS.alice, async () => ({
      task: (await db.query("select state, version from public.tasks where id = $1", [task])).rows,
      history: (await db.query("select event_id, from_state, to_state from public.task_transitions where task_id = $1", [task])).rows,
    }));
    expect(r.task).toEqual([{ state: "CANCELLED", version: 1 }]);
    expect(r.history).toEqual([{ event_id: "evt-1", from_state: "RECEIVED", to_state: "CANCELLED" }]);
  });

  it("treats a replayed event id as a no-op", async () => {
    const project = await createProject(USERS.alice, "Replays");
    const task = await createTask(USERS.alice, project, "Replay");
    await transition(task, "evt-r", "RECEIVED", "CANCELLED", 0);
    expect(await transition(task, "evt-r", "RECEIVED", "CANCELLED", 0)).toBe(1);
  });

  it("rejects a stale version or a changed state", async () => {
    const project = await createProject(USERS.alice, "Conflicts");
    const task = await createTask(USERS.alice, project, "Conflict");
    await expect(transition(task, "evt-a", "RECEIVED", "CANCELLED", 3)).rejects.toThrow(/VERSION_CONFLICT/);
    await expect(transition(task, "evt-b", "EXECUTING", "CANCELLED", 0)).rejects.toThrow(/VERSION_CONFLICT/);
  });

  it("refuses a user who isn't a contributor in the task's organization", async () => {
    const project = await createProject(USERS.alice, "Membership");
    const task = await createTask(USERS.alice, project, "Members only");
    await expect(transition(task, "evt-x", "RECEIVED", "CANCELLED", 0, USERS.bob)).rejects.toThrow(/FORBIDDEN/);
  });
});
