/**
 * Migration 6: change proposals are created, applied or discarded only
 * through the service-role functions, together with the task transitions,
 * and applying refuses anything stale or outside the proposal.
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
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const H = (c: string) => c.repeat(64);
const LIMITS = [1024 * 512, 25 * 1024 * 1024, 3000];

let seq = 0;
const step = (from: string, to: string, type: string, actor_kind?: "agent" | "system") => ({ event_id: `e-${++seq}`, event_type: type, from, to, ...(actor_kind ? { actor_kind, actor_id: "farbaek" } : {}) });

async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return asService(async () => (await db.query<T>(sql, params)).rows);
}

async function taskState(task: string) {
  return (await q<{ state: string; version: number }>("select state, version from public.tasks where id = $1", [task]))[0]!;
}

/** A task with contract version 1 approved. */
async function approvedTask(title: string): Promise<string> {
  const id = (await q<{ id: string }>("select public.app_create_task($1, $2, $3, $4) as id", [org, USERS.alice, project, title]))[0]!.id;
  const body = JSON.stringify({ schema: "farbaek.intent-contract/v1", version: 1 });
  await q("select public.app_save_contract($1, $2, $3, $4, 0, 0, $5)", [
    id,
    USERS.alice,
    body,
    H("c"),
    JSON.stringify([step("RECEIVED", "CONTEXT_ASSEMBLED", "assemble_context"), step("CONTEXT_ASSEMBLED", "CONTRACT_DRAFTED", "draft_contract")]),
  ]);
  await q("select public.app_approve_contract($1, $2, 1, $3, 2, $4)", [id, USERS.alice, H("c"), JSON.stringify([step("CONTRACT_DRAFTED", "CONTRACT_APPROVED", "approve_contract")])]);
  return id;
}

async function fileRevision(path: string): Promise<number> {
  return (await q<{ revision: number }>("select revision from public.project_files where project_id = $1 and path = $2", [project, path]))[0]?.revision ?? 0;
}

const change = (path: string, content: string, base: number) => ({ path, kind: base === 0 ? "create" : "edit", base_revision: base, content, sha256: sha(content), reason: "r" });

const PROPOSE = (blocked = false) => [
  step("CONTRACT_APPROVED", "PLAN_PROPOSED", "propose_plan", "agent"),
  step("PLAN_PROPOSED", "POLICY_EVALUATED", "evaluate_policy", "system"),
  blocked ? step("POLICY_EVALUATED", "BLOCKED", "block", "system") : step("POLICY_EVALUATED", "APPROVAL_PENDING", "require_approval", "system"),
];
const APPLY = () => [
  step("APPROVAL_PENDING", "EXECUTION_AUTHORIZED", "grant_approval"),
  step("EXECUTION_AUTHORIZED", "EXECUTING", "start_execution", "system"),
  step("EXECUTING", "VERIFYING", "begin_verification", "system"),
];

const DAY = 86_400_000;
const policy = (outcome: string) => ({ outcome, version: H("e"), findings: [] });

async function propose(
  task: string,
  changes: object[],
  opts: { violations?: object[]; steps?: object[]; contractVersion?: number; outcome?: string; limit?: number | null; actor?: string } = {},
) {
  const { version } = await taskState(task);
  const blocked = (opts.violations?.length ?? 0) > 0;
  const outcome = opts.outcome ?? (blocked ? "BLOCK" : "REQUIRE_APPROVAL");
  const rows = await q<{ id: string }>("select public.app_create_proposal($1, $2, $3, $4, $5, '[]', $6, $7, 'claude-opus-5-5', 100, 50, $8, $9, $10, $11, $12, $13) as id", [
    task,
    USERS.alice,
    opts.contractVersion ?? 1,
    JSON.stringify({ summary: "s", steps: [], risks: [], checks: [] }),
    JSON.stringify(changes),
    JSON.stringify(opts.violations ?? []),
    H("b"),
    version,
    JSON.stringify(opts.steps ?? PROPOSE(outcome === "BLOCK")),
    JSON.stringify(policy(outcome)),
    opts.limit === undefined ? 1000 : opts.limit,
    new Date(Date.now() - DAY).toISOString(),
    new Date(Date.now() + DAY).toISOString(),
  ]);
  return rows[0]!.id;
}

