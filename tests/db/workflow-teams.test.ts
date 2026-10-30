/**
 * Migration v79 (ADR 0128): agent teams. Steps marked "together" share a
 * stage, at most 3; the server claims every step of the current stage, the
 * next stage only once all of them are verified, holds a stage behind a
 * checkpoint, halts on a teammate's failure, and keeps waiting while a
 * teammate's change waits for review.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let project: string;

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const admin = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const H = (c: string) => c.repeat(64);
let seq = 0;
const step = (from: string, to: string, type: string) => ({ event_id: `wf-${++seq}`, event_type: type, from, to });

const create = (steps: { title: string; checkpoint?: boolean; together?: boolean }[], ceiling = 3_000, actor: string = USERS.alice) =>
  q<{ id: string }>("select public.app_create_workflow($1, $2, $3, 'Checkout in three steps', $4, $5) as id", [org, actor, project, JSON.stringify(steps), ceiling]).then((r) => r[0]!.id);
const steps = (wf: string) => admin<{ position: number; stage: number; task_id: string; status: string; run_id: string | null }>("select position, stage, task_id, status, run_id from public.workflow_steps where workflow_id = $1 order by position", [wf]);
const workflow = async (wf: string) => (await admin<{ status: string; waiting_reason: string | null; halted_reason: string | null }>("select status, waiting_reason, halted_reason from public.workflows where id = $1", [wf]))[0]!;
const claim = (wf: string) => q<{ result: string; step: number | null; task_id: string | null; cap_units: number | null; approved_by: string | null }>("select * from public.app_workflow_claim_next($1)", [wf]).then((r) => r[0]!);
const result = (wf: string, position: number, r: string, detail: string | null = null) => q("select public.app_workflow_step_result($1, $2::smallint, $3, $4)", [wf, position, r, detail]);

async function approveContract(task: string) {
  await q("select public.app_save_contract($1, $2, $3, $4, 0, 0, $5)", [task, USERS.alice, JSON.stringify({ schema: "farbaek.intent-contract/v1", version: 1 }), H("c"), JSON.stringify([step("RECEIVED", "CONTEXT_ASSEMBLED", "assemble_context"), step("CONTEXT_ASSEMBLED", "CONTRACT_DRAFTED", "draft_contract")])]);
  await q("select public.app_approve_contract($1, $2, 1, $3, 2, $4)", [task, USERS.alice, H("c"), JSON.stringify([step("CONTRACT_DRAFTED", "CONTRACT_APPROVED", "approve_contract")])]);
}

async function approved(list: { title: string; checkpoint?: boolean; together?: boolean }[], ceiling = 3_000) {
  const wf = await create(list, ceiling);
  for (const s of await steps(wf)) await approveContract(s.task_id);
  await q("select public.app_approve_workflow($1, $2, $3)", [wf, USERS.alice, H("a")]);
  return wf;
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

describe("agent teams", () => {
  it("puts steps marked together in one stage, at most 3, and keeps others one per stage", async () => {
    const wf = await create([{ title: "Cart model" }, { title: "Cart page", together: true }, { title: "Checkout API" }]);
    expect((await steps(wf)).map((s) => [s.position, s.stage])).toEqual([
      [1, 1],
      [2, 1],
      [3, 2],
    ]);
    await expect(create([{ title: "One" }, { title: "Two", together: true }, { title: "Three", together: true }, { title: "Four", together: true }])).rejects.toThrow(/TEAM_TOO_LARGE/);
    await expect(q("select public.app_create_workflow($1, $2, $3, 'Bad flag', $4, 3000)", [org, USERS.alice, project, JSON.stringify([{ title: "One" }, { title: "Two", together: "yes" }])])).rejects.toThrow(/INVALID_WORKFLOW/);
    // The first step can't join a stage before it.
    const first = await create([{ title: "First", together: true }, { title: "Second" }]);
    expect((await steps(first)).map((s) => s.stage)).toEqual([1, 2]);
  });

  it("starts every step of the stage, and the next stage only once all of them are verified", async () => {
    const wf = await approved([{ title: "Cart model" }, { title: "Cart page", together: true }, { title: "Checkout API" }], 3_000);
    expect(await claim(wf)).toMatchObject({ result: "started", step: 1 });
    expect(await claim(wf)).toMatchObject({ result: "started", step: 2 });
    expect(await claim(wf)).toMatchObject({ result: "busy" });
    await result(wf, 1, "verified");
    expect(await claim(wf)).toMatchObject({ result: "busy" });
    await result(wf, 2, "verified");
    expect(await claim(wf)).toMatchObject({ result: "started", step: 3 });
    await result(wf, 3, "verified");
    expect(await claim(wf)).toMatchObject({ result: "finished" });
  });

  it("holds the whole next stage behind a checkpoint in the stage before", async () => {
    const wf = await approved([{ title: "Cart model", checkpoint: true }, { title: "Cart page", together: true }, { title: "Checkout API" }]);
    await claim(wf);
    await claim(wf);
    await result(wf, 1, "verified");
    await result(wf, 2, "verified");
    expect(await claim(wf)).toMatchObject({ result: "checkpoint", step: 2 });
    expect((await workflow(wf)).waiting_reason).toBe("checkpoint");
    await q("select public.app_continue_workflow($1, $2)", [wf, USERS.alice]);
    expect(await claim(wf)).toMatchObject({ result: "started", step: 3 });
  });

  it("stops when a teammate fails, and keeps waiting while a teammate's change waits for review", async () => {
    const failing = await approved([{ title: "Cart model" }, { title: "Cart page", together: true }]);
    await claim(failing);
    await claim(failing);
    await result(failing, 1, "failed", "Checks failed.");
    expect(await workflow(failing)).toMatchObject({ status: "halted", halted_reason: "Checks failed." });
    // The teammate already working still records its own result.
    await result(failing, 2, "verified");
    expect((await steps(failing)).map((s) => s.status)).toEqual(["failed", "verified"]);
    expect((await workflow(failing)).status).toBe("halted");

    const review = await approved([{ title: "Cart model" }, { title: "Cart page", together: true }, { title: "Checkout API" }]);
    await claim(review);
    await claim(review);
    await result(review, 1, "waiting");
    await result(review, 2, "verified");
    expect(await workflow(review)).toMatchObject({ status: "waiting", waiting_reason: "review" });
    await result(review, 1, "verified");
    expect((await workflow(review)).status).toBe("running");
    expect(await claim(review)).toMatchObject({ result: "started", step: 3 });
  });

  it("runs a workflow without teams exactly as before", async () => {
    const wf = await approved([{ title: "Cart model" }, { title: "Checkout API" }]);
    expect((await steps(wf)).map((s) => s.stage)).toEqual([1, 2]);
    expect(await claim(wf)).toMatchObject({ result: "started", step: 1 });
    expect(await claim(wf)).toMatchObject({ result: "busy" });
    await result(wf, 1, "verified");
    expect(await claim(wf)).toMatchObject({ result: "started", step: 2 });
  });
});
