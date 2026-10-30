/**
 * Migration v80 (ADR 0131): operating modes. Learn and Audit tasks change
 * nothing (no proposals, no agent runs); a Pair change is at most 3 files
 * and only a person applies it; modes change only for contributors and
 * never while a change waits; notes match their task's mode.
 */
import { createHash } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let project: string;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const admin = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const H = (c: string) => c.repeat(64);

let seq = 0;
const step = (from: string, to: string, type: string, actor_kind?: "agent" | "system") => ({ event_id: `m-${++seq}`, event_type: type, from, to, ...(actor_kind ? { actor_kind, actor_id: "farbaek" } : {}) });
const version = async (task: string) => (await admin<{ version: number }>("select version from public.tasks where id = $1", [task]))[0]!.version;
const setMode = (task: string, mode: string, actor: string = USERS.alice) => q("select public.app_set_task_mode($1, $2, $3)", [task, actor, mode]);

/** A task with an approved contract, in the given mode. */
async function approvedTask(mode: string): Promise<string> {
  const task = (await q<{ id: string }>("select public.app_create_task($1, $2, $3, $4) as id", [org, USERS.alice, project, `Task ${++seq}`]))[0]!.id;
  await setMode(task, mode);
  const body = JSON.stringify({ schema: "farbaek.intent-contract/v1", version: 1 });
  await q("select public.app_save_contract($1, $2, $3, $4, 0, 0, $5)", [task, USERS.alice, body, H("c"), JSON.stringify([step("RECEIVED", "CONTEXT_ASSEMBLED", "assemble_context"), step("CONTEXT_ASSEMBLED", "CONTRACT_DRAFTED", "draft_contract")])]);
  await q("select public.app_approve_contract($1, $2, 1, $3, 2, $4)", [task, USERS.alice, H("c"), JSON.stringify([step("CONTRACT_DRAFTED", "CONTRACT_APPROVED", "approve_contract")])]);
  return task;
}

async function propose(task: string, files: number, outcome = "REQUIRE_APPROVAL") {
  const base = (await admin<{ revision: number }>("select revision from public.project_files where project_id = $1 and path = 'src/cart.ts'", [project]))[0]!.revision;
  const changes = Array.from({ length: files }, (_, i) => {
    const content = `export const v${i} = ${++seq};\n`;
    return i === 0 ? { path: "src/cart.ts", kind: "edit", base_revision: base, content, sha256: sha(content), reason: "r" } : { path: `src/new-${seq}-${i}.ts`, kind: "create", base_revision: 0, content, sha256: sha(content), reason: "r" };
  });
  return (
    await q<{ id: string }>("select public.app_create_proposal($1, $2, 1, $3, $4, '[]', '[]', $5, 'claude-opus-5-5', 100, 50, $6, $7, $8, 1000, $9, $10) as id", [
      task,
      USERS.alice,
      JSON.stringify({ summary: "s", steps: [], risks: [], checks: [] }),
      JSON.stringify(changes),
      H("b"),
      await version(task),
      JSON.stringify([step("CONTRACT_APPROVED", "PLAN_PROPOSED", "propose_plan", "agent"), step("PLAN_PROPOSED", "POLICY_EVALUATED", "evaluate_policy", "system"), step("POLICY_EVALUATED", "APPROVAL_PENDING", "require_approval", "system")]),
      JSON.stringify({ outcome, version: H("e"), findings: [] }),
      new Date(Date.now() - 86_400_000).toISOString(),
      new Date(Date.now() + 86_400_000).toISOString(),
    ])
  )[0]!.id;
}

const startRun = (task: string) => q("select public.app_start_agent_run($1, $2, $3, 'balanced', 'sandboxed', 1, $4, 1000)", [org, USERS.alice, task, H("c")]);

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

