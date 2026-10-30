/**
 * Migration v82: the Failure Futures Lab (ADR 0135). A trial of one scenario
 * starts only for a proposal waiting for review, one at a time, by a
 * contributor; it runs in a session for the proposal's project; what it
 * observed is written once, and an observed result names the test it ran.
 */
import { createHash } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let project: string;
let otherProject: string;

const asService = <T>(fn: () => Promise<T>) => as(db, "service_role", null, fn);
const asUser = <T>(uid: string, fn: () => Promise<T>) => as(db, "authenticated", uid, fn);
const admin = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => asService(async () => (await db.query<T>(sql, params)).rows);
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const H = (c: string) => c.repeat(64);
const DAY = 86_400_000;

let seq = 0;
const step = (from: string, to: string, type: string, actor_kind?: "agent" | "system") => ({ event_id: `ff-${++seq}`, event_type: type, from, to, ...(actor_kind ? { actor_kind, actor_id: "farbaek" } : {}) });
const version = async (task: string) => (await admin<{ version: number }>("select version from public.tasks where id = $1", [task]))[0]!.version;

/** A task with an approved contract and a proposal waiting for review. */
async function pending(title: string) {
  const task = (await q<{ id: string }>("select public.app_create_task($1, $2, $3, $4) as id", [org, USERS.alice, project, title]))[0]!.id;
  await q("select public.app_save_contract($1, $2, $3, $4, 0, 0, $5)", [
    task,
    USERS.alice,
    JSON.stringify({ schema: "farbaek.intent-contract/v1", version: 1 }),
    H("c"),
    JSON.stringify([step("RECEIVED", "CONTEXT_ASSEMBLED", "assemble_context"), step("CONTEXT_ASSEMBLED", "CONTRACT_DRAFTED", "draft_contract")]),
  ]);
  await q("select public.app_approve_contract($1, $2, 1, $3, 2, $4)", [task, USERS.alice, H("c"), JSON.stringify([step("CONTRACT_DRAFTED", "CONTRACT_APPROVED", "approve_contract")])]);
  const content = `export const name = ${JSON.stringify(title)};\n`;
  const proposal = (
    await q<{ id: string }>("select public.app_create_proposal($1, $2, 1, $3, $4, '[]', '[]', $5, 'm', 1, 1, $6, $7, $8, 1000, $9, $10) as id", [
      task,
      USERS.alice,
      JSON.stringify({ summary: "s", steps: [], risks: [], checks: [] }),
      JSON.stringify([{ path: `src/${++seq}.ts`, kind: "create", base_revision: 0, content, sha256: sha(content), reason: "r" }]),
      H("b"),
      await version(task),
      JSON.stringify([step("CONTRACT_APPROVED", "PLAN_PROPOSED", "propose_plan", "agent"), step("PLAN_PROPOSED", "POLICY_EVALUATED", "evaluate_policy", "system"), step("POLICY_EVALUATED", "APPROVAL_PENDING", "require_approval", "system")]),
      JSON.stringify({ outcome: "REQUIRE_APPROVAL", version: H("e"), findings: [] }),
      new Date(Date.now() - DAY).toISOString(),
      new Date(Date.now() + DAY).toISOString(),
    ])
  )[0]!.id;
  return { task, proposal };
}

async function session(projectId: string) {
  return (
    await q<{ session_id: string }>(
      `select * from public.app_create_sandbox_session($1, $2, $3, null, 'Trial', 'node-ts', 'small', 'vercel/sandbox/universal', 'none', 1, 2048, 'vercel', 'microvm', 1800, 600, 100, 1000, now() - interval '1 day', $4)`,
      [org, USERS.alice, projectId, `ff-${++seq}-key`],
    )
  )[0]!.session_id;
}


beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  await createOrg(db, USERS.bob, "Bob Labs");
  project = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Storefront', null, null) as id", [org, USERS.alice]))[0]!.id;
  otherProject = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Docs', null, null) as id", [org, USERS.alice]))[0]!.id;
}, 60_000);

afterAll(async () => {
  await db.close();
});

const EVIDENCE = [{ path: "src/app/api/webhooks/route.ts", line: 3, snippet: 'const signature = req.headers.get("webhook-signature");' }];
const start = (proposal: string, actor: string = USERS.alice, kind = "duplicate_delivery", evidence: unknown = EVIDENCE) =>
  q<{ id: string }>("select public.app_start_failure_future($1, $2, $3, $4, $5) as id", [org, actor, proposal, kind, JSON.stringify(evidence)]).then((r) => r[0]!.id);
const finish = (id: string, status: string, result: Record<string, unknown>) => q("select public.app_finish_failure_future($1, $2, $3, $4)", [id, USERS.alice, status, JSON.stringify(result)]);
const TEST = "import { it } from 'vitest';\nit('processes a duplicate once', () => {});\n";
const OBSERVED = {
  testPath: "src/app/api/webhooks/route.failure-duplicate-delivery.test.ts",
  test: TEST,
  testSha256: sha(TEST),
  expects: "The second delivery is ignored.",
  command: "npx --no-install vitest run x.test.ts",
  exitCode: 1,
  durationMs: 4200,
  output: "AssertionError: expected 2 to be 1",
  reason: "The failure happened.",
  model: "claude-sonnet-5-5",
};

