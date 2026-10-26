/**
 * Migration v58 (ADR 0092): governed workflows. Creating one makes a task
 * per step; only an owner or admin approves it, and only once every step's
 * contract is approved; the server claims steps in order, stopping at
 * checkpoints, while agents are paused, past the ceiling, and on failure.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let project: string;

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const asUser = <T = Record<string, unknown>>(uid: string, sql: string, params: unknown[] = []) => as(db, "authenticated", uid, async () => (await db.query<T>(sql, params)).rows);
const admin = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const H = (c: string) => c.repeat(64);
let seq = 0;
const step = (from: string, to: string, type: string) => ({ event_id: `wf-${++seq}`, event_type: type, from, to });

const create = (steps: { title: string; checkpoint?: boolean }[], ceiling = 3_000, actor: string = USERS.alice) =>
  q<{ id: string }>("select public.app_create_workflow($1, $2, $3, 'Checkout in three steps', $4, $5) as id", [org, actor, project, JSON.stringify(steps), ceiling]).then((r) => r[0]!.id);
const steps = (wf: string) => admin<{ position: number; task_id: string; status: string; run_id: string | null }>("select position, task_id, status, run_id from public.workflow_steps where workflow_id = $1 order by position", [wf]);
const workflow = async (wf: string) => (await admin<{ status: string; waiting_reason: string | null; halted_reason: string | null }>("select status, waiting_reason, halted_reason from public.workflows where id = $1", [wf]))[0]!;
const claim = (wf: string) => q<{ result: string; step: number | null; task_id: string | null; cap_units: number | null; approved_by: string | null }>("select * from public.app_workflow_claim_next($1)", [wf]).then((r) => r[0]!);
const result = (wf: string, position: number, r: string, detail: string | null = null) => q("select public.app_workflow_step_result($1, $2::smallint, $3, $4)", [wf, position, r, detail]);

async function approveContract(task: string) {
  await q("select public.app_save_contract($1, $2, $3, $4, 0, 0, $5)", [task, USERS.alice, JSON.stringify({ schema: "farbaek.intent-contract/v1", version: 1 }), H("c"), JSON.stringify([step("RECEIVED", "CONTEXT_ASSEMBLED", "assemble_context"), step("CONTEXT_ASSEMBLED", "CONTRACT_DRAFTED", "draft_contract")])]);
  await q("select public.app_approve_contract($1, $2, 1, $3, 2, $4)", [task, USERS.alice, H("c"), JSON.stringify([step("CONTRACT_DRAFTED", "CONTRACT_APPROVED", "approve_contract")])]);
}

async function approved(list: { title: string; checkpoint?: boolean }[], ceiling = 3_000) {
  const wf = await create(list, ceiling);
  for (const s of await steps(wf)) await approveContract(s.task_id);
  await q("select public.app_approve_workflow($1, $2, $3)", [wf, USERS.alice, H("a")]);
  return wf;
}

async function startRun(task: string, cap: number) {
  return (await q<{ id: string }>("select public.app_start_agent_run($1, $2, $3, 'balanced', 'sandboxed', 1, $4, $5) as id", [org, USERS.alice, task, H("c"), cap]))[0]!.id;
}

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  await createOrg(db, USERS.bob, "Bob Labs");
  await admin("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'member')", [org, USERS.bob]);
  project = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Storefront', null, null) as id", [org, USERS.alice]))[0]!.id;
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("creating and approving", () => {
  it("makes a task per step, and keeps browsers out", async () => {
    const wf = await create([{ title: "Cart model" }, { title: "Checkout API" }, { title: "Checkout page", checkpoint: true }], 3_000, USERS.bob);
    const s = await steps(wf);
    expect(s.map((x) => [x.position, x.status])).toEqual([
      [1, "pending"],
      [2, "pending"],
      [3, "pending"],
    ]);
    expect((await admin<{ title: string }>("select title from public.tasks where id = $1", [s[2]!.task_id]))[0]!.title).toBe("Checkout page");
    await expect(q("select public.app_create_workflow($1, $2, $3, 'Too short', $4, 3000)", [org, USERS.alice, project, JSON.stringify([{ title: "One step" }])])).rejects.toThrow(/INVALID_WORKFLOW/);
    await expect(asUser(USERS.alice, "update public.workflows set status = 'approved'")).rejects.toThrow(/permission denied/);
    await expect(asUser(USERS.alice, "select public.app_workflow_claim_next($1)", [wf])).rejects.toThrow(/permission denied/);
    expect(await asUser(USERS.bob, "select id from public.workflows where id = $1", [wf])).toHaveLength(1);
  });

  it("is approved only by an owner or admin, once every contract is approved", async () => {
    const wf = await create([{ title: "Cart model" }, { title: "Checkout API" }]);
    const s = await steps(wf);
    await approveContract(s[0]!.task_id);
    await expect(q("select public.app_approve_workflow($1, $2, $3)", [wf, USERS.alice, H("a")])).rejects.toThrow(/CONTRACTS_NOT_APPROVED/);
    await approveContract(s[1]!.task_id);
    await expect(q("select public.app_approve_workflow($1, $2, $3)", [wf, USERS.bob, H("a")])).rejects.toThrow(/FORBIDDEN/);
    await q("select public.app_approve_workflow($1, $2, $3)", [wf, USERS.alice, H("a")]);
    expect((await workflow(wf)).status).toBe("approved");
    await expect(q("select public.app_approve_workflow($1, $2, $3)", [wf, USERS.alice, H("a")])).rejects.toThrow(/WORKFLOW_CLOSED/);
    // A draft can't be claimed.
    const draft = await create([{ title: "One more" }, { title: "And another" }]);
    expect((await claim(draft)).result).toBe("draft");
  });
});

describe("running in order", () => {
  it("claims steps one at a time, each capped at its share, and waits at a checkpoint until a person continues", async () => {
    const wf = await approved([{ title: "Cart model", checkpoint: true }, { title: "Checkout API" }, { title: "Checkout page" }], 3_000);
    const first = await claim(wf);
    expect(first).toMatchObject({ result: "started", step: 1, cap_units: 1_000, approved_by: USERS.alice });
    expect((await claim(wf)).result).toBe("busy");
    const run = await startRun(first.task_id!, first.cap_units!);
    await q("select public.app_workflow_attach_run($1, 1::smallint, $2)", [wf, run]);

    await result(wf, 1, "verified");
    expect(await claim(wf)).toMatchObject({ result: "checkpoint", step: 1 });
    expect(await workflow(wf)).toMatchObject({ status: "waiting", waiting_reason: "checkpoint" });
    expect((await claim(wf)).result).toBe("waiting");
    await q("select public.app_continue_workflow($1, $2)", [wf, USERS.bob]);
    expect(await claim(wf)).toMatchObject({ result: "started", step: 2 });
  });

  it("waits while a change is reviewed, halts on a failure, and finishes after the last step", async () => {
    const wf = await approved([{ title: "Step one here" }, { title: "Step two here" }]);
    await claim(wf);
    await result(wf, 1, "waiting", "The change is waiting for review.");
    expect(await workflow(wf)).toMatchObject({ status: "waiting", waiting_reason: "review" });
    await expect(q("select public.app_continue_workflow($1, $2)", [wf, USERS.alice])).rejects.toThrow(/NOT_AT_CHECKPOINT/);
    await result(wf, 1, "verified");
    await claim(wf);
    await result(wf, 2, "verified");
    expect((await claim(wf)).result).toBe("finished");
    expect((await workflow(wf)).status).toBe("finished");

    const failing = await approved([{ title: "Will fail here" }, { title: "Never reached" }]);
    await claim(failing);
    await result(failing, 1, "failed", "The checks failed.");
    expect(await workflow(failing)).toMatchObject({ status: "halted", halted_reason: "The checks failed." });
    expect((await claim(failing)).result).toBe("halted");
  });

  it("doesn't start a step while agents are paused, past the ceiling, or after cancelling", async () => {
    const wf = await approved([{ title: "Paused step" }, { title: "Next step" }], 2_000);
    await admin("update public.organizations set agents_paused_at = now(), agents_paused_by = $2, agents_paused_reason = 'Checking an incident first.' where id = $1", [org, USERS.alice]);
    try {
      expect((await claim(wf)).result).toBe("paused");
    } finally {
      await admin("update public.organizations set agents_paused_at = null, agents_paused_by = null, agents_paused_reason = null where id = $1", [org]);
    }
    const first = await claim(wf);
    // A run that was given more than its share leaves no room for the next step.
    const run = await startRun(first.task_id!, 1_500);
    await q("select public.app_workflow_attach_run($1, 1::smallint, $2)", [wf, run]);
    await result(wf, 1, "verified");
    expect((await claim(wf)).result).toBe("ceiling");
    expect((await workflow(wf)).status).toBe("halted");

    const cancelled = await approved([{ title: "First of two" }, { title: "Second of two" }]);
    await q("select public.app_cancel_workflow($1, $2)", [cancelled, USERS.bob]);
    expect((await claim(cancelled)).result).toBe("cancelled");
    expect((await steps(cancelled)).map((s) => s.status)).toEqual(["cancelled", "cancelled"]);
  });
});
