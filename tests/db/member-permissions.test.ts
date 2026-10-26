/**
 * Migration v55: permissions per person (ADR 0087). Owners and admins turn
 * approving, publishing and starting agent runs off for a member; the
 * database refuses each through the row that records who acted.
 */
import { createHash } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let project: string;
let site: string;

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const asUser = <T = Record<string, unknown>>(uid: string, sql: string, params: unknown[] = []) => as(db, "authenticated", uid, async () => (await db.query<T>(sql, params)).rows);
const admin = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const H = (c: string) => c.repeat(64);
const DAY = 86_400_000;
const LIMITS = [1024 * 512, 25 * 1024 * 1024, 3000];

let seq = 0;
const step = (from: string, to: string, type: string, actor_kind?: "agent" | "system") => ({ event_id: `mp-${++seq}`, event_type: type, from, to, ...(actor_kind ? { actor_kind, actor_id: "farbaek" } : {}) });
const version = async (task: string) => (await admin<{ version: number }>("select version from public.tasks where id = $1", [task]))[0]!.version;
const latest = async () => (await admin<{ digest: string }>("select digest from public.proofpacks where project_id = $1 order by seq desc limit 1", [project]))[0]?.digest ?? null;
const setPermissions = (actor: string, user: string, permissions: Record<string, unknown>) =>
  q<{ p: Record<string, boolean> }>("select public.app_set_member_permissions($1, $2, $3, $4) as p", [org, actor, user, JSON.stringify(permissions)]).then((r) => r[0]!.p);
const stored = async (user: string) => (await admin<{ permissions: Record<string, boolean> }>("select permissions from public.organization_members where org_id = $1 and user_id = $2", [org, user]))[0]!.permissions;

/** A task of Alice's with an approved contract. */
async function approvedTask(title: string) {
  const task = (await q<{ id: string }>("select public.app_create_task($1, $2, $3, $4) as id", [org, USERS.alice, project, title]))[0]!.id;
  await q("select public.app_save_contract($1, $2, $3, $4, 0, 0, $5)", [task, USERS.alice, JSON.stringify({ schema: "farbaek.intent-contract/v1", version: 1 }), H("c"), JSON.stringify([step("RECEIVED", "CONTEXT_ASSEMBLED", "assemble_context"), step("CONTEXT_ASSEMBLED", "CONTRACT_DRAFTED", "draft_contract")])]);
  await q("select public.app_approve_contract($1, $2, 1, $3, 2, $4)", [task, USERS.alice, H("c"), JSON.stringify([step("CONTRACT_DRAFTED", "CONTRACT_APPROVED", "approve_contract")])]);
  return task;
}

/** A pending proposal on a new task of Alice's. */
async function proposal(title: string, outcome: "REQUIRE_APPROVAL" | "ALLOW_WITHIN_LIMITS" = "REQUIRE_APPROVAL") {
  const task = await approvedTask(title);
  const path = `docs/${title.replace(/\W+/g, "-").toLowerCase()}.md`;
  const content = `# ${title}\n`;
  const id = (
    await q<{ id: string }>("select public.app_create_proposal($1, $2, 1, $3, $4, '[]', '[]', $5, 'm', 1, 1, $6, $7, $8, 1000, $9, $10) as id", [
      task,
      USERS.alice,
      JSON.stringify({ summary: "s", steps: [], risks: [], checks: [] }),
      JSON.stringify([{ path, kind: "create", base_revision: 0, content, sha256: sha(content), reason: "r" }]),
      H("b"),
      await version(task),
      JSON.stringify([step("CONTRACT_APPROVED", "PLAN_PROPOSED", "propose_plan", "agent"), step("PLAN_PROPOSED", "POLICY_EVALUATED", "evaluate_policy", "system"), step("POLICY_EVALUATED", "APPROVAL_PENDING", "require_approval", "system")]),
      JSON.stringify({ outcome, version: H("e"), findings: [] }),
      new Date(Date.now() - DAY).toISOString(),
      new Date(Date.now() + DAY).toISOString(),
    ])
  )[0]!.id;
  return { task, id, path, content, byPolicy: outcome === "ALLOW_WITHIN_LIMITS" };
}

async function apply(p: Awaited<ReturnType<typeof proposal>>, actor: string) {
  const pack = { _type: "https://in-toto.io/Statement/v1", subject: [{ name: p.path, digest: { sha256: sha(p.content) } }], predicateType: "https://farbaek.dev/proofpack/v1", predicate: { status: "unverified", proposal: { id: p.id }, approval: { appliedSha256: H("a"), ...(p.byPolicy ? { by: "policy", autonomyLevel: 2 } : {}) }, previous: await latest(), nonce: ++seq } };
  return q("select public.app_apply_proposal($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'unverified')", [
    p.id,
    actor,
    JSON.stringify([{ path: p.path, content: p.content }]),
    H("a"),
    await version(p.task),
    JSON.stringify([step("APPROVAL_PENDING", "EXECUTION_AUTHORIZED", "grant_approval", p.byPolicy ? "system" : undefined), step("EXECUTION_AUTHORIZED", "EXECUTING", "start_execution", "system"), step("EXECUTING", "VERIFYING", "begin_verification", "system")]),
    ...LIMITS,
    JSON.stringify(pack),
    sha(JSON.stringify(pack)),
  ]);
}

