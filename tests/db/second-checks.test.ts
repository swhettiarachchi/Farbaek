/**
 * Migration v75: the second check on a change (ADR 0121) is metered as
 * second_check and kept with a pending proposal, written only by the server
 * for a contributor of that workspace, one per proposal, each recorded.
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

let seq = 0;
const step = (from: string, to: string, type: string, actor_kind?: "agent" | "system") => ({ event_id: `e-${++seq}`, event_type: type, from, to, ...(actor_kind ? { actor_kind, actor_id: "farbaek" } : {}) });
const version = async (task: string) => (await admin<{ version: number }>("select version from public.tasks where id = $1", [task]))[0]!.version;

/** A task with an approved contract and one pending proposal. */
async function pendingProposal(title: string): Promise<{ task: string; proposal: string }> {
  const task = (await q<{ id: string }>("select public.app_create_task($1, $2, $3, $4) as id", [org, USERS.alice, project, title]))[0]!.id;
  const body = JSON.stringify({ schema: "farbaek.intent-contract/v1", version: 1 });
  await q("select public.app_save_contract($1, $2, $3, $4, 0, 0, $5)", [task, USERS.alice, body, H("c"), JSON.stringify([step("RECEIVED", "CONTEXT_ASSEMBLED", "assemble_context"), step("CONTEXT_ASSEMBLED", "CONTRACT_DRAFTED", "draft_contract")])]);
  await q("select public.app_approve_contract($1, $2, 1, $3, 2, $4)", [task, USERS.alice, H("c"), JSON.stringify([step("CONTRACT_DRAFTED", "CONTRACT_APPROVED", "approve_contract")])]);
  const base = (await admin<{ revision: number }>("select revision from public.project_files where project_id = $1 and path = 'src/cart.ts'", [project]))[0]!.revision;
  const content = `export const max = ${++seq};\n`;
  const change = { path: "src/cart.ts", kind: "edit", base_revision: base, content, sha256: sha(content), reason: "r" };
  const proposal = (
    await q<{ id: string }>("select public.app_create_proposal($1, $2, 1, $3, $4, '[]', '[]', $5, 'claude-opus-5-5', 100, 50, $6, $7, $8, 1000, $9, $10) as id", [
      task,
      USERS.alice,
      JSON.stringify({ summary: "s", steps: [], risks: [], checks: [] }),
      JSON.stringify([change]),
      H("b"),
      await version(task),
      JSON.stringify([step("CONTRACT_APPROVED", "PLAN_PROPOSED", "propose_plan", "agent"), step("PLAN_PROPOSED", "POLICY_EVALUATED", "evaluate_policy", "system"), step("POLICY_EVALUATED", "APPROVAL_PENDING", "require_approval", "system")]),
      JSON.stringify({ outcome: "REQUIRE_APPROVAL", version: H("e"), findings: [] }),
      new Date(Date.now() - 86_400_000).toISOString(),
      new Date(Date.now() + 86_400_000).toISOString(),
    ])
  )[0]!.id;
  return { task, proposal };
}

const result = (verdict: string, findings: unknown = [{ topic: "risk", severity: "concern", path: "src/cart.ts", detail: "No test." }]) =>
  JSON.stringify({ verdict, summary: "One risk.", findings, uncertainty: "", truncated: [] });
const record = (proposal: string, actor: string, verdict = "concerns", body = result(verdict), model = "gpt-6.1-terra", independent: boolean | null = true) =>
  q("select public.app_record_second_check($1, $2, $3, $4, $5, $6)", [proposal, actor, verdict, body, model, independent]);

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

