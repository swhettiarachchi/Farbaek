/**
 * Migration 31: autonomy level 2. Only owners and admins turn it on; no
 * proposal is "allowed within limits" while it's off; a change applied on
 * its own that fails its checks switches it off with a reason.
 */
import { createHash } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let project: string;

const asService = <T>(fn: () => Promise<T>) => as(db, "service_role", null, fn);
const asUser = <T>(uid: string, fn: () => Promise<T>) => as(db, "authenticated", uid, fn);
const admin = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => asService(async () => (await db.query<T>(sql, params)).rows);
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const H = (c: string) => c.repeat(64);
const LIMITS = [1024 * 512, 25 * 1024 * 1024, 3000];

let seq = 0;
const step = (from: string, to: string, type: string, actor_kind?: "agent" | "system") => ({ event_id: `e-${++seq}`, event_type: type, from, to, ...(actor_kind ? { actor_kind, actor_id: "farbaek" } : {}) });
const version = async (task: string) => (await admin<{ version: number }>("select version from public.tasks where id = $1", [task]))[0]!.version;
const setAutonomy = (actor: string, level: number, maxFiles = 3, creates = false) => q("select public.app_set_autonomy($1, $2, $3, $4, $5)", [org, actor, level, maxFiles, creates]);
const autonomy = async () => (await admin<{ level: number; suspended_at: string | null; suspended_reason: string | null }>("select level, suspended_at, suspended_reason from public.org_autonomy where org_id = $1", [org]))[0];

async function approvedTask(title: string): Promise<string> {
  const id = (await q<{ id: string }>("select public.app_create_task($1, $2, $3, $4) as id", [org, USERS.alice, project, title]))[0]!.id;
  const body = JSON.stringify({ schema: "farbaek.intent-contract/v1", version: 1 });
  await q("select public.app_save_contract($1, $2, $3, $4, 0, 0, $5)", [id, USERS.alice, body, H("c"), JSON.stringify([step("RECEIVED", "CONTEXT_ASSEMBLED", "assemble_context"), step("CONTEXT_ASSEMBLED", "CONTRACT_DRAFTED", "draft_contract")])]);
  await q("select public.app_approve_contract($1, $2, 1, $3, 2, $4)", [id, USERS.alice, H("c"), JSON.stringify([step("CONTRACT_DRAFTED", "CONTRACT_APPROVED", "approve_contract")])]);
  return id;
}

async function propose(task: string, outcome: string, content: string) {
  const base = (await admin<{ revision: number }>("select revision from public.project_files where project_id = $1 and path = 'src/cart.ts'", [project]))[0]!.revision;
  const change = { path: "src/cart.ts", kind: "edit", base_revision: base, content, sha256: sha(content), reason: "r" };
  return (
    await q<{ id: string }>("select public.app_create_proposal($1, $2, 1, $3, $4, '[]', '[]', $5, 'm', 1, 1, $6, $7, $8, 1000, $9, $10) as id", [
      task,
      USERS.alice,
      JSON.stringify({ summary: "s", steps: [], risks: [], checks: [] }),
      JSON.stringify([change]),
      H("b"),
      await version(task),
      JSON.stringify([step("CONTRACT_APPROVED", "PLAN_PROPOSED", "propose_plan", "agent"), step("PLAN_PROPOSED", "POLICY_EVALUATED", "evaluate_policy", "system"), step("POLICY_EVALUATED", "APPROVAL_PENDING", "require_approval", "system")]),
      JSON.stringify({ outcome, version: H("e"), findings: [] }),
      new Date(Date.now() - 86_400_000).toISOString(),
      new Date(Date.now() + 86_400_000).toISOString(),
    ])
  )[0]!.id;
}

const latest = async () => (await admin<{ digest: string }>("select digest from public.proofpacks where project_id = $1 order by seq desc limit 1", [project]))[0]?.digest ?? null;

/** Applies the proposal with a ProofPack whose approval names a person or the policy. */
async function apply(task: string, proposal: string, content: string, by: "person" | "policy") {
  const statement = {
    _type: "https://in-toto.io/Statement/v1",
    subject: [{ name: "src/cart.ts", digest: { sha256: sha(content) } }],
    predicateType: "https://farbaek.dev/proofpack/v1",
    predicate: { status: "unverified", proposal: { id: proposal }, approval: { appliedSha256: H("a"), ...(by === "policy" ? { by: "policy", autonomyLevel: 2 } : {}) }, previous: await latest(), nonce: ++seq },
  };
  await q("select public.app_apply_proposal($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)", [
    proposal,
    USERS.alice,
    JSON.stringify([{ path: "src/cart.ts", content }]),
    H("a"),
    await version(task),
    JSON.stringify([step("APPROVAL_PENDING", "EXECUTION_AUTHORIZED", "grant_approval", by === "policy" ? "system" : undefined), step("EXECUTION_AUTHORIZED", "EXECUTING", "start_execution", "system"), step("EXECUTING", "VERIFYING", "begin_verification", "system")]),
    ...LIMITS,
    JSON.stringify(statement),
    sha(JSON.stringify(statement)),
    "unverified",
  ]);
}

