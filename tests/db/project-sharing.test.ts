/**
 * Migration v91: share one project (ADR 0188). A guest reads exactly one
 * project and, with "edit", changes its files and writes tasks; everything
 * that spends the workspace's AI or test spaces, approves, applies or
 * publishes stays with members. A read-only link shows current files only
 * while it's live.
 */
import { createHash } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let project: string;
let otherProject: string;
const CAROL = "00000000-0000-4000-8000-0000000ca201";
const DAN = "00000000-0000-4000-8000-0000000da201";
const ERIN = "00000000-0000-4000-8000-0000000e4201";

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const asUser = async <T = Record<string, unknown>>(uid: string, sql: string, params: unknown[] = []) => as(db, "authenticated", uid, async () => (await db.query<T>(sql, params)).rows);
const hash = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
const err = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return (e as Error).message;
  }
  return "no error";
};

let n = 0;
async function invite(email: string, access: "view" | "edit", opts: { actor?: string; seats?: number | null; project?: string } = {}) {
  const token = `ptoken-${++n}-${email}`;
  const rows = await q<{ id: string }>("select public.app_create_project_invitation($1, $2, $3, $4, $5, $6, $7) as id", [
    opts.project ?? project,
    opts.actor ?? USERS.alice,
    email,
    access,
    hash(token),
    inDays(7),
    opts.seats === undefined ? 10 : opts.seats,
  ]);
  return { id: rows[0]!.id, token };
}
const accept = (token: string, actor: string, seats: number | null = 10) =>
  q<{ project: string }>("select public.app_accept_project_invitation($1, $2, $3) as project", [hash(token), actor, seats]).then((r) => r[0]!.project);
const saveFile = (actor: string, path: string, content: string, expected: number, target = project) =>
  q<{ rev: number }>("select public.app_save_file($1, $2, $3, $4, $5, 512000, 52428800, 3000) as rev", [target, actor, path, content, expected]);

