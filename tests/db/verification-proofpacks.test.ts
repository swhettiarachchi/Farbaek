/**
 * Migration 12: a check run against exactly the applied content appends a
 * ProofPack with the real results to the project's chain, once per run,
 * linked to the run's receipt and to the change's own ProofPack.
 */
import { createHash } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let project: string;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const H = (c: string) => c.repeat(64);
const LIMITS = [1024 * 512, 25 * 1024 * 1024, 3000];
const DAY = 86_400_000;

let seq = 0;
const step = (from: string, to: string, type: string, actor_kind?: "agent" | "system") => ({ event_id: `v-${++seq}`, event_type: type, from, to, ...(actor_kind ? { actor_kind, actor_id: "farbaek" } : {}) });

async function latestProofPack() {
  return (await q<{ digest: string }>("select digest from public.proofpacks where project_id = $1 order by seq desc limit 1", [project]))[0]?.digest ?? null;
}

/** A task with an applied change (VERIFYING) and its ProofPack. */
async function appliedTask(title: string, path: string, content: string) {
  const task = (await q<{ id: string }>("select public.app_create_task($1, $2, $3, $4) as id", [org, USERS.alice, project, title]))[0]!.id;
  await q("select public.app_save_contract($1, $2, $3, $4, 0, 0, $5)", [
    task,
    USERS.alice,
    JSON.stringify({ schema: "farbaek.intent-contract/v1", version: 1 }),
    H("c"),
    JSON.stringify([step("RECEIVED", "CONTEXT_ASSEMBLED", "assemble_context"), step("CONTEXT_ASSEMBLED", "CONTRACT_DRAFTED", "draft_contract")]),
  ]);
  await q("select public.app_approve_contract($1, $2, 1, $3, 2, $4)", [task, USERS.alice, H("c"), JSON.stringify([step("CONTRACT_DRAFTED", "CONTRACT_APPROVED", "approve_contract")])]);
  const proposal = (
    await q<{ id: string }>("select public.app_create_proposal($1, $2, 1, $3, $4, '[]', '[]', $5, 'claude-opus-5-5', 100, 50, 3, $6, $7, 1000, $8, $9) as id", [
      task,
      USERS.alice,
      JSON.stringify({ summary: "s", steps: [], risks: [], checks: [] }),
      JSON.stringify([{ path, kind: "create", base_revision: 0, content, sha256: sha(content), reason: "r" }]),
      H("b"),
      JSON.stringify([
        step("CONTRACT_APPROVED", "PLAN_PROPOSED", "propose_plan", "agent"),
        step("PLAN_PROPOSED", "POLICY_EVALUATED", "evaluate_policy", "system"),
        step("POLICY_EVALUATED", "APPROVAL_PENDING", "require_approval", "system"),
      ]),
      JSON.stringify({ outcome: "REQUIRE_APPROVAL", version: H("e"), findings: [] }),
      new Date(Date.now() - DAY).toISOString(),
      new Date(Date.now() + DAY).toISOString(),
    ])
  )[0]!.id;
  const pack = {
    _type: "https://in-toto.io/Statement/v1",
    subject: [{ name: path, digest: { sha256: sha(content) } }],
    predicateType: "https://farbaek.dev/proofpack/v1",
    predicate: { status: "unverified", proposal: { id: proposal }, approval: { appliedSha256: H("a") }, previous: await latestProofPack(), nonce: ++seq },
  };
  const appliedDigest = sha(JSON.stringify(pack));
  await q("select public.app_apply_proposal($1, $2, $3, $4, 6, $5, $6, $7, $8, $9, $10, 'unverified')", [
    proposal,
    USERS.alice,
    JSON.stringify([{ path, content }]),
    H("a"),
    JSON.stringify([
      step("APPROVAL_PENDING", "EXECUTION_AUTHORIZED", "grant_approval"),
      step("EXECUTION_AUTHORIZED", "EXECUTING", "start_execution", "system"),
      step("EXECUTING", "VERIFYING", "begin_verification", "system"),
    ]),
    ...LIMITS,
    JSON.stringify(pack),
    appliedDigest,
  ]);
  return { task, proposal, appliedDigest };
}

/** A sandbox session linked to the task, and a receipt for one check run in it. */
async function checkRun(task: string, appliedDigest: string, opts: { status?: string; matched?: boolean } = {}) {
  const session = (
    await q<{ session_id: string }>(
      `select * from public.app_create_sandbox_session($1, $2, $3, $4, 'Verify', 'node-ts', 'small', 'vercel/sandbox/universal', 'none', 1, 2048, 'vercel', 'microvm', 1800, 600, 100, 1000, now() - interval '1 day', $5)`,
      [org, USERS.alice, project, task, `idem-${++seq}-key`],
    )
  )[0]!.session_id;
  const status = opts.status ?? "verified";
  const statement = {
    _type: "https://in-toto.io/Statement/v1",
    subject: [{ name: "project-snapshot", digest: { sha256: H("9") } }],
    predicateType: "https://farbaek.dev/sandbox-receipt/v1",
    predicate: {
      status,
      session: { id: session, organizationId: org },
      verdict: { taskEvent: "mark_verified", proofPackDigest: appliedDigest },
      appliedChange: { matched: opts.matched ?? true, files: [] },
      nonce: ++seq,
    },
  };
  const digest = sha(JSON.stringify(statement));
  await q("select public.app_record_sandbox_receipt($1, $2, $3, $4, $5)", [session, USERS.alice, digest, status, JSON.stringify(statement)]);
  return digest;
}

