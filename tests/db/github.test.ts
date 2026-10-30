/**
 * Migration v77: GitHub pull requests (ADR 0126). Owners and admins connect
 * the token and link repositories; contributors record a pull request for an
 * applied change, one per change; members read it all but never the sealed
 * token; only the server writes; each change is audited without the token.
 */
import { createHash } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let otherOrg: string;
let project: string;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const admin = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const H = (c: string) => c.repeat(64);
const SEALED = `v1.k1.${"A".repeat(60)}`;
const COMMIT = "a".repeat(40);

let seq = 0;
const step = (from: string, to: string, type: string, actor_kind?: "agent" | "system") => ({ event_id: `g-${++seq}`, event_type: type, from, to, ...(actor_kind ? { actor_kind, actor_id: "farbaek" } : {}) });
const version = async (task: string) => (await admin<{ version: number }>("select version from public.tasks where id = $1", [task]))[0]!.version;

/** A task with one proposal; "applied" marks it applied directly, as the apply function's result would. */
async function proposal(applied: boolean): Promise<{ task: string; proposal: string }> {
  const task = (await q<{ id: string }>("select public.app_create_task($1, $2, $3, $4) as id", [org, USERS.alice, project, `Task ${++seq}`]))[0]!.id;
  const body = JSON.stringify({ schema: "farbaek.intent-contract/v1", version: 1 });
  await q("select public.app_save_contract($1, $2, $3, $4, 0, 0, $5)", [task, USERS.alice, body, H("c"), JSON.stringify([step("RECEIVED", "CONTEXT_ASSEMBLED", "assemble_context"), step("CONTEXT_ASSEMBLED", "CONTRACT_DRAFTED", "draft_contract")])]);
  await q("select public.app_approve_contract($1, $2, 1, $3, 2, $4)", [task, USERS.alice, H("c"), JSON.stringify([step("CONTRACT_DRAFTED", "CONTRACT_APPROVED", "approve_contract")])]);
  const base = (await admin<{ revision: number }>("select revision from public.project_files where project_id = $1 and path = 'src/cart.ts'", [project]))[0]!.revision;
  const content = `export const max = ${++seq};\n`;
  const id = (
    await q<{ id: string }>("select public.app_create_proposal($1, $2, 1, $3, $4, '[]', '[]', $5, 'claude-opus-5-5', 100, 50, $6, $7, $8, 1000, $9, $10) as id", [
      task,
      USERS.alice,
      JSON.stringify({ summary: "s", steps: [], risks: [], checks: [] }),
      JSON.stringify([{ path: "src/cart.ts", kind: "edit", base_revision: base, content, sha256: sha(content), reason: "r" }]),
      H("b"),
      await version(task),
      JSON.stringify([step("CONTRACT_APPROVED", "PLAN_PROPOSED", "propose_plan", "agent"), step("PLAN_PROPOSED", "POLICY_EVALUATED", "evaluate_policy", "system"), step("POLICY_EVALUATED", "APPROVAL_PENDING", "require_approval", "system")]),
      JSON.stringify({ outcome: "REQUIRE_APPROVAL", version: H("e"), findings: [] }),
      new Date(Date.now() - 86_400_000).toISOString(),
      new Date(Date.now() + 86_400_000).toISOString(),
    ])
  )[0]!.id;
  if (applied) await admin("update public.change_proposals set status = 'applied', decided_at = now(), decided_by = $3, applied_sha256 = $2 where id = $1", [id, H("d"), USERS.alice]);
  return { task, proposal: id };
}