/** A failed verification ProofPack for the proposal, as the check run records it. */
async function failChecks(task: string, proposal: string) {
  const statement = { _type: "https://in-toto.io/Statement/v1", predicate: { status: "failed", proposal: { id: proposal }, nonce: ++seq } };
  await admin("insert into public.proofpacks (digest, org_id, project_id, task_id, proposal_id, status, statement, previous) values ($1, $2, $3, $4, $5, 'failed', $6, $7)", [
    sha(JSON.stringify(statement)),
    org,
    project,
    task,
    proposal,
    JSON.stringify(statement),
    await latest(),
  ]);
}

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  await createOrg(db, USERS.bob, "Bob Labs");
  project = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Storefront', null, null) as id", [org, USERS.alice]))[0]!.id;
  await q("select public.app_import_files($1, $2, $3, 524288, 4194304, 26214400, 3000)", [project, USERS.alice, JSON.stringify([{ path: "src/cart.ts", content: "export const max = 1;\n" }])]);
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("setting autonomy", () => {
  it("is for owners and admins, checks its limits, and is recorded", async () => {
    await admin("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'member')", [org, USERS.bob]);
    await expect(setAutonomy(USERS.bob, 2)).rejects.toThrow(/FORBIDDEN/);
    await expect(setAutonomy(USERS.alice, 1)).rejects.toThrow(/INVALID_AUTONOMY/);
    await expect(setAutonomy(USERS.alice, 2, 9)).rejects.toThrow(/INVALID_AUTONOMY/);
    await setAutonomy(USERS.alice, 2, 2, false);
    expect(await autonomy()).toMatchObject({ level: 2, suspended_at: null });
    const [audit] = await admin<{ metadata: { to: { level: number; max_files: number } } }>("select metadata from public.audit_events where action = 'autonomy.changed' order by id desc limit 1");
    expect(audit!.metadata.to).toMatchObject({ level: 2, max_files: 2 });
    await expect(asUser(USERS.alice, () => db.query("update public.org_autonomy set level = 0"))).rejects.toThrow(/permission denied/);
    expect((await asUser(USERS.bob, () => db.query("select level from public.org_autonomy"))).rows).toEqual([{ level: 2 }]);
  });
});

describe("proposals allowed within limits", () => {
  it("are refused while autonomy is off, and accepted at level 2", async () => {
    await setAutonomy(USERS.alice, 0);
    const task = await approvedTask("Off");
    await expect(propose(task, "ALLOW_WITHIN_LIMITS", "export const max = 2;\n")).rejects.toThrow(/AUTONOMY_OFF/);
    await setAutonomy(USERS.alice, 2);
    await expect(propose(task, "ALLOW_WITHIN_LIMITS", "export const max = 2;\n")).resolves.toMatch(/[0-9a-f-]{36}/);
  });
});

describe("automatic suspension", () => {
  it("switches autonomy off when a change applied on its own fails its checks", async () => {
    const task = await approvedTask("Applied by policy");
    const content = "export const max = 3;\n";
    const proposal = await propose(task, "ALLOW_WITHIN_LIMITS", content);
    await apply(task, proposal, content, "policy");
    expect((await autonomy())!.suspended_at).toBeNull();
    await failChecks(task, proposal);
    const a = (await autonomy())!;
    expect(a.suspended_at).not.toBeNull();
    expect(a.suspended_reason).toMatch(/applied on its own failed its checks/);
    const [audit] = await admin<{ action: string; target: string }>("select action, target from public.audit_events where action = 'autonomy.suspended' order by id desc limit 1");
    expect(audit).toEqual({ action: "autonomy.suspended", target: proposal });
    // While suspended, nothing more is allowed within limits.
    await expect(propose(await approvedTask("Suspended"), "ALLOW_WITHIN_LIMITS", "export const max = 4;\n")).rejects.toThrow(/AUTONOMY_OFF/);
  });

  it("leaves autonomy alone when a person-approved change fails, and clears a suspension when turned on again", async () => {
    await setAutonomy(USERS.alice, 2);
    expect((await autonomy())!.suspended_at).toBeNull();
    const task = await approvedTask("Approved by a person");
    const content = "export const max = 5;\n";
    const proposal = await propose(task, "REQUIRE_APPROVAL", content);
    await apply(task, proposal, content, "person");
    await failChecks(task, proposal);
    expect((await autonomy())!.suspended_at).toBeNull();
  });
});