async function verificationPack(task: string, proposal: string, receipt: string, appliedDigest: string, over: { status?: string; previous?: string | null; proposalId?: string; applied?: string } = {}) {
  const status = over.status ?? "verified";
  const statement = {
    _type: "https://in-toto.io/Statement/v1",
    subject: [],
    predicateType: "https://farbaek.dev/proofpack/v1",
    predicate: {
      status,
      task: { id: task },
      proposal: { id: over.proposalId ?? proposal },
      previous: over.previous === undefined ? await latestProofPack() : over.previous,
      verification: { receipt, appliedProofPack: over.applied ?? appliedDigest, filesMatched: true },
      nonce: ++seq,
    },
  };
  return { statement, digest: sha(JSON.stringify(statement)), status };
}

const record = (task: string, receipt: string, p: { statement: object; digest: string; status: string }, actor: string = USERS.alice) =>
  q<{ d: string }>("select public.app_record_verification_proofpack($1, $2, $3, $4, $5, $6) as d", [task, actor, receipt, JSON.stringify(p.statement), p.digest, p.status]).then((r) => r[0]!.d);

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  await createOrg(db, USERS.bob, "Bob Labs");
  project = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Storefront', null, null) as id", [org, USERS.alice]))[0]!.id;
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("ProofPacks for verified check runs", () => {
  it("appends one to the project's chain, linked to the receipt and to the change's ProofPack", async () => {
    const t = await appliedTask("Verify me", "README.md", "# Run the tests\npnpm test\n");
    const receipt = await checkRun(t.task, t.appliedDigest);
    const before = await latestProofPack();
    const p = await verificationPack(t.task, t.proposal, receipt, t.appliedDigest);
    expect(await record(t.task, receipt, p)).toBe(p.digest);
    const [row] = await q<{ status: string; previous: string; proposal_id: string; task_id: string }>("select status, previous, proposal_id, task_id from public.proofpacks where digest = $1", [p.digest]);
    expect(row).toEqual({ status: "verified", previous: before, proposal_id: t.proposal, task_id: t.task });
    expect(await q("select 1 from public.audit_events where action = 'proofpack.verification_recorded' and target = $1", [t.task])).toHaveLength(1);

    // Once per run: a repeat returns the same ProofPack and adds nothing.
    const again = await verificationPack(t.task, t.proposal, receipt, t.appliedDigest, { previous: p.digest });
    expect(await record(t.task, receipt, again)).toBe(p.digest);
    expect(await q("select digest from public.proofpacks where task_id = $1", [t.task])).toHaveLength(2);
  });

  it("refuses runs that didn't match the applied content, mismatched statuses and broken links", async () => {
    const t = await appliedTask("Refusals", "docs/a.md", "a\n");
    const unmatched = await checkRun(t.task, t.appliedDigest, { matched: false });
    await expect(record(t.task, unmatched, await verificationPack(t.task, t.proposal, unmatched, t.appliedDigest))).rejects.toThrow(/INVALID_PROOFPACK/);

    const receipt = await checkRun(t.task, t.appliedDigest);
    await expect(record(t.task, receipt, await verificationPack(t.task, t.proposal, receipt, t.appliedDigest, { status: "failed" }))).rejects.toThrow(/INVALID_PROOFPACK/);
    await expect(record(t.task, receipt, await verificationPack(t.task, t.proposal, receipt, t.appliedDigest, { applied: H("0") }))).rejects.toThrow(/INVALID_PROOFPACK/);
    await expect(record(t.task, receipt, await verificationPack(t.task, t.proposal, receipt, t.appliedDigest, { proposalId: "11111111-1111-4111-8111-111111111111" }))).rejects.toThrow(/INVALID_PROOFPACK/);
    await expect(record(t.task, receipt, await verificationPack(t.task, t.proposal, receipt, t.appliedDigest, { previous: H("1") }))).rejects.toThrow(/PROOFPACK_CHAIN/);

    // A receipt from another task's run can't verify this one.
    const other = await appliedTask("Other", "docs/b.md", "b\n");
    const otherReceipt = await checkRun(other.task, other.appliedDigest);
    await expect(record(t.task, otherReceipt, await verificationPack(t.task, t.proposal, otherReceipt, t.appliedDigest))).rejects.toThrow(/INVALID_PROOFPACK/);
    expect(await q("select digest from public.proofpacks where task_id = $1", [t.task])).toHaveLength(1);
  });

  it("only the server records them, and only for contributors", async () => {
    const t = await appliedTask("Access", "docs/c.md", "c\n");
    const receipt = await checkRun(t.task, t.appliedDigest);
    const p = await verificationPack(t.task, t.proposal, receipt, t.appliedDigest);
    await expect(
      as(db, "authenticated", USERS.alice, () => db.query("select public.app_record_verification_proofpack($1, $2, $3, $4, $5, 'verified')", [t.task, USERS.alice, receipt, JSON.stringify(p.statement), p.digest])),
    ).rejects.toThrow(/permission denied/);
    await expect(record(t.task, receipt, p, USERS.bob)).rejects.toThrow(/FORBIDDEN|NOT_FOUND/);
  });
});
