/**
 * Migration v54: autonomy level 3 (ADR 0086). Earned from a clean record of
 * changes applied on their own, bounded by a daily budget, and paused like
 * level 2 when one fails.
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
const step = (from: string, to: string, type: string, actor_kind?: "agent" | "system") => ({ event_id: `l3-${++seq}`, event_type: type, from, to, ...(actor_kind ? { actor_kind, actor_id: "farbaek" } : {}) });
const version = async (task: string) => (await admin<{ version: number }>("select version from public.tasks where id = $1", [task]))[0]!.version;
const setLevel = (level: number, maxFiles: number, daily: number | null) => q("select public.app_set_autonomy($1, $2, $3, $4, true, false, $5)", [org, USERS.alice, level, maxFiles, daily]);
const autonomy = async () => (await admin<{ level: number; daily_limit: number | null; suspended_at: string | null }>("select level, daily_limit, suspended_at from public.org_autonomy where org_id = $1", [org]))[0]!;

/** A pending proposal decided with `outcome`. */
async function propose(outcome: string) {
  const task = (await q<{ id: string }>("select public.app_create_task($1, $2, $3, $4) as id", [org, USERS.alice, project, `Change ${++seq}`]))[0]!.id;
  await q("select public.app_save_contract($1, $2, $3, $4, 0, 0, $5)", [
    task,
    USERS.alice,
    JSON.stringify({ schema: "farbaek.intent-contract/v1", version: 1, requiredChecks: [] }),
    H("c"),
    JSON.stringify([step("RECEIVED", "CONTEXT_ASSEMBLED", "assemble_context"), step("CONTEXT_ASSEMBLED", "CONTRACT_DRAFTED", "draft_contract")]),
  ]);
  await q("select public.app_approve_contract($1, $2, 1, $3, 2, $4)", [task, USERS.alice, H("c"), JSON.stringify([step("CONTRACT_DRAFTED", "CONTRACT_APPROVED", "approve_contract")])]);
  const content = `x${seq}`;
  const id = (
    await q<{ id: string }>("select public.app_create_proposal($1, $2, 1, $3, $4, '[]', '[]', $5, 'm', 1, 1, $6, $7, $8, 1000, $9, $10) as id", [
      task,
      USERS.alice,
      JSON.stringify({ summary: "s", steps: [], risks: [], checks: [] }),
      JSON.stringify([{ path: `docs/${seq}.md`, kind: "create", base_revision: 0, content, sha256: sha(content), reason: "r" }]),
      H("b"),
      await version(task),
      JSON.stringify([step("CONTRACT_APPROVED", "PLAN_PROPOSED", "propose_plan", "agent"), step("PLAN_PROPOSED", "POLICY_EVALUATED", "evaluate_policy", "system"), step("POLICY_EVALUATED", "APPROVAL_PENDING", "require_approval", "system")]),
      JSON.stringify({ outcome, version: H("e"), findings: [] }),
      new Date(Date.now() - 86_400_000).toISOString(),
      new Date(Date.now() + 86_400_000).toISOString(),
    ])
  )[0]!.id;
  return { task, id };
}

/** Records a change applied on its own, then its checks' result, as ProofPacks. */
async function appliedOnOwn(status: "verified" | "failed") {
  const { task, id } = await propose("REQUIRE_APPROVAL");
  const latest = async () => (await admin<{ digest: string }>("select digest from public.proofpacks where project_id = $1 order by seq desc limit 1", [project]))[0]?.digest ?? null;
  for (const [s, approval] of [
    ["unverified", { by: "policy", autonomyLevel: 2 }],
    [status, {}],
  ] as const) {
    const statement = { _type: "https://in-toto.io/Statement/v1", predicate: { status: s, proposal: { id }, approval, nonce: ++seq } };
    await admin("insert into public.proofpacks (digest, org_id, project_id, task_id, proposal_id, status, statement, previous) values ($1, $2, $3, $4, $5, $6, $7, $8)", [
      sha(JSON.stringify(statement)),
      org,
      project,
      task,
      id,
      s,
      JSON.stringify(statement),
      await latest(),
    ]);
  }
}

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  await createOrg(db, USERS.bob, "Bob Labs");
  project = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Storefront', null, null) as id", [org, USERS.alice]))[0]!.id;
  await setLevel(2, 3, null);
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("earning level 3", () => {
  it("is refused until ten changes applied on their own passed their checks", async () => {
    await expect(setLevel(3, 8, 10)).rejects.toThrow(/AUTONOMY_NOT_EARNED/);
    for (let i = 0; i < 10; i++) await appliedOnOwn("verified");
    const record = await as(db, "authenticated", USERS.alice, () => db.query<{ verified: number; failed: number }>("select * from public.app_autonomy_record($1)", [org]));
    expect(record.rows[0]).toEqual({ verified: 10, failed: 0 });
    expect((await as(db, "authenticated", USERS.bob, () => db.query<{ verified: number }>("select * from public.app_autonomy_record($1)", [org]))).rows[0]).toEqual({ verified: 0, failed: 0 });
    await setLevel(3, 8, 10);
    expect(await autonomy()).toMatchObject({ level: 3, daily_limit: 10, suspended_at: null });
  });

  it("keeps its limits in range", async () => {
    await expect(setLevel(3, 11, 10)).rejects.toThrow(/INVALID_AUTONOMY/);
    await expect(setLevel(3, 8, 0)).rejects.toThrow(/INVALID_AUTONOMY/);
    await expect(setLevel(3, 8, null)).rejects.toThrow(/INVALID_AUTONOMY/);
    await expect(setLevel(2, 8, null)).rejects.toThrow(/INVALID_AUTONOMY/);
    await expect(admin("update public.org_autonomy set daily_limit = null where org_id = $1", [org])).rejects.toThrow(/daily_limit_check/);
  });
});

describe("running at level 3", () => {
  it("applies on its own until the daily budget is spent", async () => {
    await setLevel(3, 8, 2);
    const before = (await admin<{ n: number }>("select count(*)::int as n from public.change_proposals where org_id = $1 and policy ->> 'outcome' = 'ALLOW_WITHIN_LIMITS' and created_at >= now() - interval '24 hours'", [org]))[0]!.n;
    expect(before).toBe(0);
    await propose("ALLOW_WITHIN_LIMITS");
    await propose("ALLOW_WITHIN_LIMITS");
    await expect(propose("ALLOW_WITHIN_LIMITS")).rejects.toThrow(/AUTONOMY_DAILY_LIMIT/);
    await expect(propose("REQUIRE_APPROVAL")).resolves.toMatchObject({ id: expect.any(String) });
  });

  it("pauses after a failure, and must be earned again", async () => {
    await appliedOnOwn("failed");
    expect((await autonomy()).suspended_at).not.toBeNull();
    await expect(propose("ALLOW_WITHIN_LIMITS")).rejects.toThrow(/AUTONOMY_OFF/);
    await expect(setLevel(3, 8, 10)).rejects.toThrow(/AUTONOMY_NOT_EARNED/);
    await setLevel(2, 3, null);
    expect(await autonomy()).toMatchObject({ level: 2, daily_limit: null, suspended_at: null });
  });
});