beforeAll(async () => {
  db = await createTestDb();
  await db.query(
    "insert into auth.users (id, email, email_confirmed_at) values ($1, 'carol@example.test', now()), ($2, 'dan@example.test', now()), ($3, 'erin@example.test', now())",
    [CAROL, DAN, ERIN],
  );
  org = await createOrg(db, USERS.alice, "Alice Studio");
  project = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Bakery', 'A bakery site', 10) as id", [org, USERS.alice]))[0]!.id;
  otherProject = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Secret plans', null, 10) as id", [org, USERS.alice]))[0]!.id;
  await saveFile(USERS.alice, "index.html", "<h1>Bakery</h1>", 0);
  await saveFile(USERS.alice, "notes.md", "private", 0, otherProject);
  await q("select public.app_create_task($1, $2, $3, 'Add the menu')", [org, USERS.alice, project]);
  await q("select public.app_create_task($1, $2, $3, 'Hidden task')", [org, USERS.alice, otherProject]);
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("a guest who can view", () => {
  it("reads that project's files and tasks, and nothing else in the workspace", async () => {
    const { token } = await invite("carol@example.test", "view");
    expect(await accept(token, CAROL)).toBe(project);

    const projects = await asUser<{ name: string }>(CAROL, "select name from public.projects order by name");
    expect(projects.map((p) => p.name)).toEqual(["Bakery"]);
    const files = await asUser<{ path: string }>(CAROL, "select path from public.project_files");
    expect(files.map((f) => f.path)).toEqual(["index.html"]);
    const revisions = await asUser(CAROL, "select 1 from public.project_file_revisions");
    expect(revisions).toHaveLength(1);
    const tasks = await asUser<{ title: string }>(CAROL, "select title from public.tasks");
    expect(tasks.map((t) => t.title)).toEqual(["Add the menu"]);
    const content = await asUser<{ content: string }>(CAROL, "select content from public.get_project_file($1, 'index.html')", [project]);
    expect(content[0]?.content).toBe("<h1>Bakery</h1>");
  });

  it("can't see the workspace, its people, its audit log, its usage or its other projects", async () => {
    for (const table of ["organizations", "organization_members", "audit_events", "ai_credit_ledger", "billing_accounts", "trials", "organization_invitations", "launch_orders"]) {
      expect(await asUser(CAROL, `select 1 from public.${table}`), table).toEqual([]);
    }
    expect(await asUser(CAROL, "select 1 from public.get_project_file($1, 'notes.md')", [otherProject])).toEqual([]);
  });

  it("can't change anything", async () => {
    expect(await err(saveFile(CAROL, "index.html", "<h1>Mine</h1>", 1))).toMatch(/FORBIDDEN/);
    expect(await err(q("select public.app_create_task($1, $2, $3, 'From a viewer')", [org, CAROL, project]))).toMatch(/FORBIDDEN/);
  });
});

describe("a guest who can edit", () => {
  it("saves and deletes files and writes tasks in that project only", async () => {
    const { token } = await invite("dan@example.test", "edit");
    await accept(token, DAN);
    expect((await saveFile(DAN, "index.html", "<h1>Bakery and cafe</h1>", 1))[0]!.rev).toBe(2);
    expect((await saveFile(DAN, "menu.md", "Bread", 0))[0]!.rev).toBe(1);
    await q("select public.app_delete_file($1, $2, 'menu.md', 1)", [project, DAN]);
    const task = await q<{ id: string }>("select public.app_create_task($1, $2, $3, 'Change the hours') as id", [org, DAN, project]);
    expect(task[0]!.id).toBeTruthy();

    expect(await err(saveFile(DAN, "notes.md", "edited", 1, otherProject))).toMatch(/FORBIDDEN/);
    expect(await err(q("select public.app_create_task($1, $2, $3, 'Elsewhere')", [org, DAN, otherProject]))).toMatch(/FORBIDDEN/);
  });

  it("never spends the workspace's AI, imports in bulk, approves, applies or moves a task", async () => {
    const task = (await q<{ id: string }>("select id from public.tasks where project_id = $1 and title = 'Add the menu'", [project]))[0]!.id;
    expect(await err(q("select public.app_reserve_usage($1, $2, $3, 'contract_draft', $4, 100, '{}'::jsonb)", [org, DAN, `k-${Date.now()}`, task]))).not.toBe("no error");
    expect(await err(q("select public.app_import_files($1, $2, $3::jsonb, 512000, 4194304, 52428800, 3000)", [project, DAN, JSON.stringify([{ path: "a.txt", content: "a" }])]))).toMatch(/FORBIDDEN/);
    expect(
      await err(q("select public.app_apply_task_transition($1, $2, 'user', $2::text, 'e-1', 'CONTEXT_ASSEMBLED', 'RECEIVED', 'CONTEXT_ASSEMBLED', 0)", [task, DAN])),
    ).not.toBe("no error");
    expect(await err(q("select public.app_approve_contract($1, $2, 1, $3, 0, '[]'::jsonb)", [task, DAN, "0".repeat(64)]))).not.toBe("no error");
    expect(await err(q("select public.app_archive_project($1, $2)", [project, DAN]))).toMatch(/FORBIDDEN/);
  });

  it("takes a seat, and a full workspace refuses another edit guest", async () => {
    const seats = (await db.query<{ n: number }>("select private.seats_in_use($1) as n", [org])).rows[0]!.n;
    // Alice, and Dan as an edit guest; Carol views for free.
    expect(seats).toBe(2);
    expect(await err(invite("erin@example.test", "edit", { seats: 2 }))).toMatch(/SEAT_LIMIT/);
  });
});

describe("managing guests", () => {
  it("only lets owners, admins and members who may publish invite", async () => {
    await q("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'viewer')", [org, USERS.bob]);
    expect(await err(invite("erin@example.test", "view", { actor: USERS.bob }))).toMatch(/FORBIDDEN/);
    await q("delete from public.organization_members where org_id = $1 and user_id = $2", [org, USERS.bob]);
  });

  it("refuses inviting a member, a guest twice, and an eleventh viewer", async () => {
    expect(await err(invite("alice@example.test", "view"))).toMatch(/ALREADY_MEMBER/);
    expect(await err(invite("carol@example.test", "view"))).toMatch(/ALREADY_GUEST/);
    for (let i = 0; i < 9; i++) await invite(`viewer${i}@example.test`, "view");
    expect(await err(invite("viewer-extra@example.test", "view"))).toMatch(/GUEST_LIMIT/);
  });

  it("refuses the wrong account and a closed invitation", async () => {
    const { token } = await invite("erin@example.test", "view", { project: otherProject });
    expect(await err(accept(token, CAROL))).toMatch(/WRONG_ACCOUNT/);
    expect(await accept(token, ERIN)).toBe(otherProject);
    expect(await err(accept(token, ERIN))).toMatch(/INVITATION_CLOSED/);
  });

  it("ends access at once when a guest is removed or leaves", async () => {
    await q("select public.app_remove_project_guest($1, $2, $3)", [otherProject, USERS.alice, ERIN]);
    expect(await asUser(ERIN, "select 1 from public.projects")).toEqual([]);
    await q("select public.app_remove_project_guest($1, $2, $2)", [project, CAROL]);
    expect(await asUser(CAROL, "select 1 from public.project_files")).toEqual([]);
    const events = await q<{ action: string }>("select action from public.audit_events where action like 'project_guest.%' order by occurred_at");
    expect(events.map((e) => e.action)).toEqual(["project_guest.removed", "project_guest.left"]);
  });

  it("drops guest rows when the guest joins the workspace", async () => {
    await q("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'member')", [org, DAN]);
    expect(await q("select 1 from public.project_guests where user_id = $1", [DAN])).toEqual([]);
    await q("delete from public.organization_members where org_id = $1 and user_id = $2", [org, DAN]);
  });

  it("shows the Share sheet to members only", async () => {
    const sharing = (await q<{ s: { can_share: boolean } }>("select public.app_project_sharing($1, $2) as s", [project, USERS.alice]))[0]!.s;
    expect(sharing.can_share).toBe(true);
    expect(await err(q("select public.app_project_sharing($1, $2)", [project, ERIN]))).toMatch(/NOT_FOUND/);
  });
});

describe("a read-only link", () => {
  let token = "";
  let link = "";

  it("is created by a sharer and shows current files, never history", async () => {
    token = "link-token-1";
    link = (await q<{ id: string }>("select public.app_create_share_link($1, $2, $3, $4, false) as id", [project, USERS.alice, hash(token), inDays(7)]))[0]!.id;
    const view = (await q<{ v: { state: string; files: { path: string }[]; project: { name: string } } }>("select public.app_project_for_share($1) as v", [hash(token)]))[0]!.v;
    expect(view.state).toBe("live");
    expect(view.project.name).toBe("Bakery");
    expect(view.files.map((f) => f.path)).toEqual(["index.html"]);
    const file = await q<{ content: string }>("select content from public.app_share_file($1, 'index.html')", [hash(token)]);
    expect(file[0]!.content).toBe("<h1>Bakery and cafe</h1>");
    // A deleted file is gone through the link, though its history keeps it.
    expect(await q("select 1 from public.app_share_file($1, 'menu.md')", [hash(token)])).toEqual([]);
  });

  it("says none for an unknown token", async () => {
    const view = (await q<{ v: { state: string } }>("select public.app_project_for_share($1) as v", [hash("nope")]))[0]!.v;
    expect(view).toEqual({ state: "none" });
  });

  it("stops while Farbaek has paused links, and when the project is archived", async () => {
    await db.query("update public.platform_flags set paused = true where key = 'share_links'");
    expect((await q<{ v: { state: string } }>("select public.app_project_for_share($1) as v", [hash(token)]))[0]!.v.state).toBe("paused");
    expect(await q("select 1 from public.app_share_file($1, 'index.html')", [hash(token)])).toEqual([]);
    await db.query("update public.platform_flags set paused = false where key = 'share_links'");
    await db.query("update public.projects set archived_at = now() where id = $1", [project]);
    expect((await q<{ v: { state: string } }>("select public.app_project_for_share($1) as v", [hash(token)]))[0]!.v.state).toBe("archived");
    await db.query("update public.projects set archived_at = null where id = $1", [project]);
    expect((await q<{ v: { state: string } }>("select public.app_project_for_share($1) as v", [hash(token)]))[0]!.v.state).toBe("live");
  });

  it("stops at once when turned off, and nobody else can turn it off", async () => {
    expect(await err(q("select public.app_revoke_share_link($1, $2)", [link, ERIN]))).toMatch(/FORBIDDEN/);
    await q("select public.app_revoke_share_link($1, $2)", [link, USERS.alice]);
    expect((await q<{ v: { state: string } }>("select public.app_project_for_share($1) as v", [hash(token)]))[0]!.v.state).toBe("revoked");
    expect(await q("select 1 from public.app_share_file($1, 'index.html')", [hash(token)])).toEqual([]);
  });

  it("closes when the member who made it leaves", async () => {
    await q("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'member')", [org, USERS.bob]);
    const t = "link-token-bob";
    await q("select public.app_create_share_link($1, $2, $3, null, true)", [project, USERS.bob, hash(t)]);
    expect((await q<{ v: { state: string } }>("select public.app_project_for_share($1) as v", [hash(t)]))[0]!.v.state).toBe("live");
    await q("select public.app_remove_member($1, $2, $3)", [org, USERS.alice, USERS.bob]);
    expect((await q<{ v: { state: string } }>("select public.app_project_for_share($1) as v", [hash(t)]))[0]!.v.state).toBe("revoked");
  });

  it("is never readable or callable from a browser", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      const uid = role === "anon" ? null : USERS.alice;
      expect(await err(as(db, role, uid, () => db.query("select public.app_project_for_share($1)", [hash(token)])))).toMatch(/permission denied/);
      expect(await err(as(db, role, uid, () => db.query("select public.app_create_share_link($1, $2, $3, null, false)", [project, USERS.alice, hash("x")])))).toMatch(/permission denied/);
    }
    expect(await err(as(db, "authenticated", USERS.alice, () => db.query("select token_sha256 from public.project_share_links")))).toMatch(/permission denied/);
  });
});

