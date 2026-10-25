/**
 * Migration v51: the shape of past changes for policy replay (ADR 0081).
 * Paths and kinds only, never content; members only, through RLS.
 */
import { createHash } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let project: string;
const asService = <T>(fn: () => Promise<T>) => as(db, "service_role", null, fn);
const admin = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => asService(async () => (await db.query<T>(sql, params)).rows);
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const H = (c: string) => c.repeat(64);
let seq = 0;
const step = (from: string, to: string, type: string, actor_kind?: "agent" | "system") => ({ event_id: `pr-${++seq}`, event_type: type, from, to, ...(actor_kind ? { actor_kind, actor_id: "farbaek" } : {}) });
const version = async (task: string) => (await admin<{ version: number }>("select version from public.tasks where id = $1", [task]))[0]!.version;

async function proposal(title: string, checks: string[]) {
  const task = (await q<{ id: string }>("select public.app_create_task($1, $2, $3, $4) as id", [org, USERS.alice, project, title]))[0]!.id;
  await q("select public.app_save_contract($1, $2, $3, $4, 0, 0, $5)", [
    task,
    USERS.alice,
    JSON.stringify({ schema: "farbaek.intent-contract/v1", version: 1, requiredChecks: checks }),
    H("c"),
    JSON.stringify([step("RECEIVED", "CONTEXT_ASSEMBLED", "assemble_context"), step("CONTEXT_ASSEMBLED", "CONTRACT_DRAFTED", "draft_contract")]),
  ]);
  await q("select public.app_approve_contract($1, $2, 1, $3, 2, $4)", [task, USERS.alice, H("c"), JSON.stringify([step("CONTRACT_DRAFTED", "CONTRACT_APPROVED", "approve_contract")])]);
  const content = "secret-looking content that replay must never return";
  await q("select public.app_create_proposal($1, $2, 1, $3, $4, '[]', '[]', $5, 'm', 1, 1, $6, $7, $8, 1000, $9, $10)", [
    task,
    USERS.alice,
    JSON.stringify({ summary: "s", steps: [], risks: [], checks: [] }),
    JSON.stringify([{ path: `src/${++seq}.ts`, kind: "create", base_revision: 0, content, sha256: sha(content), reason: "r" }]),
    H("b"),
    await version(task),
    JSON.stringify([step("CONTRACT_APPROVED", "PLAN_PROPOSED", "propose_plan", "agent"), step("PLAN_PROPOSED", "POLICY_EVALUATED", "evaluate_policy", "system"), step("POLICY_EVALUATED", "APPROVAL_PENDING", "require_approval", "system")]),
    JSON.stringify({ outcome: "REQUIRE_APPROVAL", version: H("e"), findings: [] }),
    new Date(Date.now() - 86_400_000).toISOString(),
    new Date(Date.now() + 86_400_000).toISOString(),
  ]);
}

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  await createOrg(db, USERS.bob, "Bob Labs");
  project = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Storefront', null, null) as id", [org, USERS.alice]))[0]!.id;
  await proposal("With checks", ["npm test"]);
  await proposal("Without checks", []);
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("replay history", () => {
  it("returns each change's shape, never its content", async () => {
    const rows = (await as(db, "authenticated", USERS.alice, () => db.query<{ files: { path: string; kind: string }[]; has_checks: boolean; from_agent: boolean; violations: number; status: string }>("select * from public.app_replay_history($1, 30)", [org]))).rows;
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.has_checks).sort()).toEqual([false, true]);
    for (const r of rows) {
      expect(r.files).toEqual([{ path: expect.stringMatching(/^src\/\d+\.ts$/), kind: "create" }]);
      expect(r).toMatchObject({ from_agent: false, violations: 0, status: "pending" });
      expect(JSON.stringify(r)).not.toContain("secret-looking");
    }
  });

  it("shows nothing of another workspace, and nothing to the signed-out", async () => {
    expect((await as(db, "authenticated", USERS.bob, () => db.query("select * from public.app_replay_history($1, 30)", [org]))).rows).toEqual([]);
    await expect(as(db, "anon", null, () => db.query("select * from public.app_replay_history($1, 30)", [org]))).rejects.toThrow(/permission denied/);
  });
});