const recordPull = (proposalId: string, actor: string, number = 7, orgId = org) =>
  q<{ id: string }>("select public.app_record_github_pull_request($1, $2, $3, 'alice/shop', $4, $5, 'farbaek/fix-cart-1234abcd', 'main', $6) as id", [orgId, actor, proposalId, number, `https://github.com/alice/shop/pull/${number}`, COMMIT]);

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  otherOrg = await createOrg(db, USERS.bob, "Bob Labs");
  project = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Storefront', null, null) as id", [org, USERS.alice]))[0]!.id;
  await q("select public.app_import_files($1, $2, $3, 524288, 4194304, 26214400, 3000)", [project, USERS.alice, JSON.stringify([{ path: "src/cart.ts", content: "export const max = 1;\n" }])]);
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("the workspace's GitHub token", () => {
  it("lets an owner connect and replace it, recording each change without the token", async () => {
    await q("select public.app_set_github_token($1, $2, $3, 'alice', 'ab12', null)", [org, USERS.alice, SEALED]);
    await q("select public.app_set_github_token($1, $2, $3, 'alice', 'cd34', '2027-01-30T00:00:00Z')", [org, USERS.alice, SEALED]);
    expect(await admin("select login, token_hint, last_used_at from public.workspace_github where org_id = $1", [org])).toEqual([{ login: "alice", token_hint: "cd34", last_used_at: null }]);
    const events = await admin<{ metadata: Record<string, unknown> }>("select metadata from public.audit_events where org_id = $1 and action = 'workspace.github_connected' order by id", [org]);
    expect(events.map((e) => e.metadata.token_ends)).toEqual(["ab12", "cd34"]);
    expect(JSON.stringify(events)).not.toContain(SEALED);
  });

  it("refuses members, viewers and other workspaces, and keeps a plain token out of the table", async () => {
    await expect(q("select public.app_set_github_token($1, $2, $3, 'bob', 'ab12', null)", [org, USERS.bob, SEALED])).rejects.toThrow(/FORBIDDEN/);
    for (const role of ["member", "viewer"]) {
      await admin("insert into public.organization_members (org_id, user_id, role) values ($1, $2, $3) on conflict (org_id, user_id) do update set role = excluded.role", [org, USERS.bob, role]);
      await expect(q("select public.app_set_github_token($1, $2, $3, 'bob', 'ab12', null)", [org, USERS.bob, SEALED])).rejects.toThrow(/FORBIDDEN/);
      await expect(q("select public.app_remove_github_token($1, $2)", [org, USERS.bob])).rejects.toThrow(/FORBIDDEN/);
    }
    await admin("delete from public.organization_members where org_id = $1 and user_id = $2", [org, USERS.bob]);
    await expect(q("select public.app_set_github_token($1, $2, 'github_pat_plain', 'alice', 'ab12', null)", [org, USERS.alice])).rejects.toThrow(/token_sealed/);
    await expect(q("select public.app_set_github_token($1, $2, $3, 'alice', 'too-long', null)", [org, USERS.alice, SEALED])).rejects.toThrow(/token_hint/);
  });

  it("disconnects, records that, and says when there's nothing to disconnect", async () => {
    await q("select public.app_set_github_token($1, $2, $3, 'bob', 'ab12', null)", [otherOrg, USERS.bob, SEALED]);
    await q("select public.app_remove_github_token($1, $2)", [otherOrg, USERS.bob]);
    expect(await admin("select 1 from public.workspace_github where org_id = $1", [otherOrg])).toEqual([]);
    expect(await admin("select 1 from public.audit_events where org_id = $1 and action = 'workspace.github_disconnected'", [otherOrg])).toHaveLength(1);
    await expect(q("select public.app_remove_github_token($1, $2)", [otherOrg, USERS.bob])).rejects.toThrow(/NOT_FOUND/);
  });
});

describe("a project's repository", () => {
  const link = (actor: string, projectId = project, orgId = org) => q("select public.app_link_github_repo($1, $2, $3, 'alice', 'shop', 42, 'main')", [orgId, actor, projectId]);

  it("is linked and replaced by owners and admins, audited, and refused for anyone else", async () => {
    await link(USERS.alice);
    await q("select public.app_link_github_repo($1, $2, $3, 'alice', 'shop', 42, 'trunk')", [org, USERS.alice, project]);
    expect(await admin("select owner, repo, repo_id, default_branch from public.project_github_repos where project_id = $1", [project])).toEqual([{ owner: "alice", repo: "shop", repo_id: 42, default_branch: "trunk" }]);
    expect(await admin("select metadata from public.audit_events where org_id = $1 and action = 'project.github_linked'", [org])).toHaveLength(2);
    await expect(link(USERS.bob)).rejects.toThrow(/FORBIDDEN/);
    // Another workspace's owner can't link this workspace's project through their own.
    await expect(link(USERS.bob, project, otherOrg)).rejects.toThrow(/NOT_FOUND/);
  });

  it("keeps bad names out, refuses an archived project, and unlinks", async () => {
    await expect(q("select public.app_link_github_repo($1, $2, $3, '-bad', 'shop', 42, 'main')", [org, USERS.alice, project])).rejects.toThrow(/owner_check/);
    await expect(q("select public.app_link_github_repo($1, $2, $3, 'alice', 'shop', 42, 'a b')", [org, USERS.alice, project])).rejects.toThrow(/default_branch_check/);
    const archived = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Old', null, null) as id", [org, USERS.alice]))[0]!.id;
    await admin("update public.projects set archived_at = now() where id = $1", [archived]);
    await expect(link(USERS.alice, archived)).rejects.toThrow(/PROJECT_ARCHIVED/);
    const spare = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Spare', null, null) as id", [org, USERS.alice]))[0]!.id;
    await link(USERS.alice, spare);
    await q("select public.app_unlink_github_repo($1, $2, $3)", [org, USERS.alice, spare]);
    await expect(q("select public.app_unlink_github_repo($1, $2, $3)", [org, USERS.alice, spare])).rejects.toThrow(/NOT_FOUND/);
    expect(await admin("select 1 from public.audit_events where org_id = $1 and action = 'project.github_unlinked'", [org])).toHaveLength(1);
  });
});