describe("what the review asked for", () => {
  const GINA = "00000000-0000-4000-8000-00000000a6e1";
  const HANK = "00000000-0000-4000-8000-00000000a6e2";
  let third: string;

  beforeAll(async () => {
    await db.query("insert into auth.users (id, email, email_confirmed_at) values ($1, 'gina@example.test', now()), ($2, 'hank@example.test', now())", [GINA, HANK]);
    third = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Third', null, 10) as id", [org, USERS.alice]))[0]!.id;
  });

  it("counts a seat once per person, so an editor asked to edit a second project needs none", async () => {
    const first = await invite("hank@example.test", "edit", { seats: null });
    await accept(first.token, HANK, null);
    const before = (await db.query<{ n: number }>("select private.seats_in_use($1) as n", [org])).rows[0]!.n;
    // Hank edits Bakery; asking him to edit Third too is allowed even at a full plan.
    const { token } = await invite("hank@example.test", "edit", { project: third, seats: before });
    await accept(token, HANK, before);
    expect((await db.query<{ n: number }>("select private.seats_in_use($1) as n", [org])).rows[0]!.n).toBe(before);
  });

  it("lets access be closed in a suspended workspace, and lets nobody new in", async () => {
    const open = await invite("gina@example.test", "view", { project: third });
    await db.query("update public.organizations set suspended_at = now(), suspended_notice = 'Paused while we check a payment.' where id = $1", [org]);
    try {
      expect(await err(invite("someone@example.test", "view", { project: third }))).toMatch(/WORKSPACE_SUSPENDED/);
      expect(await err(accept(open.token, GINA))).toMatch(/WORKSPACE_SUSPENDED/);
      await q("select public.app_set_project_guest_access($1, $2, $3, 'view', 10)", [third, USERS.alice, HANK]);
      expect(await err(q("select public.app_set_project_guest_access($1, $2, $3, 'edit', 10)", [third, USERS.alice, HANK]))).toMatch(/WORKSPACE_SUSPENDED/);
      await q("select public.app_remove_project_guest($1, $2, $3)", [third, USERS.alice, HANK]);
      await q("select public.app_revoke_project_invitation($1, $2)", [open.id, USERS.alice]);
    } finally {
      await db.query("update public.organizations set suspended_at = null, suspended_notice = null where id = $1", [org]);
    }
  });

  it("closes a member's links and invitations when they may no longer share", async () => {
    await q("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'member')", [org, ERIN]);
    const t = "link-token-erin";
    await q("select public.app_create_share_link($1, $2, $3, null, false)", [third, ERIN, hash(t)]);
    const pending = await invite("gina@example.test", "view", { project: third, actor: ERIN });
    await q("update public.organization_members set role = 'viewer' where org_id = $1 and user_id = $2", [org, ERIN]);
    expect((await q<{ v: { state: string } }>("select public.app_project_for_share($1) as v", [hash(t)]))[0]!.v.state).toBe("revoked");
    expect(await err(accept(pending.token, GINA))).toMatch(/INVITATION_CLOSED/);
  });

  it("gives a download every current file in one read, only when the link allows it", async () => {
    await saveFile(USERS.alice, "a.md", "A", 0, third);
    await saveFile(USERS.alice, "b.md", "B", 0, third);
    const yes = "link-download-yes";
    const no = "link-download-no";
    await q("select public.app_create_share_link($1, $2, $3, null, true)", [third, USERS.alice, hash(yes)]);
    await q("select public.app_create_share_link($1, $2, $3, null, false)", [third, USERS.alice, hash(no)]);
    expect((await q<{ path: string }>("select path from public.app_share_files($1)", [hash(yes)])).map((r) => r.path)).toEqual(["a.md", "b.md"]);
    expect(await q("select 1 from public.app_share_files($1)", [hash(no)])).toEqual([]);
  });
});
