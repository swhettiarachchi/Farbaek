/**
 * Migration 16: cloud agent runs. One live run per approved task, started by
 * a contributor; progress and events only from the server; ended runs can't
 * change; stale runs are interrupted; a run's proposal goes through
 * app_create_proposal and carries the run's id.
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
const asUser = <T>(uid: string, fn: () => Promise<T>) => as(db, "authenticated", uid, fn);
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const H = (c: string) => c.repeat(64);
const DAY = 86_400_000;

let seq = 0;
const step = (from: string, to: string, type: string, actor_kind?: "agent" | "system", actor_id?: string) => ({
  event_id: `e-${++seq}`,
  event_type: type,
  from,
  to,
  ...(actor_kind ? { actor_kind, actor_id: actor_id ?? "farbaek" } : {}),
});

async function approvedTask(title: string): Promise<string> {
  const id = (await q<{ id: string }>("select public.app_create_task($1, $2, $3, $4) as id", [org, USERS.alice, project, title]))[0]!.id;
  await q("select public.app_save_contract($1, $2, $3, $4, 0, 0, $5)", [
    id,
    USERS.alice,
    JSON.stringify({ schema: "farbaek.intent-contract/v1", version: 1 }),
    H("c"),
    JSON.stringify([step("RECEIVED", "CONTEXT_ASSEMBLED", "assemble_context"), step("CONTEXT_ASSEMBLED", "CONTRACT_DRAFTED", "draft_contract")]),
  ]);
  await q("select public.app_approve_contract($1, $2, 1, $3, 2, $4)", [id, USERS.alice, H("c"), JSON.stringify([step("CONTRACT_DRAFTED", "CONTRACT_APPROVED", "approve_contract")])]);
  return id;
}

const start = (task: string, opts: { actor?: string; org?: string } = {}) =>
  q<{ id: string }>("select public.app_start_agent_run($1, $2, $3, 'balanced', 'sandboxed', 1, $4) as id", [opts.org ?? org, opts.actor ?? USERS.alice, task, H("c")]).then((r) => r[0]!.id);

const update = (run: string, p: { status?: string | null; model?: string | null; steps?: number; input?: number; output?: number; events?: unknown[] | null; outcome?: string | null; finish?: object | null }) =>
  q("select public.app_update_agent_run($1, $2, $3, $4, $5, $6, null, $7, $8, $9)", [
    run,
    p.status ?? null,
    p.model ?? null,
    p.steps ?? 0,
    p.input ?? 0,
    p.output ?? 0,
    p.outcome ?? null,
    p.finish ? JSON.stringify(p.finish) : null,
    p.events ? JSON.stringify(p.events) : null,
  ]);

const run = (id: string) => admin<{ status: string; steps: number; input_tokens: number; model: string | null; ended_at: string | null; proposal_id: string | null; outcome: string | null }>("select * from public.agent_runs where id = $1", [id]).then((r) => r[0]!);

async function runPropose(runId: string, task: string, opts: { actor?: string; stepId?: string } = {}) {
  const version = (await q<{ version: number }>("select version from public.tasks where id = $1", [task]))[0]!.version;
  const content = "# Readme\nRun pnpm test.\n";
  const rows = await q<{ id: string }>(
    "select public.app_create_run_proposal($1, $2, $3, 1, $4, $5, '[]', '[]', $6, 'claude-sonnet-5-5', 100, 50, $7, $8, $9, 1000, $10, $11) as id",
    [
      runId,
      task,
      opts.actor ?? USERS.alice,
      JSON.stringify({ summary: "s", steps: [], risks: [], checks: [] }),
      JSON.stringify([{ path: "README.md", kind: "edit", base_revision: 1, content, sha256: sha(content), reason: "r" }]),
      H("b"),
      version,
      JSON.stringify([
        step("CONTRACT_APPROVED", "PLAN_PROPOSED", "propose_plan", "agent", opts.stepId ?? `run:${runId}`),
        step("PLAN_PROPOSED", "POLICY_EVALUATED", "evaluate_policy", "system"),
        step("POLICY_EVALUATED", "APPROVAL_PENDING", "require_approval", "system"),
      ]),
      JSON.stringify({ outcome: "REQUIRE_APPROVAL", version: H("e"), findings: [] }),
      new Date(Date.now() - DAY).toISOString(),
      new Date(Date.now() + DAY).toISOString(),
    ],
  );
  return rows[0]!.id;
}

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  otherOrg = await createOrg(db, USERS.bob, "Bob Labs");
  project = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Storefront', null, null) as id", [org, USERS.alice]))[0]!.id;
  await q("select public.app_import_files($1, $2, $3, 524288, 4194304, 26214400, 3000)", [project, USERS.alice, JSON.stringify([{ path: "README.md", content: "# Readme\n" }])]);
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("starting runs", () => {
  it("starts one live run per approved task, for a contributor", async () => {
    const task = await approvedTask("Name the test command");
    const id = await start(task);
    expect(await run(id)).toMatchObject({ status: "starting", steps: 0, ended_at: null });
    await expect(start(task)).rejects.toThrow(/RUN_ACTIVE/);
    expect(await q("select 1 from public.audit_events where action = 'agent.run_started' and target = $1", [id])).toHaveLength(1);
  });

  it("records a run's own usage cap, refuses a non-positive one, and still starts uncapped runs (ADR 0040)", async () => {
    const task = await approvedTask("Capped run");
    const id = (await q<{ id: string }>("select public.app_start_agent_run($1, $2, $3, 'balanced', 'sandboxed', 1, $4, $5) as id", [org, USERS.alice, task, H("c"), 1_200]))[0]!.id;
    expect(await q("select cap_units from public.agent_runs where id = $1", [id])).toEqual([{ cap_units: 1_200 }]);
    expect(await q<{ cap: number }>("select (metadata->>'cap_units')::int as cap from public.audit_events where action = 'agent.run_started' and target = $1", [id])).toEqual([{ cap: 1_200 }]);
    const other = await approvedTask("Bad cap");
    await expect(q("select public.app_start_agent_run($1, $2, $3, 'balanced', 'sandboxed', 1, $4, 0)", [org, USERS.alice, other, H("c")])).rejects.toThrow(/INVALID_CAP/);
    const uncapped = await start(other);
    expect(await q("select cap_units from public.agent_runs where id = $1", [uncapped])).toEqual([{ cap_units: null }]);
  });

  it("refuses tasks that aren't approved, other workspaces and non-members", async () => {
    const draft = (await q<{ id: string }>("select public.app_create_task($1, $2, $3, 'Not yet') as id", [org, USERS.alice, project]))[0]!.id;
    await expect(start(draft)).rejects.toThrow(/INVALID_TRANSITION/);
    const task = await approvedTask("Elsewhere");
    await expect(start(task, { org: otherOrg, actor: USERS.bob })).rejects.toThrow(/NOT_FOUND/);
    await expect(start(task, { actor: USERS.bob })).rejects.toThrow(/FORBIDDEN/);
  });
});

describe("progress and events", () => {
  it("appends events and adds up usage, then ends exactly once", async () => {
    const id = await start(await approvedTask("Progress"));
    await update(id, { status: "working", model: "claude-sonnet-5-5", steps: 1, input: 1200, output: 300, events: [{ kind: "model", payload: { text: "Reading." } }, { kind: "tool", payload: { tool: "read_file", target: "README.md", status: "done" } }] });
    await update(id, { steps: 1, input: 800, output: 100 });
    expect(await run(id)).toMatchObject({ status: "working", steps: 2, input_tokens: 2000, model: "claude-sonnet-5-5" });
    expect((await admin<{ kind: string }>("select kind from public.agent_run_events where run_id = $1 order by id", [id])).map((e) => e.kind)).toEqual(["model", "tool"]);

    await update(id, { status: "finished", outcome: "Finished.", finish: { summary: "Done." } });
    expect((await run(id)).ended_at).not.toBeNull();
    await expect(update(id, { status: "working" })).rejects.toThrow(/RUN_ENDED/);
  });

  it("validates statuses, events and their size", async () => {
    const id = await start(await approvedTask("Validation"));
    await expect(update(id, { status: "starting" })).rejects.toThrow(/INVALID_STATUS/);
    await expect(update(id, { events: [{ kind: "shell", payload: {} }] })).rejects.toThrow(/check/);
    await expect(update(id, { events: [{ kind: "note", payload: { text: "x".repeat(20_000) } }] })).rejects.toThrow(/check/);
    await expect(update(id, { events: Array.from({ length: 51 }, () => ({ kind: "note", payload: { text: "n" } })) })).rejects.toThrow(/INVALID_EVENTS/);
  });

  it("interrupts runs that stopped reporting, and only those", async () => {
    const stale = await start(await approvedTask("Stale"));
    const fresh = await start(await approvedTask("Fresh"));
    await admin("update public.agent_runs set updated_at = now() - interval '20 minutes' where id = $1", [stale]);
    const interrupted = await q<{ count: number }>("select public.app_interrupt_stale_agent_runs(now() - interval '10 minutes') as count");
    expect(interrupted[0]!.count).toBeGreaterThanOrEqual(1);
    expect(await run(stale)).toMatchObject({ status: "interrupted", outcome: expect.stringMatching(/won't continue/) });
    expect((await run(fresh)).status).toBe("starting");
  });
});

describe("a run's proposal", () => {
  it("creates an ordinary proposal tagged with the run, once", async () => {
    const task = await approvedTask("Propose");
    const id = await start(task);
    await update(id, { status: "working" });
    const proposal = await runPropose(id, task);
    expect(await admin("select run_id, agent_id from public.change_proposals where id = $1", [proposal])).toEqual([{ run_id: id, agent_id: null }]);
    expect((await run(id)).proposal_id).toBe(proposal);
    expect(await admin("select state from public.tasks where id = $1", [task])).toEqual([{ state: "APPROVAL_PENDING" }]);
    await expect(runPropose(id, task)).rejects.toThrow(/RUN_ENDED/);
  });

  it("refuses another person, another task, a step naming someone else and an ended run", async () => {
    const task = await approvedTask("Guarded");
    const id = await start(task);
    await update(id, { status: "working" });
    await expect(runPropose(id, task, { actor: USERS.bob })).rejects.toThrow(/FORBIDDEN/);
    await expect(runPropose(id, await approvedTask("Other task"))).rejects.toThrow(/FORBIDDEN/);
    await expect(runPropose(id, task, { stepId: "run:00000000-0000-4000-8000-000000000000" })).rejects.toThrow(/INVALID_PROPOSAL/);
    await update(id, { status: "cancelled" });
    await expect(runPropose(id, task)).rejects.toThrow(/RUN_ENDED/);
  });
});

describe("access", () => {
  it("members read their runs and events; nobody else does, and browsers can't write", async () => {
    const id = await start(await approvedTask("Access"));
    await update(id, { events: [{ kind: "note", payload: { text: "Hello." } }] });
    expect(await asUser(USERS.alice, async () => (await db.query("select id from public.agent_runs where id = $1", [id])).rows)).toHaveLength(1);
    expect(await asUser(USERS.alice, async () => (await db.query("select id from public.agent_run_events where run_id = $1", [id])).rows)).toHaveLength(1);
    expect(await asUser(USERS.bob, async () => (await db.query("select id from public.agent_runs where id = $1", [id])).rows)).toEqual([]);
    await expect(asUser(USERS.alice, () => db.query("update public.agent_runs set status = 'finished' where id = $1", [id]))).rejects.toThrow(/permission denied/);
    await expect(asUser(USERS.alice, () => db.query("select public.app_update_agent_run($1, 'working', null, 0, 0, 0, null, null, null, null)", [id]))).rejects.toThrow(/permission denied/);
    await expect(as(db, "anon", null, () => db.query("select * from public.agent_runs"))).rejects.toThrow(/permission denied/);
  });
});