async function latestProofPack(): Promise<string | null> {
  return (await q<{ digest: string }>("select digest from public.proofpacks where project_id = $1 order by seq desc limit 1", [project]))[0]?.digest ?? null;
}

/** A minimal statement that satisfies the database's consistency checks. */
async function statementFor(proposal: string, files: { path: string; content: string }[], over: { previous?: string | null; proposalId?: string; status?: string } = {}) {
  const statement = {
    _type: "https://in-toto.io/Statement/v1",
    subject: files.map((f) => ({ name: f.path, digest: { sha256: sha(f.content) } })),
    predicateType: "https://farbaek.dev/proofpack/v1",
    predicate: {
      status: over.status ?? "unverified",
      proposal: { id: over.proposalId ?? proposal },
      approval: { appliedSha256: H("a") },
      previous: over.previous === undefined ? await latestProofPack() : over.previous,
      nonce: ++seq,
    },
  };
  return { statement, digest: sha(JSON.stringify(statement)) };
}

async function apply(
  proposal: string,
  task: string,
  files: { path: string; content: string }[],
  actor: string = USERS.alice,
  pack?: { statement: object; digest: string; status?: string },
) {
  const { version } = await taskState(task);
  const p: { statement: object; digest: string; status?: string } = pack ?? (await statementFor(proposal, files));
  return (
    await q<{ n: number }>("select public.app_apply_proposal($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) as n", [
      proposal,
      actor,
      JSON.stringify(files),
      H("a"),
      version,
      JSON.stringify(APPLY()),
      ...LIMITS,
      JSON.stringify(p.statement),
      p.digest,
      p.status ?? "unverified",
    ])
  )[0]!.n;
}

async function discard(proposal: string, task: string, from = "APPROVAL_PENDING") {
  const { version } = await taskState(task);
  await q("select public.app_discard_proposal($1, $2, $3, $4)", [proposal, USERS.alice, version, JSON.stringify([step(from, "CONTRACT_APPROVED", "discard_plan")])]);
}

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  await createOrg(db, USERS.bob, "Bob Labs");
  project = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Storefront', null, null) as id", [org, USERS.alice]))[0]!.id;
  await q("select public.app_import_files($1, $2, $3, 524288, 4194304, 26214400, 3000)", [
    project,
    USERS.alice,
    JSON.stringify([
      { path: "src/cart.ts", content: "export const max = 1;\n" },
      { path: "src/price.ts", content: "export const vat = 20;\n" },
    ]),
  ]);
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("creating a proposal", () => {
  it("stores it, moves the task to approval and records who decided each step", async () => {
    const task = await approvedTask("Raise the cart max");
    const id = await propose(task, [change("src/cart.ts", "export const max = 5;\n", await fileRevision("src/cart.ts"))]);
    expect((await q<{ status: string }>("select status from public.change_proposals where id = $1", [id]))[0]!.status).toBe("pending");
    expect((await taskState(task)).state).toBe("APPROVAL_PENDING");
    const actors = await q<{ event_type: string; actor_kind: string; actor_id: string }>(
      "select event_type, actor_kind, actor_id from public.task_transitions where task_id = $1 and event_type in ('propose_plan', 'evaluate_policy', 'require_approval', 'approve_contract') order by occurred_at, event_type",
      [task],
    );
    expect(Object.fromEntries(actors.map((a) => [a.event_type, `${a.actor_kind}:${a.actor_kind === "user" ? "alice" : a.actor_id}`]))).toEqual({
      approve_contract: "user:alice",
      propose_plan: "agent:farbaek",
      evaluate_policy: "system:farbaek",
      require_approval: "system:farbaek",
    });
  });

  it("blocks the task when the contract checks found violations", async () => {
    const task = await approvedTask("Touch something out of scope");
    const id = await propose(task, [change("src/new.ts", "export {};\n", 0)], { violations: [{ kind: "OUT_OF_SCOPE_PATH", detail: "x" }] });
    expect((await q<{ status: string }>("select status from public.change_proposals where id = $1", [id]))[0]!.status).toBe("blocked");
    expect((await taskState(task)).state).toBe("BLOCKED");
    await discard(id, task, "BLOCKED");
    expect((await taskState(task)).state).toBe("CONTRACT_APPROVED");
  });

  it("refuses stale bases, mismatched hashes, bad paths and unapproved contract versions, rolling everything back", async () => {
    const task = await approvedTask("Bad proposals");
    const before = await taskState(task);
    await expect(propose(task, [change("src/cart.ts", "x", 99)])).rejects.toThrow(/FILE_CHANGED/);
    await expect(propose(task, [{ ...change("src/cart.ts", "x", await fileRevision("src/cart.ts")), sha256: H("0") }])).rejects.toThrow(/INVALID_PROPOSAL/);
    await expect(propose(task, [change("../x.ts", "x", 0)])).rejects.toThrow(/INVALID_PATH/);
    await expect(propose(task, [{ ...change("src/cart.ts", "x", 0), kind: "edit" }])).rejects.toThrow(/INVALID_PROPOSAL/);
    await expect(propose(task, [change("src/z.ts", "x", 0)], { contractVersion: 2 })).rejects.toThrow(/CONTRACT_CHANGED/);
    await expect(propose(task, [change("src/z.ts", "x", 0)], { steps: PROPOSE(true) })).rejects.toThrow(/INVALID_TRANSITION/);
    expect(await taskState(task)).toEqual(before);
    expect(await q("select id from public.change_proposals where task_id = $1", [task])).toEqual([]);
  });
});