describe("second checks", () => {
  it("meters the call as second_check", async () => {
    const from = new Date(Date.now() - 86_400_000).toISOString();
    const to = new Date(Date.now() + 86_400_000).toISOString();
    const grant = JSON.stringify({ kind: "plan", units: 1_000, starts_at: from, expires_at: to, source_key: "plan:second-check-test" });
    await expect(q("select public.app_reserve_usage($1, $2, 'k-second', 'second_check', null, 30, $3)", [org, USERS.alice, grant])).resolves.toHaveLength(1);
  });

  it("keeps one check per pending proposal, replacing it when asked again, and records each with its verdict", async () => {
    const { proposal } = await pendingProposal("Check it");
    await record(proposal, USERS.alice, "concerns");
    await record(proposal, USERS.alice, "consistent", result("consistent", []), "claude-opus-5-5", false);
    const rows = await admin("select verdict, model, independent, created_by, result from public.proposal_second_checks where proposal_id = $1", [proposal]);
    expect(rows).toEqual([expect.objectContaining({ verdict: "consistent", model: "claude-opus-5-5", independent: false, created_by: USERS.alice, result: expect.objectContaining({ findings: [] }) })]);
    const audit = await admin<{ metadata: Record<string, unknown> }>("select metadata from public.audit_events where action = 'proposal.second_checked' and target = $1 order by id", [proposal]);
    expect(audit.map((a) => a.metadata)).toEqual([
      { model: "gpt-6.1-terra", verdict: "concerns", independent: true, findings: 1 },
      { model: "claude-opus-5-5", verdict: "consistent", independent: false, findings: 0 },
    ]);
  });

  it("refuses other workspaces, viewers, closed proposals and malformed checks, recording nothing", async () => {
    const { task, proposal } = await pendingProposal("Refusals");
    await expect(record(proposal, USERS.bob)).rejects.toThrow(/FORBIDDEN|NOT_MEMBER|permission/i);
    await admin("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'viewer')", [org, USERS.bob]);
    await expect(record(proposal, USERS.bob)).rejects.toThrow(/FORBIDDEN|permission/i);
    await admin("delete from public.organization_members where org_id = $1 and user_id = $2", [org, USERS.bob]);
    await expect(record(proposal, USERS.alice, "approve")).rejects.toThrow(/INVALID_PROPOSAL/);
    await expect(record(proposal, USERS.alice, "concerns", JSON.stringify({ findings: "none" }))).rejects.toThrow(/INVALID_PROPOSAL/);
    await expect(record(proposal, USERS.alice, "concerns", result("concerns"), "")).rejects.toThrow(/INVALID_PROPOSAL/);
    await expect(record(proposal, USERS.alice, "concerns", result("concerns"), "m", null)).rejects.toThrow(/INVALID_PROPOSAL/);
    expect(await admin("select 1 from public.audit_events where action = 'proposal.second_checked' and target = $1", [proposal])).toEqual([]);
    await q("select public.app_discard_proposal($1, $2, $3, $4)", [proposal, USERS.alice, await version(task), JSON.stringify([step("APPROVAL_PENDING", "CONTRACT_APPROVED", "discard_plan")])]);
    await expect(record(proposal, USERS.alice)).rejects.toThrow(/PROPOSAL_CLOSED/);
  });

  it("shows members their own workspace's checks, lets only the server write, and goes with its proposal", async () => {
    const { proposal } = await pendingProposal("Reading");
    await record(proposal, USERS.alice);
    expect((await asUser(USERS.alice, () => db.query("select verdict from public.proposal_second_checks where proposal_id = $1", [proposal]))).rows).toHaveLength(1);
    expect((await asUser(USERS.bob, () => db.query("select proposal_id from public.proposal_second_checks"))).rows).toEqual([]);
    await expect(asUser(USERS.alice, () => db.query("select public.app_record_second_check($1, $2, 'consistent', $3, 'm', true)", [proposal, USERS.alice, result("consistent")]))).rejects.toThrow(/permission denied/);
    await expect(as(db, "anon", null, () => db.query("select public.app_record_second_check($1, $2, 'consistent', $3, 'm', true)", [proposal, USERS.alice, result("consistent")]))).rejects.toThrow(/permission denied/);
    await expect(asUser(USERS.alice, () => db.query("update public.proposal_second_checks set verdict = 'consistent'"))).rejects.toThrow(/permission denied/);
    await admin("delete from public.change_proposals where id = $1", [proposal]);
    expect(await admin("select 1 from public.proposal_second_checks where proposal_id = $1", [proposal])).toEqual([]);
  });
});
