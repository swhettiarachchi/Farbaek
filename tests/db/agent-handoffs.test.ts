/**
 * Migration v84: Continue on my computer (ADR 0139). A contributor hands a
 * task to one of the workspace's computers, one open at a time per
 * computer; only that computer opens it and reports once, with the whole
 * report and its digest.
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
const DAY = 86_400_000;

let seq = 0;
const step = (from: string, to: string, type: string, actor_kind?: "agent" | "system") => ({ event_id: `ho-${++seq}`, event_type: type, from, to, ...(actor_kind ? { actor_kind, actor_id: "farbaek" } : {}) });
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



beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  await createOrg(db, USERS.bob, "Bob Labs");
  project = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Storefront', null, null) as id", [org, USERS.alice]))[0]!.id;
}, 60_000);

afterAll(async () => {
  await db.close();
});

let agents = 0;
const newAgent = async (orgId: string = org, revoked = false) =>
  (await admin<{ id: string }>(`insert into public.agents (org_id, name, platform, token_sha256, paired_by${revoked ? ", revoked_at" : ""}) values ($1, $2, 'windows', $3, $4${revoked ? ", now()" : ""}) returning id`, [orgId, `Desk ${++agents}`, sha(`token-${agents}-${Math.random()}`), USERS.alice]))[0]!.id;
const CHECKS = JSON.stringify(["npm test", "npm run build"]);
const request = (task: string, agent: string, proposal: string | null = null, actor: string = USERS.alice, checks = CHECKS) =>
  q<{ id: string }>("select public.app_request_handoff($1, $2, $3, $4, $5, $6, 'Try it on the real data') as id", [org, actor, task, agent, proposal, checks]).then((r) => r[0]!.id);
const finish = (agent: string, id: string, status: string, result: unknown, digest: string | null, reason: string | null = null) =>
  q("select public.app_agent_finish_handoff($1, $2, $3, $4, $5, $6, $7)", [org, agent, id, status, result === null ? null : JSON.stringify(result), digest, reason]);
const REPORT = { checks: [{ command: "npm test", exitCode: 0, durationMs: 1200, timedOut: false, outputSha256: null, output: "ok", skipped: null }], proposalSha256: null, notCopied: 0, platform: "windows" };

describe("handing a task to a computer", () => {
  it("records the change waiting for review by its hash, one open handoff per task and computer, with an audit event", async () => {
    const { task, proposal } = await pending("Handoff");
    const agent = await newAgent();
    const id = await request(task, agent, proposal);
    expect((await admin<{ status: string; proposal_sha256: string; checks: string[] }>("select status, proposal_sha256, checks from public.agent_handoffs where id = $1", [id]))[0]).toEqual({ status: "waiting", proposal_sha256: H("b"), checks: ["npm test", "npm run build"] });
    await expect(request(task, agent, proposal)).rejects.toThrow(/HANDOFF_OPEN/);
    expect((await admin<{ action: string }>("select action from public.audit_events order by id desc limit 1"))[0]!.action).toBe("handoff.requested");
    // Another computer can take the same task.
    await expect(request(task, await newAgent(), proposal)).resolves.toMatch(/[0-9a-f-]{36}/);
  });

  it("only goes to a computer the person paired themselves, since it runs the project's code there (ADR 0175)", async () => {
    await admin("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'member') on conflict do nothing", [org, USERS.bob]);
    const { task, proposal } = await pending("Someone else's computer");
    const alices = await newAgent();
    await expect(request(task, alices, proposal, USERS.bob)).rejects.toThrow(/AGENT_NOT_FOUND/);
    const bobs = (await admin<{ id: string }>("insert into public.agents (org_id, name, platform, token_sha256, paired_by) values ($1, 'Bob laptop', 'windows', $2, $3) returning id", [org, H("9"), USERS.bob]))[0]!.id;
    await expect(request(task, bobs, proposal, USERS.bob)).resolves.toMatch(/[0-9a-f-]{36}/);
    await admin("delete from public.organization_members where org_id = $1 and user_id = $2", [org, USERS.bob]);
  });

  it("refuses outsiders, revoked or foreign computers, a change that isn't waiting, and bad checks", async () => {
    const { task, proposal } = await pending("Refused");
    const agent = await newAgent();
    await expect(request(task, agent, proposal, USERS.bob)).rejects.toThrow(/NOT_A_MEMBER|FORBIDDEN|NOT_FOUND/);
    await expect(request(task, await newAgent(org, true), proposal)).rejects.toThrow(/AGENT_NOT_FOUND/);
    const bobs = (await admin<{ id: string }>("select id from public.organizations where name = 'Bob Labs'"))[0]!.id;
    await expect(request(task, await newAgent(bobs), proposal)).rejects.toThrow(/AGENT_NOT_FOUND/);
    await expect(request(task, agent, proposal, USERS.alice, "[]")).rejects.toThrow(/INVALID_REQUEST/);
    await expect(request(task, agent, proposal, USERS.alice, JSON.stringify([1]))).rejects.toThrow(/INVALID_REQUEST/);
    await admin("update public.change_proposals set status = 'discarded', decided_at = now() where id = $1", [proposal]);
    await expect(request(task, agent, proposal)).rejects.toThrow(/INVALID_TRANSITION/);
    await expect(request(task, agent, null)).resolves.toMatch(/[0-9a-f-]{36}/);
  });

  it("lets a contributor withdraw an open one, and lapses one after a day", async () => {
    const { task } = await pending("Withdraw");
    const agent = await newAgent();
    const id = await request(task, agent);
    await q("select public.app_cancel_handoff($1, $2)", [id, USERS.alice]);
    await expect(q("select public.app_cancel_handoff($1, $2)", [id, USERS.alice])).rejects.toThrow(/INVALID_TRANSITION/);
    const again = await request(task, agent);
    await admin("update public.agent_handoffs set expires_at = now() - interval '1 minute' where id = $1", [again]);
    await expect(request(task, agent)).resolves.toMatch(/[0-9a-f-]{36}/);
    expect((await admin<{ status: string }>("select status from public.agent_handoffs where id = $1", [again]))[0]!.status).toBe("expired");
  });
});

describe("the computer's side", () => {
  it("opens and reports only for the computer it was handed to, once, with the whole report and its digest", async () => {
    const { task } = await pending("Report");
    const agent = await newAgent();
    const other = await newAgent();
    const id = await request(task, agent);
    await expect(q("select public.app_agent_open_handoff($1, $2, $3)", [org, other, id])).rejects.toThrow(/NOT_FOUND/);
    await q("select public.app_agent_open_handoff($1, $2, $3)", [org, agent, id]);
    await expect(finish(agent, id, "done", { checks: [] }, H("d"))).rejects.toThrow(/INVALID_REQUEST/);
    await expect(finish(agent, id, "done", REPORT, null)).rejects.toThrow(/INVALID_REQUEST/);
    await expect(finish(agent, id, "done", { ...REPORT, checks: [{ ...REPORT.checks[0], output: "x".repeat(2001) }] }, H("d"))).rejects.toThrow(/INVALID_REQUEST/);
    await expect(finish(agent, id, "failed", null, null, null)).rejects.toThrow(/INVALID_REQUEST/);
    await finish(agent, id, "done", REPORT, H("d"));
    await expect(finish(agent, id, "failed", null, null, "again")).rejects.toThrow(/INVALID_TRANSITION/);
    const [row] = await admin<{ status: string; result: { platform: string; checks: unknown[] }; result_digest: string }>("select status, result, result_digest from public.agent_handoffs where id = $1", [id]);
    expect(row).toMatchObject({ status: "done", result: { platform: "windows", checks: [{ command: "npm test", exitCode: 0 }] }, result_digest: H("d") });
    expect((await admin<{ action: string; actor_id: string | null }>("select action, actor_id from public.audit_events order by id desc limit 1"))[0]).toEqual({ action: "handoff.finished", actor_id: null });
  });

  it("keeps the reason when it couldn't run, and refuses a lapsed one", async () => {
    const { task } = await pending("Failed");
    const agent = await newAgent();
    const id = await request(task, agent);
    await finish(agent, id, "failed", null, null, "npm ci failed (exit 1), so the checks didn't run.");
    expect((await admin<{ status: string; reason: string }>("select status, reason from public.agent_handoffs where id = $1", [id]))[0]).toMatchObject({ status: "failed", reason: expect.stringMatching(/npm ci failed/) });
    const lapsed = await request(task, agent);
    await admin("update public.agent_handoffs set expires_at = now() - interval '1 minute' where id = $1", [lapsed]);
    await expect(q("select public.app_agent_open_handoff($1, $2, $3)", [org, agent, lapsed])).rejects.toThrow(/INVALID_TRANSITION/);
  });
});

describe("access", () => {
  it("lets members read their workspace's handoffs and nobody write them", async () => {
    expect((await asUser(USERS.alice, () => db.query("select id from public.agent_handoffs"))).rows.length).toBeGreaterThan(0);
    expect((await asUser(USERS.bob, () => db.query("select id from public.agent_handoffs"))).rows).toEqual([]);
    await expect(asUser(USERS.alice, () => db.query("update public.agent_handoffs set status = 'done'"))).rejects.toThrow(/permission denied/);
    await expect(asUser(USERS.alice, () => db.query("select public.app_cancel_handoff($1, $2)", [org, USERS.alice]))).rejects.toThrow(/permission denied/);
  });
});