describe("applying a proposal", () => {
  it("writes the accepted content as revisions linked to the proposal and moves the task to verification", async () => {
    const task = await approvedTask("Apply it");
    const base = await fileRevision("src/price.ts");
    const id = await propose(task, [change("src/price.ts", "export const vat = 21;\n", base), change("src/vat.ts", "export const rate = 0.21;\n", 0)]);
    // The person kept the new file but changed their mind about part of the edit.
    expect(await apply(id, task, [{ path: "src/price.ts", content: "export const vat = 20; // kept\n" }, { path: "src/vat.ts", content: "export const rate = 0.21;\n" }])).toBe(2);
    expect((await taskState(task)).state).toBe("VERIFYING");
    const rows = await q<{ path: string; revision: number; proposal_id: string }>(
      "select path, revision, proposal_id from public.project_file_revisions where proposal_id = $1 order by path",
      [id],
    );
    expect(rows.map((r) => [r.path, r.revision])).toEqual([
      ["src/price.ts", base + 1],
      ["src/vat.ts", 1],
    ]);
    const [p] = await q<{ status: string; applied_sha256: string; decided_at: string | null }>("select status, applied_sha256, decided_at from public.change_proposals where id = $1", [id]);
    expect(p).toMatchObject({ status: "applied", applied_sha256: H("a") });
    await expect(apply(id, task, [{ path: "src/vat.ts", content: "again" }])).rejects.toThrow(/PROPOSAL_CLOSED/);
  });

  it("refuses files changed since the proposal, paths outside it and approvals that change nothing", async () => {
    const task = await approvedTask("Stale apply");
    const id = await propose(task, [change("src/cart.ts", "export const max = 9;\n", await fileRevision("src/cart.ts"))]);
    await expect(apply(id, task, [{ path: "src/other.ts", content: "x" }])).rejects.toThrow(/INVALID_PROPOSAL/);
    await expect(apply(id, task, [{ path: "src/cart.ts", content: (await q<{ content: string }>("select content from public.get_project_file($1, 'src/cart.ts')", [project]))[0]!.content }])).rejects.toThrow(
      /NOTHING_TO_APPLY/,
    );
    await q("select public.app_save_file($1, $2, 'src/cart.ts', 'export const max = 2;\n', $3, 524288, 26214400, 3000)", [project, USERS.alice, await fileRevision("src/cart.ts")]);
    await expect(apply(id, task, [{ path: "src/cart.ts", content: "export const max = 9;\n" }])).rejects.toThrow(/FILE_CHANGED/);
    expect((await taskState(task)).state).toBe("APPROVAL_PENDING");
    await discard(id, task);
    expect((await taskState(task)).state).toBe("CONTRACT_APPROVED");
    // A fresh proposal can follow a discarded one.
    await expect(propose(task, [change("src/cart.ts", "export const max = 3;\n", await fileRevision("src/cart.ts"))])).resolves.toMatch(/[0-9a-f-]{36}/);
  });
});

