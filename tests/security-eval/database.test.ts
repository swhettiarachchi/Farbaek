/**
 * Boundaries the database enforces on its own (ASI03, ASI07, ASI08, ASI10),
 * on a real Postgres (PGlite) with every migration: workspaces stay apart,
 * desktop agents' credentials can't be reused, Farbaek's AI switch stops
 * every workspace at once, and a failure after an automatic apply pauses
 * autonomy.
 */
import { createHash } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "../db/harness";

let db: PGlite;
let orgA: string;
let orgB: string;
let projectA: string;
let projectB: string;

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const asUser = <T = Record<string, unknown>>(uid: string, sql: string, params: unknown[] = []) => as(db, "authenticated", uid, async () => (await db.query<T>(sql, params)).rows);
const admin = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const H = (c: string) => c.repeat(64);
const DAY = 86_400_000;
const LIMITS = [1024 * 512, 25 * 1024 * 1024, 3000];

let seq = 0;
const step = (from: string, to: string, type: string, actor_kind?: "agent" | "system") => ({ event_id: `se-${++seq}`, event_type: type, from, to, ...(actor_kind ? { actor_kind, actor_id: "farbaek" } : {}) });
const version = async (task: string) => (await admin<{ version: number }>("select version from public.tasks where id = $1", [task]))[0]!.version;
const latest = async (project: string) => (await admin<{ digest: string }>("select digest from public.proofpacks where project_id = $1 order by seq desc limit 1", [project]))[0]?.digest ?? null;

/** A task in org's project with an approved contract and a pending proposal; applied when `by` is given. */
async function task(org: string, actor: string, project: string, title: string, by?: "person" | "policy") {
  const id = (await q<{ id: string }>("select public.app_create_task($1, $2, $3, $4) as id", [org, actor, project, title]))[0]!.id;
  await q("select public.app_save_contract($1, $2, $3, $4, 0, 0, $5)", [id, actor, JSON.stringify({ schema: "farbaek.intent-contract/v1", version: 1 }), H("c"), JSON.stringify([step("RECEIVED", "CONTEXT_ASSEMBLED", "assemble_context"), step("CONTEXT_ASSEMBLED", "CONTRACT_DRAFTED", "draft_contract")])]);
  await q("select public.app_approve_contract($1, $2, 1, $3, 2, $4)", [id, actor, H("c"), JSON.stringify([step("CONTRACT_DRAFTED", "CONTRACT_APPROVED", "approve_contract")])]);
  const path = `docs/${title.replace(/\W+/g, "-").toLowerCase()}.md`;
  const content = `# ${title}\n`;
  const proposal = (
    await q<{ id: string }>("select public.app_create_proposal($1, $2, 1, $3, $4, '[]', '[]', $5, 'm', 1, 1, $6, $7, $8, 1000, $9, $10) as id", [
      id,
      actor,
      JSON.stringify({ summary: "s", steps: [], risks: [], checks: [] }),
      JSON.stringify([{ path, kind: "create", base_revision: 0, content, sha256: sha(content), reason: "r" }]),
      H("b"),
      await version(id),
      JSON.stringify([step("CONTRACT_APPROVED", "PLAN_PROPOSED", "propose_plan", "agent"), step("PLAN_PROPOSED", "POLICY_EVALUATED", "evaluate_policy", "system"), step("POLICY_EVALUATED", "APPROVAL_PENDING", "require_approval", "system")]),
      JSON.stringify({ outcome: by === "policy" ? "ALLOW_WITHIN_LIMITS" : "REQUIRE_APPROVAL", version: H("e"), findings: [] }),
      new Date(Date.now() - DAY).toISOString(),
      new Date(Date.now() + DAY).toISOString(),
    ])
  )[0]!.id;
  if (by) {
    const pack = { _type: "https://in-toto.io/Statement/v1", subject: [{ name: path, digest: { sha256: sha(content) } }], predicateType: "https://farbaek.dev/proofpack/v1", predicate: { status: "unverified", proposal: { id: proposal }, approval: { appliedSha256: H("a"), ...(by === "policy" ? { by: "policy", autonomyLevel: 2 } : {}) }, previous: await latest(project), nonce: ++seq } };
    await q("select public.app_apply_proposal($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'unverified')", [
      proposal,
      actor,
      JSON.stringify([{ path, content }]),
      H("a"),
      await version(id),
      JSON.stringify([step("APPROVAL_PENDING", "EXECUTION_AUTHORIZED", "grant_approval", by === "policy" ? "system" : undefined), step("EXECUTION_AUTHORIZED", "EXECUTING", "start_execution", "system"), step("EXECUTING", "VERIFYING", "begin_verification", "system")]),
      ...LIMITS,
      JSON.stringify(pack),
      sha(JSON.stringify(pack)),
    ]);
  }
  return { task: id, proposal };
}