describe("modes", () => {
  it("lets Learn and Audit tasks change nothing: no proposals, no agent runs", async () => {
    for (const mode of ["learn", "audit"]) {
      const task = await approvedTask(mode);
      await expect(propose(task, 1)).rejects.toThrow(/MODE_NO_CHANGES/);
      await expect(startRun(task)).rejects.toThrow(/MODE_NO_CHANGES/);
    }
    const build = await approvedTask("build");
    await expect(propose(build, 4)).resolves.toMatch(/^[0-9a-f-]{36}$/);
  });

  it("keeps a Pair change to 3 files, applied only by a person", async () => {
    const big = await approvedTask("pair");
    await expect(propose(big, 4)).rejects.toThrow(/PAIR_TOO_LARGE/);
    const small = await approvedTask("pair");
    const p = await propose(small, 3);
    // As if the workspace's autonomy allowed it (the proposal function itself refuses that while autonomy is off).
    await admin("update public.change_proposals set policy = jsonb_set(policy, '{outcome}', '\"ALLOW_WITHIN_LIMITS\"') where id = $1", [p]);
    await expect(admin("update public.change_proposals set status = 'applied', decided_at = now(), decided_by = $2, applied_sha256 = $3 where id = $1", [p, USERS.alice, H("d")])).rejects.toThrow(/PAIR_NEEDS_PERSON/);
    const byPerson = await approvedTask("pair");
    const p2 = await propose(byPerson, 2);
    await expect(admin("update public.change_proposals set status = 'applied', decided_at = now(), decided_by = $2, applied_sha256 = $3 where id = $1", [p2, USERS.alice, H("d")])).resolves.toBeDefined();
  });

  it("changes only for contributors, never while a change waits, and is recorded", async () => {
    const task = (await q<{ id: string }>("select public.app_create_task($1, $2, $3, 'Mode change') as id", [org, USERS.alice, project]))[0]!.id;
    await expect(setMode(task, "learn", USERS.bob)).rejects.toThrow(/FORBIDDEN/);
    await expect(setMode(task, "teach")).rejects.toThrow(/INVALID_MODE/);
    await setMode(task, "audit");
    expect((await admin<{ mode: string }>("select mode from public.tasks where id = $1", [task]))[0]!.mode).toBe("audit");
    expect(await admin("select metadata from public.audit_events where target = $1 and action = 'task.mode_changed'", [task])).toEqual([{ metadata: { from: "build", to: "audit" } }]);
    const pending = await approvedTask("build");
    await propose(pending, 1);
    await expect(setMode(pending, "audit")).rejects.toThrow(/PROPOSAL_PENDING/);
    await expect(as(db, "authenticated", USERS.alice, () => db.query("select public.app_set_task_mode($1, $2, 'learn')", [task, USERS.alice]))).rejects.toThrow(/permission denied/);
  });
});

describe("notes", () => {
  const note = (task: string, kind: string, actor: string = USERS.alice) => q("select public.app_record_task_note($1, $2, $3, $4, 'claude-sonnet-5-5') as id", [task, actor, kind, JSON.stringify({ summary: "s", points: [], uncertainty: "" })]);

  it("keeps a note that matches the task's mode, for contributors, readable by members", async () => {
    const learn = await approvedTask("learn");
    await expect(note(learn, "explanation")).resolves.toHaveLength(1);
    await expect(note(learn, "audit")).rejects.toThrow(/WRONG_MODE/);
    await expect(note(learn, "explanation", USERS.bob)).rejects.toThrow(/FORBIDDEN/);
    expect(await as(db, "authenticated", USERS.alice, async () => (await db.query("select kind from public.task_notes where task_id = $1", [learn])).rows)).toEqual([{ kind: "explanation" }]);
    expect(await as(db, "authenticated", USERS.bob, async () => (await db.query("select kind from public.task_notes where task_id = $1", [learn])).rows)).toEqual([]);
  });

  it("is metered as task_note", async () => {
    const from = new Date(Date.now() - 86_400_000).toISOString();
    const to = new Date(Date.now() + 86_400_000).toISOString();
    const grant = JSON.stringify({ kind: "plan", units: 1_000, starts_at: from, expires_at: to, source_key: "plan:task-note-test" });
    await expect(q("select public.app_reserve_usage($1, $2, 'k-note', 'task_note', null, 30, $3)", [org, USERS.alice, grant])).resolves.toHaveLength(1);
  });
});