describe("policy and metering (migration 7)", () => {
  it("stores the policy decision and counts one governed evaluation per proposal", async () => {
    const task = await approvedTask("Metered");
    const before = (await q<{ n: string }>("select count(*)::text as n from public.evaluation_events where org_id = $1", [org]))[0]!.n;
    const id = await propose(task, [change("src/meter.ts", "export const m = 1;\n", 0)]);
    const [p] = await q<{ policy: { outcome: string; version: string } }>("select policy from public.change_proposals where id = $1", [id]);
    expect(p!.policy).toMatchObject({ outcome: "REQUIRE_APPROVAL", version: H("e") });
    const events = await q<{ outcome: string }>("select outcome from public.evaluation_events where org_id = $1 and idempotency_key = $2", [org, `change_proposal:${id}`]);
    expect(events).toEqual([{ outcome: "REQUIRE_APPROVAL" }]);
    const after = (await q<{ n: string }>("select count(*)::text as n from public.evaluation_events where org_id = $1", [org]))[0]!.n;
    expect(Number(after)).toBe(Number(before) + 1);
  });

  it("refuses a proposal once the evaluation allowance is used up, creating nothing", async () => {
    const task = await approvedTask("Over the limit");
    const used = Number((await q<{ n: string }>("select count(*)::text as n from public.evaluation_events where org_id = $1", [org]))[0]!.n);
    await expect(propose(task, [change("src/limit.ts", "x", 0)], { limit: used })).rejects.toThrow(/EVALUATION_LIMIT/);
    expect(await q("select id from public.change_proposals where task_id = $1", [task])).toEqual([]);
    expect((await taskState(task)).state).toBe("CONTRACT_APPROVED");
  });

  it("insists contract violations are blocked by the policy", async () => {
    const task = await approvedTask("Inconsistent policy");
    await expect(propose(task, [change("src/x.ts", "x", 0)], { violations: [{ kind: "OUT_OF_SCOPE_PATH", detail: "x" }], outcome: "REQUIRE_APPROVAL", steps: PROPOSE(true) })).rejects.toThrow(
      /INVALID_PROPOSAL/,
    );
  });

  it("lets only an owner or admin apply an escalated proposal", async () => {
    await q("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'member') on conflict do nothing", [org, USERS.bob]);
    const task = await approvedTask("Escalated");
    const id = await propose(task, [change("package.json", "{}\n", 0)], { outcome: "ESCALATE" });
    await expect(apply(id, task, [{ path: "package.json", content: "{}\n" }], USERS.bob)).rejects.toThrow(/APPROVER_ROLE_REQUIRED/);
    expect(await apply(id, task, [{ path: "package.json", content: "{}\n" }], USERS.alice)).toBe(1);
    // Keep Bob outside Alice's organization for the isolation tests that follow.
    await q("delete from public.organization_members where org_id = $1 and user_id = $2", [org, USERS.bob]);
  });
});

