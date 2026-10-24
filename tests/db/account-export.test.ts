/**
 * Migration v42 (ADR 0070): a copy of what Farbaek holds about one person,
 * with other people's data and staff-only notes left out.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const su = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows;
type Export = Record<string, unknown> & { workspaces: { name: string; role: string }[]; support_requests: { subject: string; messages: { from: string; body: string }[] }[]; tasks_created: { title: string }[]; actions: Record<string, unknown>[] };
const exportOf = async (user: string) => (await q<{ e: Export | null }>("select public.app_account_export($1) as e", [user]))[0]!.e;

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alpha Studio");
  await su("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'member')", [org, USERS.bob]);
  const project = ((await su("insert into public.projects (org_id, name, created_by) values ($1, 'Bakery site', $2) returning id", [org, USERS.alice])) as { id: string }[])[0]!.id;
  await su("insert into public.tasks (org_id, project_id, title, created_by) values ($1, $2, 'Alice task', $3), ($1, $2, 'Bob task', $4)", [org, project, USERS.alice, USERS.bob]);
  await su("insert into public.audit_events (org_id, actor_id, action, target, metadata) values ($1, $2, 'member.invited', 'invite', $3)", [org, USERS.alice, JSON.stringify({ email: "carol@example.com" })]);
  const thread = (await q<{ id: string }>("select public.app_support_open($1, $2, 'not_working', 'Checks stuck', 'My checks never start.') as id", [USERS.alice, org]))[0]!.id;
  await su("insert into public.support_messages (thread_id, from_staff, author_id, internal, body) values ($1, true, $2, true, 'Staff-only note'), ($1, true, $2, false, 'Fixed now, try again.')", [thread, USERS.bob]);
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("a person's data export", () => {
  it("has the account, email choices, workspaces and what they made", async () => {
    const e = (await exportOf(USERS.alice))!;
    expect(e.format).toBe("farbaek-account-export/v1");
    expect(e.account).toMatchObject({ id: USERS.alice });
    expect(e.email_preferences).toMatchObject({ work_updates: true, trial_reminders: true });
    expect(e.workspaces).toEqual([expect.objectContaining({ name: "Alpha Studio", role: "owner" })]);
    expect(e.projects_created).toEqual([expect.objectContaining({ name: "Bakery site", workspace: "Alpha Studio" })]);
    expect(e.tasks_created.map((t) => t.title)).toEqual(["Alice task"]);
  });

  it("includes Farbaek's replies but never staff-only notes", async () => {
    const [request] = (await exportOf(USERS.alice))!.support_requests;
    expect(request!.subject).toBe("Checks stuck");
    expect(request!.messages.map((m) => [m.from, m.body])).toEqual([
      ["you", "My checks never start."],
      ["Farbaek", "Fixed now, try again."],
    ]);
  });

  it("lists actions without their details, which can name other people", async () => {
    const e = (await exportOf(USERS.alice))!;
    expect(e.actions).toContainEqual(expect.objectContaining({ action: "member.invited", target: "invite", workspace: "Alpha Studio" }));
    expect(JSON.stringify(e)).not.toContain("carol@example.com");
  });

  it("keeps each person to their own data", async () => {
    const bob = (await exportOf(USERS.bob))!;
    expect(bob.tasks_created.map((t) => t.title)).toEqual(["Bob task"]);
    expect(bob.support_requests).toEqual([]);
    expect(bob.workspaces).toEqual([expect.objectContaining({ role: "member" })]);
    expect(await exportOf("00000000-0000-4000-8000-0000000000ff")).toBeNull();
  });

  it("stays out of reach of browsers", async () => {
    await expect(as(db, "authenticated", USERS.alice, () => db.query("select public.app_account_export($1)", [USERS.alice]))).rejects.toThrow(/permission denied/);
    await expect(as(db, "anon", null, () => db.query("select public.app_account_export($1)", [USERS.alice]))).rejects.toThrow(/permission denied/);
  });
});