const launch = (actor: string) =>
  admin("insert into public.launch_orders (org_id, project_id, provider, idempotency_key, target_name, account_name, files_digest, file_count, total_bytes, evidence, override_reason, authorized_by) values ($1, $2, 'vercel', $3, 'storefront', 'suvin', $4, 1, 10, 'none', 'A test launch.', $5)", [
    org,
    project,
    crypto.randomUUID(),
    H("d"),
    actor,
  ]);
const deploy = (actor: string) =>
  admin("insert into public.site_deployments (org_id, site_id, project_id, number, files, file_count, total_bytes, digest, created_by) values ($1, $2, $3, (select coalesce(max(number), 0) + 1 from public.site_deployments where site_id = $2), $4, 1, 10, $5, $6)", [
    org,
    site,
    project,
    JSON.stringify([{ path: "index.html", revision: 1, sha256: H("f"), size: 10 }]),
    H("d"),
    actor,
  ]);

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  await createOrg(db, USERS.bob, "Bob Labs");
  await admin("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'member')", [org, USERS.bob]);
  project = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Storefront', null, null) as id", [org, USERS.alice]))[0]!.id;
  await q("select public.app_import_files($1, $2, $3, 524288, 4194304, 26214400, 3000)", [project, USERS.alice, JSON.stringify([{ path: "index.html", content: "<h1>Storefront</h1>" }])]);
  const report = (await q<{ id: string }>("select public.app_start_security_report($1, $2, $3) as id", [org, USERS.alice, project]))[0]!.id;
  await q("select public.app_finish_security_report($1, 'done', 90, 'A', $2, $3, $4, null)", [
    report,
    JSON.stringify({ critical: 0, high: 0, medium: 0, low: 0, info: 0 }),
    JSON.stringify({ predicateType: "https://farbaek.dev/security-report/v1", predicate: {} }),
    H("c"),
  ]);
  const files = await admin("select path, revision, sha256, size_bytes as size from public.project_files where project_id = $1 order by path", [project]);
  await q("select public.app_publish_site($1, $2, $3, 'storefront-site', $4, $5, $6, $7)", [org, USERS.alice, project, JSON.stringify(files), H("d"), report, "No agent changes in this project yet."]);
  site = (await admin<{ id: string }>("select id from public.sites where name = 'storefront-site'"))[0]!.id;
}, 90_000);

afterAll(async () => {
  await db.close();
});

describe("setting permissions", () => {
  it("is for owners and admins, only for members, and audited", async () => {
    await expect(setPermissions(USERS.bob, USERS.bob, { approve: true })).rejects.toThrow(/FORBIDDEN/);
    await expect(setPermissions(USERS.alice, USERS.alice, { approve: false })).rejects.toThrow(/INVALID_PERMISSIONS/);
    await expect(setPermissions(USERS.alice, USERS.bob, { deploy: false })).rejects.toThrow(/INVALID_PERMISSIONS/);
    await expect(setPermissions(USERS.alice, USERS.bob, { approve: "no" })).rejects.toThrow(/INVALID_PERMISSIONS/);
    await expect(setPermissions(USERS.alice, USERS.unverified, { approve: false })).rejects.toThrow(/NOT_FOUND/);

    expect(await setPermissions(USERS.alice, USERS.bob, { approve: false, publish: true })).toEqual({ approve: false });
    // A key left out keeps its value; true turns one back on.
    expect(await setPermissions(USERS.alice, USERS.bob, { run_agents: false })).toEqual({ approve: false, run_agents: false });
    expect(await setPermissions(USERS.alice, USERS.bob, { run_agents: true })).toEqual({ approve: false });
    const events = await admin<{ metadata: { from: object; to: object } }>("select metadata from public.audit_events where org_id = $1 and action = 'member.permissions_changed' order by id", [org]);
    expect(events.map((e) => e.metadata.to)).toEqual([{ approve: false }, { approve: false, run_agents: false }, { approve: false }]);
    // Saving the same thing again changes and records nothing.
    await setPermissions(USERS.alice, USERS.bob, { approve: false });
    expect(await admin("select 1 from public.audit_events where org_id = $1 and action = 'member.permissions_changed'", [org])).toHaveLength(3);
  });

  it("keeps browsers out, while members read them", async () => {
    await expect(asUser(USERS.alice, "select public.app_set_member_permissions($1, $2, $3, '{}')", [org, USERS.alice, USERS.bob])).rejects.toThrow(/permission denied/);
    await expect(asUser(USERS.alice, "update public.organization_members set permissions = '{}' where org_id = $1", [org])).rejects.toThrow(/permission denied/);
    expect(await asUser(USERS.bob, "select permissions from public.organization_members where org_id = $1 and user_id = $2", [org, USERS.bob])).toEqual([{ permissions: { approve: false } }]);
    // Only withheld permissions can be stored, whoever writes.
    await expect(admin("update public.organization_members set permissions = '{\"approve\": true}' where org_id = $1 and user_id = $2", [org, USERS.bob])).rejects.toThrow(/check/);
  });

  it("starts a changed role from that role's defaults", async () => {
    await q("select public.app_set_member_role($1, $2, $3, 'admin')", [org, USERS.alice, USERS.bob]);
    expect(await stored(USERS.bob)).toEqual({});
    await q("select public.app_set_member_role($1, $2, $3, 'member')", [org, USERS.alice, USERS.bob]);
    expect(await stored(USERS.bob)).toEqual({});
  });
});