describe("ProofPacks (migration 8)", () => {
  it("records the ProofPack with the application, chained to the project's previous one", async () => {
    const task = await approvedTask("Evidence");
    const id = await propose(task, [change("src/evidence.ts", "export const e = 1;\n", 0)]);
    const before = await latestProofPack();
    const files = [{ path: "src/evidence.ts", content: "export const e = 1;\n" }];
    const pack = await statementFor(id, files);
    expect(await apply(id, task, files, USERS.alice, pack)).toBe(1);
    const [row] = await q<{ digest: string; status: string; previous: string | null; task_id: string }>(
      "select digest, status, previous, task_id from public.proofpacks where proposal_id = $1",
      [id],
    );
    expect(row).toEqual({ digest: pack.digest, status: "unverified", previous: before, task_id: task });
    expect((await asUser(USERS.alice, () => db.query("select digest from public.proofpacks where digest = $1", [pack.digest]))).rows).toHaveLength(1);
    expect((await asUser(USERS.bob, () => db.query("select digest from public.proofpacks where digest = $1", [pack.digest]))).rows).toHaveLength(0);
  });

  it("refuses a broken chain, a statement for another proposal, or a status mismatch, applying nothing", async () => {
    const task = await approvedTask("Bad evidence");
    const id = await propose(task, [change("src/bad-evidence.ts", "x\n", 0)]);
    const files = [{ path: "src/bad-evidence.ts", content: "x\n" }];
    await expect(apply(id, task, files, USERS.alice, await statementFor(id, files, { previous: H("9") }))).rejects.toThrow(/PROOFPACK_CHAIN/);
    await expect(apply(id, task, files, USERS.alice, await statementFor(id, files, { proposalId: "someone-else" }))).rejects.toThrow(/INVALID_PROOFPACK/);
    await expect(apply(id, task, files, USERS.alice, { ...(await statementFor(id, files)), status: "verified" })).rejects.toThrow(/INVALID_PROOFPACK/);
    expect((await taskState(task)).state).toBe("APPROVAL_PENDING");
    expect(await fileRevision("src/bad-evidence.ts")).toBe(0);
  });

  it("never lets a ProofPack change, even for the server", async () => {
    const [row] = await q<{ digest: string }>("select digest from public.proofpacks limit 1");
    await expect(q("update public.proofpacks set status = 'verified' where digest = $1", [row!.digest])).rejects.toThrow(/PROOFPACK_IMMUTABLE/);
    await expect(asUser(USERS.alice, () => db.query("update public.proofpacks set status = 'verified'"))).rejects.toThrow(/permission denied/);
  });

  it("goes away with its task, without tripping the no-update rule", async () => {
    const task = await approvedTask("Removable");
    const id = await propose(task, [change("src/removable.ts", "r\n", 0)]);
    await apply(id, task, [{ path: "src/removable.ts", content: "r\n" }]);
    await q("delete from public.tasks where id = $1", [task]);
    expect(await q("select digest from public.proofpacks where task_id = $1", [task])).toEqual([]);
  });
});

describe("usage and access", () => {
  it("accepts the change_proposal usage operation", async () => {
    const from = new Date(Date.now() - 86_400_000).toISOString();
    const to = new Date(Date.now() + 86_400_000).toISOString();
    const grant = JSON.stringify({ kind: "plan", units: 1_000, starts_at: from, expires_at: to, source_key: "plan:proposal-test" });
    await expect(
      q("select public.app_reserve_usage($1, $2, 'k-proposal', 'change_proposal', null, 300, $3)", [org, USERS.alice, grant]),
    ).resolves.toHaveLength(1);
  });

  it("only the server can create, apply or discard, and other organizations see nothing", async () => {
    await expect(
      asUser(USERS.alice, () => db.query("select public.app_discard_proposal(gen_random_uuid(), $1, 0, '[]')", [USERS.alice])),
    ).rejects.toThrow(/permission denied/);
    await expect(asUser(USERS.alice, () => db.query("update public.change_proposals set status = 'applied'"))).rejects.toThrow(/permission denied/);
    expect((await asUser(USERS.bob, () => db.query("select id from public.change_proposals"))).rows).toEqual([]);
    expect((await asUser(USERS.alice, () => db.query("select id from public.change_proposals"))).rows.length).toBeGreaterThan(0);
  });
});
