/**
 * Migration v83: mutation trials (ADR 0136). A run starts only for a
 * proposal waiting for review, one at a time, by a contributor; it runs
 * in a session for the proposal's project; its counts come from its
 * mutants, written once.
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
const step = (from: string, to: string, type: string, actor_kind?: "agent" | "system") => ({ event_id: `mr-${++seq}`, event_type: type, from, to, ...(actor_kind ? { actor_kind, actor_id: "farbaek" } : {}) });
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
      [org, USERS.alice, projectId, `mr-${++seq}-key`],
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

const start = (proposal: string, actor: string = USERS.alice) => q<{ id: string }>("select public.app_start_mutation_run($1, $2, $3) as id", [org, actor, proposal]).then((r) => r[0]!.id);
const finish = (id: string, status: string, result: Record<string, unknown>) => q("select public.app_finish_mutation_run($1, $2, $3, $4)", [id, USERS.alice, status, JSON.stringify(result)]);
const mutant = (result: string, line = 2) => ({ id: `src/a.ts:${line}:10`, path: "src/a.ts", line, column: 10, operator: "relational", original: ">", replacement: ">=", before: "n > 0", after: "n >= 0", result, durationMs: 3000, failingTest: null });
const DONE = { command: "npx --no-install vitest related --run --bail=1 src/a.ts", baselineMs: 4000, computeMs: 30000, mutants: [mutant("killed"), mutant("timed_out", 3), mutant("survived", 4), mutant("not_viable", 5)] };

describe("starting a mutation trial", () => {
  it("binds the run to the proposal's exact content, one at a time, with an audit event", async () => {
    const { proposal } = await pending("Mutants");
    const id = await start(proposal);
    expect((await admin<{ proposal_sha256: string; status: string }>("select proposal_sha256, status from public.mutation_runs where id = $1", [id]))[0]).toEqual({ proposal_sha256: H("b"), status: "running" });
    await expect(start(proposal)).rejects.toThrow(/MUTATION_RUNNING/);
    expect((await admin<{ action: string }>("select action from public.audit_events order by id desc limit 1"))[0]!.action).toBe("mutation.started");
  });

  it("is refused for people outside the workspace and for proposals that aren't waiting, and closes a stale run", async () => {
    const { proposal } = await pending("Refused");
    await expect(start(proposal, USERS.bob)).rejects.toThrow(/NOT_A_MEMBER|FORBIDDEN|NOT_FOUND/);
    const id = await start(proposal);
    await admin("update public.mutation_runs set started_at = now() - interval '31 minutes' where id = $1", [id]);
    await expect(start(proposal)).resolves.toMatch(/[0-9a-f-]{36}/);
    expect((await admin<{ status: string }>("select status from public.mutation_runs where id = $1", [id]))[0]!.status).toBe("failed");
    await admin("update public.change_proposals set status = 'discarded', decided_at = now() where id = $1", [proposal]);
    await expect(start(proposal)).rejects.toThrow(/INVALID_TRANSITION/);
  });
});

describe("finishing", () => {
  it("runs only in a session for the proposal's own project", async () => {
    const { proposal } = await pending("Session");
    const id = await start(proposal);
    await expect(q("select public.app_attach_mutation_session($1, $2, $3)", [id, USERS.alice, await session(otherProject)])).rejects.toThrow(/INVALID_REQUEST/);
    await q("select public.app_attach_mutation_session($1, $2, $3)", [id, USERS.alice, await session(project)]);
  });

  it("counts caught and survived from the mutants themselves, once", async () => {
    const { proposal } = await pending("Counts");
    const id = await start(proposal);
    await expect(finish(id, "done", { ...DONE, mutants: [] })).rejects.toThrow(/INVALID_REQUEST/);
    await expect(finish(id, "done", { ...DONE, mutants: Array.from({ length: 9 }, () => mutant("killed")) })).rejects.toThrow(/INVALID_REQUEST/);
    await expect(finish(id, "done", { ...DONE, mutants: [{ ...mutant("killed"), result: "verified" }] })).rejects.toThrow(/INVALID_REQUEST/);
    await finish(id, "done", { ...DONE, caught: 99 });
    await expect(finish(id, "failed", { reason: "again" })).rejects.toThrow(/INVALID_TRANSITION/);
    const [row] = await admin<{ caught: number; survived: number; judged: number; compute_ms: unknown }>("select caught, survived, judged, compute_ms from public.mutation_runs where id = $1", [id]);
    expect(row).toMatchObject({ caught: 2, survived: 1, judged: 3 });
    expect(Number(row!.compute_ms)).toBe(30000);
    expect((await admin<{ action: string; metadata: { caught: number } }>("select action, metadata from public.audit_events order by id desc limit 1"))[0]).toMatchObject({ action: "mutation.finished", metadata: { caught: 2 } });
  });

  it("keeps the reason when the clean run couldn't be judged", async () => {
    const { proposal } = await pending("Baseline");
    const id = await start(proposal);
    await expect(finish(id, "failed", {})).rejects.toThrow(/INVALID_REQUEST/);
    await finish(id, "failed", { reason: "The tests fail without any mutant.", command: DONE.command, baselineMs: 4000 });
    expect((await admin<{ status: string; reason: string }>("select status, reason from public.mutation_runs where id = $1", [id]))[0]).toMatchObject({ status: "failed", reason: expect.stringMatching(/without any mutant/) });
  });
});

describe("access", () => {
  it("lets members read their workspace's runs and nobody write them", async () => {
    expect((await asUser(USERS.alice, () => db.query("select id from public.mutation_runs"))).rows.length).toBeGreaterThan(0);
    expect((await asUser(USERS.bob, () => db.query("select id from public.mutation_runs"))).rows).toEqual([]);
    await expect(asUser(USERS.alice, () => db.query("update public.mutation_runs set status = 'done'"))).rejects.toThrow(/permission denied/);
    await expect(asUser(USERS.alice, () => db.query("select public.app_start_mutation_run($1, $2, $3)", [org, USERS.alice, org]))).rejects.toThrow(/permission denied/);
  });
});
