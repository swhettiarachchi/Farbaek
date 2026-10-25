/**
 * Migration v47: the Future-State Arena (ADR 0076). A trial is started only
 * for a proposal waiting for review, one at a time, by a contributor; it runs
 * in a session for the proposal's project; its results are written once.
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
const step = (from: string, to: string, type: string, actor_kind?: "agent" | "system") => ({ event_id: `ar-${++seq}`, event_type: type, from, to, ...(actor_kind ? { actor_kind, actor_id: "farbaek" } : {}) });
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
      [org, USERS.alice, projectId, `ar-${++seq}-key`],
    )
  )[0]!.session_id;
}

const start = (proposal: string, actor: string = USERS.alice, orgId: string = org) => q<{ id: string }>("select public.app_start_arena_run($1, $2, $3) as id", [orgId, actor, proposal]).then((r) => r[0]!.id);
const finish = (id: string, status: string, baseline: unknown, candidate: unknown, failure: string | null = null) =>
  q("select public.app_finish_arena_run($1, $2, $3, $4, $5, $6)", [id, USERS.alice, status, baseline === null ? null : JSON.stringify(baseline), candidate === null ? null : JSON.stringify(candidate), failure]);
const RESULTS = [{ name: "npm test", exitCode: 0, durationMs: 1200, failure: null }];

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

describe("starting a trial", () => {
  it("binds the trial to the proposal's exact content, one at a time, with an audit event", async () => {
    const { proposal } = await pending("Trial");
    const id = await start(proposal);
    const [row] = await admin<{ proposal_sha256: string; status: string }>("select proposal_sha256, status from public.arena_runs where id = $1", [id]);
    expect(row).toEqual({ proposal_sha256: H("b"), status: "running" });
    await expect(start(proposal)).rejects.toThrow(/ARENA_RUNNING/);
    expect((await admin<{ action: string }>("select action from public.audit_events order by id desc limit 1"))[0]!.action).toBe("arena.started");
  });

  it("is refused for people outside the workspace and for proposals that aren't waiting", async () => {
    const { proposal } = await pending("Refused");
    await expect(start(proposal, USERS.bob)).rejects.toThrow(/NOT_A_MEMBER|FORBIDDEN|NOT_FOUND/);
    await admin("update public.change_proposals set status = 'discarded', decided_at = now() where id = $1", [proposal]);
    await expect(start(proposal)).rejects.toThrow(/INVALID_TRANSITION/);
  });

  it("closes a trial that stopped without finishing, so another can start", async () => {
    const { proposal } = await pending("Stale");
    const id = await start(proposal);
    await admin("update public.arena_runs set started_at = now() - interval '31 minutes' where id = $1", [id]);
    await expect(start(proposal)).resolves.toMatch(/[0-9a-f-]{36}/);
    expect((await admin<{ status: string; failure: string }>("select status, failure from public.arena_runs where id = $1", [id]))[0]).toMatchObject({ status: "failed", failure: expect.stringMatching(/stopped without finishing/) });
  });
});

describe("running and finishing", () => {
  it("runs only in a session for the proposal's own project", async () => {
    const { proposal } = await pending("Session");
    const id = await start(proposal);
    await expect(q("select public.app_attach_arena_session($1, $2, $3)", [id, USERS.alice, await session(otherProject)])).rejects.toThrow(/INVALID_REQUEST/);
    await q("select public.app_attach_arena_session($1, $2, $3)", [id, USERS.alice, await session(project)]);
  });

  it("writes both results once, and refuses malformed ones", async () => {
    const { proposal } = await pending("Finish");
    const id = await start(proposal);
    await expect(finish(id, "done", [{ exitCode: 0 }], RESULTS)).rejects.toThrow(/INVALID_REQUEST/);
    await expect(finish(id, "done", RESULTS, Array.from({ length: 21 }, () => RESULTS[0]))).rejects.toThrow(/INVALID_REQUEST/);
    await finish(id, "done", RESULTS, [{ ...RESULTS[0], exitCode: 1 }]);
    await expect(finish(id, "failed", null, null, "again")).rejects.toThrow(/INVALID_TRANSITION/);
    const [row] = await admin<{ status: string; candidate: { exitCode: number }[] }>("select status, candidate from public.arena_runs where id = $1", [id]);
    expect(row!.status).toBe("done");
    expect(row!.candidate[0]!.exitCode).toBe(1);
  });

  it("keeps the baseline and the reason when the candidate couldn't run", async () => {
    const { proposal } = await pending("Failed");
    const id = await start(proposal);
    await finish(id, "failed", RESULTS, null, "The change's files couldn't be copied into the sandbox.");
    expect((await admin<{ status: string; baseline: unknown[] }>("select status, baseline from public.arena_runs where id = $1", [id]))[0]).toMatchObject({ status: "failed", baseline: RESULTS });
  });
});

describe("access", () => {
  it("lets members read their workspace's trials and nobody write them", async () => {
    expect((await asUser(USERS.alice, () => db.query("select id from public.arena_runs"))).rows.length).toBeGreaterThan(0);
    expect((await asUser(USERS.bob, () => db.query("select id from public.arena_runs"))).rows).toEqual([]);
    await expect(asUser(USERS.alice, () => db.query("update public.arena_runs set status = 'done'"))).rejects.toThrow(/permission denied/);
    await expect(asUser(USERS.alice, () => db.query("select public.app_start_arena_run($1, $2, $3)", [org, USERS.alice, org]))).rejects.toThrow(/permission denied/);
  });
});