describe("starting a trial", () => {
  it("binds the trial to the proposal's exact content and one scenario, one at a time, with an audit event", async () => {
    const { proposal } = await pending("Trial");
    const id = await start(proposal);
    const [row] = await admin<{ proposal_sha256: string; status: string; kind: string }>("select proposal_sha256, status, kind from public.failure_futures where id = $1", [id]);
    expect(row).toEqual({ proposal_sha256: H("b"), status: "running", kind: "duplicate_delivery" });
    await expect(start(proposal, USERS.alice, "timeout")).rejects.toThrow(/FAILURE_TRIAL_RUNNING/);
    expect((await admin<{ action: string; metadata: { kind: string } }>("select action, metadata from public.audit_events order by id desc limit 1"))[0]).toMatchObject({ action: "failure_future.started", metadata: { kind: "duplicate_delivery" } });
  });

  it("refuses outsiders, proposals that aren't waiting, unknown scenarios and malformed evidence", async () => {
    const { proposal } = await pending("Refused");
    await expect(start(proposal, USERS.bob)).rejects.toThrow(/NOT_A_MEMBER|FORBIDDEN|NOT_FOUND/);
    await expect(start(proposal, USERS.alice, "deploy_rollback")).rejects.toThrow(/check constraint|violates/);
    await expect(start(proposal, USERS.alice, "timeout", [])).rejects.toThrow(/INVALID_REQUEST/);
    await expect(start(proposal, USERS.alice, "timeout", [{ path: "a.ts" }])).rejects.toThrow(/INVALID_REQUEST/);
    await admin("update public.change_proposals set status = 'discarded', decided_at = now() where id = $1", [proposal]);
    await expect(start(proposal)).rejects.toThrow(/INVALID_TRANSITION/);
  });

  it("closes a trial that stopped without finishing, so another can start", async () => {
    const { proposal } = await pending("Stale");
    const id = await start(proposal);
    await admin("update public.failure_futures set started_at = now() - interval '31 minutes' where id = $1", [id]);
    await expect(start(proposal)).resolves.toMatch(/[0-9a-f-]{36}/);
    expect((await admin<{ status: string; reason: string }>("select status, reason from public.failure_futures where id = $1", [id]))[0]).toMatchObject({ status: "failed", reason: expect.stringMatching(/stopped without finishing/) });
  });
});

describe("running and finishing", () => {
  it("runs only in a session for the proposal's own project", async () => {
    const { proposal } = await pending("Session");
    const id = await start(proposal);
    await expect(q("select public.app_attach_failure_session($1, $2, $3)", [id, USERS.alice, await session(otherProject)])).rejects.toThrow(/INVALID_REQUEST/);
    await q("select public.app_attach_failure_session($1, $2, $3)", [id, USERS.alice, await session(project)]);
  });

  it("writes what was observed once, and an observed result must name its test", async () => {
    const { proposal } = await pending("Finish");
    const id = await start(proposal);
    await expect(finish(id, "reproduced", { reason: "No test." })).rejects.toThrow(/failure_futures_observed/);
    await expect(finish(id, "verified", OBSERVED)).rejects.toThrow(/INVALID_REQUEST/);
    await finish(id, "reproduced", OBSERVED);
    await expect(finish(id, "handled", OBSERVED)).rejects.toThrow(/INVALID_TRANSITION/);
    const [row] = await admin<{ status: string; exit_code: number; test_sha256: string; finished_at: string | null }>("select status, exit_code, test_sha256, finished_at from public.failure_futures where id = $1", [id]);
    expect(row).toMatchObject({ status: "reproduced", exit_code: 1, test_sha256: sha(TEST) });
    expect(row!.finished_at).not.toBeNull();
    expect((await admin<{ action: string; metadata: { status: string } }>("select action, metadata from public.audit_events order by id desc limit 1"))[0]).toMatchObject({ action: "failure_future.finished", metadata: { status: "reproduced" } });
  });

  it("records a scenario the AI couldn't test, or a trial that didn't run, with the reason", async () => {
    const { proposal } = await pending("Untestable");
    const id = await start(proposal);
    await finish(id, "not_testable", { reason: "Two deliveries need the provider's real retry timing.", model: "claude-sonnet-5-5" });
    expect((await admin<{ status: string; reason: string }>("select status, reason from public.failure_futures where id = $1", [id]))[0]).toMatchObject({ status: "not_testable", reason: expect.stringMatching(/retry timing/) });
  });

  it("is metered as failure_test", async () => {
    const from = new Date(Date.now() - DAY).toISOString();
    const to = new Date(Date.now() + DAY).toISOString();
    const grant = JSON.stringify({ kind: "plan", units: 1_000, starts_at: from, expires_at: to, source_key: "plan:failure-test" });
    await expect(q("select public.app_reserve_usage($1, $2, 'k-failure', 'failure_test', null, 30, $3)", [org, USERS.alice, grant])).resolves.toHaveLength(1);
  });
});

describe("access", () => {
  it("lets members read their workspace's trials and nobody write them", async () => {
    expect((await asUser(USERS.alice, () => db.query("select id from public.failure_futures"))).rows.length).toBeGreaterThan(0);
    expect((await asUser(USERS.bob, () => db.query("select id from public.failure_futures"))).rows).toEqual([]);
    await expect(asUser(USERS.alice, () => db.query("update public.failure_futures set status = 'handled'"))).rejects.toThrow(/permission denied/);
    await expect(asUser(USERS.alice, () => db.query("select public.app_start_failure_future($1, $2, $3, 'timeout', '[]')", [org, USERS.alice, org]))).rejects.toThrow(/permission denied/);
  });
});
