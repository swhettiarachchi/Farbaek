/**
 * Migration 29: an AI suggestion for the Intent Diff Lens is metered as
 * lens_mapping and kept with a pending proposal, written only by the server
 * for a contributor of that workspace.
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

const suggestion = (clause: string) => JSON.stringify({ mappings: [{ hunk: "f0h0", clause, reason: "It rejects fractional quantities." }] });
const record = (proposal: string, actor: string, body: string) => q("select public.app_record_lens_suggestion($1, $2, $3, 'claude-haiku-5-5')", [proposal, actor, body]);

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

describe("lens suggestions", () => {
  it("meters the call as lens_mapping", async () => {
    const from = new Date(Date.now() - 86_400_000).toISOString();
    const to = new Date(Date.now() + 86_400_000).toISOString();
    const grant = JSON.stringify({ kind: "plan", units: 1_000, starts_at: from, expires_at: to, source_key: "plan:lens-test" });
    await expect(q("select public.app_reserve_usage($1, $2, 'k-lens', 'lens_mapping', null, 30, $3)", [org, USERS.alice, grant])).resolves.toHaveLength(1);
  });

  it("keeps one suggestion per pending proposal, replacing it when asked again, and records each", async () => {
    const { proposal } = await pendingProposal("Map it");
    await record(proposal, USERS.alice, suggestion("AC-1"));
    await record(proposal, USERS.alice, suggestion("none"));
    const rows = await admin<{ suggestion: { mappings: { clause: string }[] }; model: string; created_by: string }>("select suggestion, model, created_by from public.proposal_lens_suggestions where proposal_id = $1", [proposal]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ model: "claude-haiku-5-5", created_by: USERS.alice, suggestion: { mappings: [{ clause: "none" }] } });
    const audit = await admin<{ n: number }>("select count(*)::int as n from public.audit_events where action = 'proposal.lens_suggested' and target = $1", [proposal]);
    expect(audit[0]!.n).toBe(2);
  });

  it("refuses other workspaces, viewers, closed proposals and malformed suggestions", async () => {
    const { task, proposal } = await pendingProposal("Refusals");
    await expect(record(proposal, USERS.bob, suggestion("AC-1"))).rejects.toThrow(/FORBIDDEN|NOT_MEMBER|permission/i);
    await admin("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'viewer')", [org, USERS.bob]);
    await expect(record(proposal, USERS.bob, suggestion("AC-1"))).rejects.toThrow(/FORBIDDEN|permission/i);
    await admin("delete from public.organization_members where org_id = $1 and user_id = $2", [org, USERS.bob]);
    await expect(record(proposal, USERS.alice, JSON.stringify({ mappings: "AC-1" }))).rejects.toThrow(/INVALID_PROPOSAL/);
    await q("select public.app_discard_proposal($1, $2, $3, $4)", [proposal, USERS.alice, await version(task), JSON.stringify([step("APPROVAL_PENDING", "CONTRACT_APPROVED", "discard_plan")])]);
    await expect(record(proposal, USERS.alice, suggestion("AC-1"))).rejects.toThrow(/PROPOSAL_CLOSED/);
  });

  it("shows members their own workspace's suggestions, lets only the server write, and goes with its proposal", async () => {
    const { proposal } = await pendingProposal("Reading");
    await record(proposal, USERS.alice, suggestion("outcome"));
    expect((await asUser(USERS.alice, () => db.query("select proposal_id from public.proposal_lens_suggestions where proposal_id = $1", [proposal]))).rows).toHaveLength(1);
    expect((await asUser(USERS.bob, () => db.query("select proposal_id from public.proposal_lens_suggestions"))).rows).toEqual([]);
    await expect(asUser(USERS.alice, () => db.query("select public.app_record_lens_suggestion($1, $2, $3, 'm')", [proposal, USERS.alice, suggestion("AC-1")]))).rejects.toThrow(/permission denied/);
    await expect(asUser(USERS.alice, () => db.query("delete from public.proposal_lens_suggestions"))).rejects.toThrow(/permission denied/);
    await admin("delete from public.change_proposals where id = $1", [proposal]);
    expect(await admin("select 1 from public.proposal_lens_suggestions where proposal_id = $1", [proposal])).toEqual([]);
  });
});