describe("approving changes", () => {
  it("refuses a person's approval from a member without it, theirs or anyone's", async () => {
    await setPermissions(USERS.alice, USERS.bob, { approve: false });
    const p = await proposal("Withheld approval");
    await expect(apply(p, USERS.bob)).rejects.toThrow(/PERMISSION_WITHHELD/);
    await apply(p, USERS.alice);
    await setPermissions(USERS.alice, USERS.bob, { approve: true });
    await apply(await proposal("Approval back on"), USERS.bob);
  });

  it("still lets a change the workspace's autonomy allowed apply under its limits", async () => {
    await setPermissions(USERS.alice, USERS.bob, { approve: false });
    await q("select public.app_set_autonomy($1, $2, 2, 3, true)", [org, USERS.alice]);
    try {
      await apply(await proposal("Within limits", "ALLOW_WITHIN_LIMITS"), USERS.bob);
    } finally {
      await q("select public.app_set_autonomy($1, $2, 0, 3, true)", [org, USERS.alice]);
      await setPermissions(USERS.alice, USERS.bob, { approve: true });
    }
  });

  it("refuses viewers, who never approve", async () => {
    await admin("update public.organization_members set role = 'viewer' where org_id = $1 and user_id = $2", [org, USERS.bob]);
    try {
      const allowed = await admin<{ ok: boolean }>("select private.member_may($1, $2, 'approve') as ok", [org, USERS.bob]);
      expect(allowed[0]!.ok).toBe(false);
    } finally {
      await admin("update public.organization_members set role = 'member' where org_id = $1 and user_id = $2", [org, USERS.bob]);
    }
  });
});

describe("publishing and launching", () => {
  it("refuses a deployment, a launch, a rollback or taking a site offline without it", async () => {
    await setPermissions(USERS.alice, USERS.bob, { publish: false });
    await expect(deploy(USERS.bob)).rejects.toThrow(/PERMISSION_WITHHELD/);
    await expect(launch(USERS.bob)).rejects.toThrow(/PERMISSION_WITHHELD/);
    await expect(q("select public.app_set_live_deployment($1, $2, $3, null)", [org, USERS.bob, site])).rejects.toThrow(/PERMISSION_WITHHELD/);
    await deploy(USERS.alice);
    await setPermissions(USERS.alice, USERS.bob, { publish: true });
    await deploy(USERS.bob);
    await launch(USERS.bob);
    await q("select public.app_set_live_deployment($1, $2, $3, null)", [org, USERS.bob, site]);
  });
});

describe("starting agent runs", () => {
  it("refuses an agent run or an arena run without it", async () => {
    const p = await proposal("Agent work");
    await setPermissions(USERS.alice, USERS.bob, { run_agents: false });
    const task = await approvedTask("Agent run");
    const run = () => q("select public.app_start_agent_run($1, $2, $3, 'balanced', 'sandboxed', 1, $4)", [org, USERS.bob, task, H("c")]);
    await expect(run()).rejects.toThrow(/PERMISSION_WITHHELD/);
    await expect(q("select public.app_start_arena_run($1, $2, $3)", [org, USERS.bob, p.id])).rejects.toThrow(/PERMISSION_WITHHELD/);
    await setPermissions(USERS.alice, USERS.bob, { run_agents: true });
    await expect(q("select public.app_start_arena_run($1, $2, $3)", [org, USERS.bob, p.id])).resolves.toHaveLength(1);
    await expect(run()).resolves.toHaveLength(1);
  });
});