describe("pull requests", () => {
  it("records one per applied change, for contributors, and its status", async () => {
    const { task, proposal: p } = await proposal(true);
    const [row] = await recordPull(p, USERS.alice);
    expect(row!.id).toMatch(/^[0-9a-f-]{36}$/);
    await expect(recordPull(p, USERS.alice, 8)).rejects.toThrow(/github_pull_requests_proposal_id_key|duplicate/);
    expect(await admin("select task_id, number, status_state from public.github_pull_requests where proposal_id = $1", [p])).toEqual([{ task_id: task, number: 7, status_state: null }]);
    await q("select public.app_record_github_status($1, $2, 'success')", [org, p]);
    expect((await admin<{ status_state: string }>("select status_state from public.github_pull_requests where proposal_id = $1", [p]))[0]!.status_state).toBe("success");
    await expect(q("select public.app_record_github_status($1, $2, 'green')", [org, p])).rejects.toThrow(/status_state/);
    expect(await admin("select metadata from public.audit_events where org_id = $1 and action = 'task.pull_request_opened'", [org])).toEqual([{ metadata: { repository: "alice/shop", number: 7, commit: COMMIT } }]);
  });

  it("refuses a change that isn't applied, viewers, outsiders, and anything but a github.com pull request", async () => {
    const pending = await proposal(false);
    await expect(recordPull(pending.proposal, USERS.alice)).rejects.toThrow(/PROPOSAL_NOT_APPLIED/);
    const { proposal: p } = await proposal(true);
    await expect(recordPull(p, USERS.bob)).rejects.toThrow(/FORBIDDEN/);
    await expect(recordPull(p, USERS.bob, 7, otherOrg)).rejects.toThrow(/NOT_FOUND/);
    await admin("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'viewer') on conflict (org_id, user_id) do update set role = excluded.role", [org, USERS.bob]);
    await expect(recordPull(p, USERS.bob)).rejects.toThrow(/FORBIDDEN/);
    await admin("update public.organization_members set role = 'member' where org_id = $1 and user_id = $2", [org, USERS.bob]);
    await expect(
      q("select public.app_record_github_pull_request($1, $2, $3, 'alice/shop', 9, 'https://evil.example/alice/shop/pull/9', 'farbaek/x-1', 'main', $4)", [org, USERS.bob, p, COMMIT]),
    ).rejects.toThrow(/url_check/);
    // A member whose publishing is withheld can't open one.
    await admin("update public.organization_members set permissions = '{\"publish\": false}' where org_id = $1 and user_id = $2", [org, USERS.bob]);
    await expect(recordPull(p, USERS.bob, 9)).rejects.toThrow(/PERMISSION_WITHHELD/);
    await admin("update public.organization_members set permissions = '{}' where org_id = $1 and user_id = $2", [org, USERS.bob]);
    await expect(recordPull(p, USERS.bob, 9)).resolves.toHaveLength(1);
    await admin("delete from public.organization_members where org_id = $1 and user_id = $2", [org, USERS.bob]);
  });
});

describe("who can see and change it", () => {
  it("shows members the connection, links and pull requests but never the sealed token, and lets only the server write", async () => {
    const asAlice = <T>(fn: () => Promise<T>) => as(db, "authenticated", USERS.alice, fn);
    expect(await asAlice(async () => (await db.query("select login, token_hint from public.workspace_github where org_id = $1", [org])).rows)).toEqual([{ login: "alice", token_hint: "cd34" }]);
    await expect(asAlice(() => db.query("select token_sealed from public.workspace_github"))).rejects.toThrow(/permission denied/);
    await expect(asAlice(() => db.query("update public.project_github_repos set repo = 'other'"))).rejects.toThrow(/permission denied/);
    await expect(asAlice(() => db.query("insert into public.github_pull_requests (org_id) values ($1)", [org]))).rejects.toThrow(/permission denied/);
    await expect(asAlice(() => db.query("select public.app_link_github_repo($1, $2, $3, 'alice', 'shop', 42, 'main')", [org, USERS.alice, project]))).rejects.toThrow(/permission denied/);
    await expect(as(db, "anon", null, () => db.query("select public.app_record_github_status($1, $2, 'success')", [org, project]))).rejects.toThrow(/permission denied/);
    expect((await asAlice(async () => (await db.query("select number from public.github_pull_requests where org_id = $1", [org])).rows)).length).toBeGreaterThan(0);
    // Bob isn't in Alice's workspace and sees none of it.
    const asBob = <T>(fn: () => Promise<T>) => as(db, "authenticated", USERS.bob, fn);
    expect(await asBob(async () => (await db.query("select 1 from public.workspace_github where org_id = $1", [org])).rows)).toEqual([]);
    expect(await asBob(async () => (await db.query("select 1 from public.project_github_repos where org_id = $1", [org])).rows)).toEqual([]);
    expect(await asBob(async () => (await db.query("select 1 from public.github_pull_requests where org_id = $1", [org])).rows)).toEqual([]);
  });
});