beforeAll(async () => {
  db = await createTestDb();
  orgA = await createOrg(db, USERS.alice, "Alice Studio");
  orgB = await createOrg(db, USERS.bob, "Bob Labs");
  projectA = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Storefront', null, null) as id", [orgA, USERS.alice]))[0]!.id;
  projectB = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Ledger', null, null) as id", [orgB, USERS.bob]))[0]!.id;
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("SE-020 Reaching into another workspace", () => {
  it("can't read another workspace's work, and server functions refuse to act there", async () => {
    const b = await task(orgB, USERS.bob, projectB, "Bob's change", "person");
    for (const table of ["tasks", "change_proposals", "proofpacks", "project_files", "intent_contracts", "task_verifications", "audit_events"]) {
      const seen = await asUser<{ n: number }>(USERS.alice, `select count(*)::int as n from public.${table} where org_id = $1`, [orgB]);
      expect(seen[0]!.n, table).toBe(0);
    }
    await expect(q("select public.app_create_task($1, $2, $3, 'Planted')", [orgB, USERS.alice, projectB])).rejects.toThrow(/FORBIDDEN|NOT_FOUND/);
    await expect(q("select public.app_start_task_verification($1, $2, $3, 'person')", [orgB, USERS.alice, b.task])).rejects.toThrow(/FORBIDDEN|NOT_FOUND/);
    await expect(q("select public.app_set_autonomy($1, $2, 2, 3, true)", [orgB, USERS.alice])).rejects.toThrow(/FORBIDDEN/);
    // And the browser can't write anywhere, even in its own workspace.
    await expect(asUser(USERS.alice, "update public.tasks set state = 'VERIFIED'")).rejects.toThrow(/permission denied/);
  });
});

describe("SE-021 A desktop agent's credentials reused", () => {
  it("accepts a pairing code once, and stops a revoked agent's token at once", async () => {
    const code = "EVAL-CODE-1";
    await q("select public.app_create_agent_pairing($1, $2, $3, $4, $5)", [orgA, USERS.alice, sha(code), new Date(Date.now() + 10 * 60_000).toISOString(), 5]);
    const redeem = (token: string) => q<{ agent_id: string }>("select * from public.app_redeem_agent_pairing($1, $2, 'Eval PC', 'windows', '0.1.0', 5)", [sha(code), sha(token)]);
    const [agent] = await redeem("fa_eval_token_1");
    await expect(redeem("fa_eval_token_2")).rejects.toThrow(/PAIRING_CLOSED/);
    const session = (token: string) => q("select * from public.app_agent_session($1)", [sha(token)]);
    expect(await session("fa_eval_token_1")).toHaveLength(1);
    // Someone outside the workspace can't revoke it, or take it over.
    await expect(q("select public.app_revoke_agent($1, $2)", [agent!.agent_id, USERS.bob])).rejects.toThrow(/FORBIDDEN/);
    await q("select public.app_revoke_agent($1, $2)", [agent!.agent_id, USERS.alice]);
    expect(await session("fa_eval_token_1")).toEqual([]);
    expect(await session("fa_eval_token_2")).toEqual([]);
  });
});

describe("SE-022 Stopping AI everywhere at once", () => {
  it("refuses every workspace's usage while the AI switch is paused, and only then", async () => {
    const grant = JSON.stringify({ kind: "plan", units: 10_000, starts_at: new Date(Date.now() - DAY).toISOString(), expires_at: new Date(Date.now() + 20 * DAY).toISOString(), source_key: "plan:pro:eval" });
    const reserve = (org: string, actor: string, key: string) => q("select public.app_reserve_usage($1, $2, $3, 'agent_step', null, 10, $4)", [org, actor, key, grant]);
    await reserve(orgA, USERS.alice, "eval-before");
    await admin("update public.platform_flags set paused = true, public_message = 'Paused for an evaluation test.' where key = 'ai_runs'");
    try {
      await expect(reserve(orgA, USERS.alice, "eval-a")).rejects.toThrow(/PAUSED_BY_FARBAEK:ai_runs/);
      await expect(reserve(orgB, USERS.bob, "eval-b")).rejects.toThrow(/PAUSED_BY_FARBAEK:ai_runs/);
    } finally {
      await admin("update public.platform_flags set paused = false, public_message = null where key = 'ai_runs'");
    }
    await reserve(orgB, USERS.bob, "eval-after");
  });
});

describe("SE-023 A failure after autonomy applies a change", () => {
  const failPack = async (t: { task: string; proposal: string }, status: string) => {
    const statement = { _type: "https://in-toto.io/Statement/v1", predicate: { status, proposal: { id: t.proposal }, nonce: ++seq } };
    await admin("insert into public.proofpacks (digest, org_id, project_id, task_id, proposal_id, status, statement, previous) values ($1, $2, $3, $4, $5, $6, $7, $8)", [
      sha(JSON.stringify(statement)),
      orgA,
      projectA,
      t.task,
      t.proposal,
      status,
      JSON.stringify(statement),
      await latest(projectA),
    ]);
  };
  const suspended = async () => (await admin<{ suspended_at: string | null }>("select suspended_at from public.org_autonomy where org_id = $1", [orgA]))[0]?.suspended_at ?? null;

  it("pauses autonomy for the whole workspace after a failed or partly failed check, and refuses more automatic applies", async () => {
    for (const status of ["failed", "partially_verified"]) {
      await q("select public.app_set_autonomy($1, $2, 2, 3, true)", [orgA, USERS.alice]);
      const t = await task(orgA, USERS.alice, projectA, `Policy applied ${status}`, "policy");
      expect(await suspended()).toBeNull();
      await failPack(t, status);
      expect(await suspended(), status).not.toBeNull();
      // Work that waits for a person carries on; nothing may be allowed within limits while it's paused.
      await expect(task(orgA, USERS.alice, projectA, `Next after ${status}`)).resolves.toMatchObject({ task: expect.any(String) });
      await expect(task(orgA, USERS.alice, projectA, `Blocked after ${status}`, "policy")).rejects.toThrow(/AUTONOMY_OFF/);
    }
  });

  it("runs one verification per task at a time", async () => {
    const t = await task(orgA, USERS.alice, projectA, "One at a time", "person");
    await q("select public.app_start_task_verification($1, $2, $3, 'person')", [orgA, USERS.alice, t.task]);
    await expect(q("select public.app_start_task_verification($1, $2, $3, 'autonomy')", [orgA, USERS.alice, t.task])).rejects.toThrow(/VERIFICATION_RUNNING/);
  });
});
