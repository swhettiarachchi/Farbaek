/**
 * Migration 32: each attempt to verify an applied change is recorded, one at
 * a time per task, with the session it ran in and the receipt it produced or
 * the reason it couldn't run. A change applied on its own whose checks partly
 * fail now pauses autonomy too.
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
const LIMITS = [1024 * 512, 25 * 1024 * 1024, 3000];
const DAY = 86_400_000;

let seq = 0;
const step = (from: string, to: string, type: string, actor_kind?: "agent" | "system") => ({ event_id: `tv-${++seq}`, event_type: type, from, to, ...(actor_kind ? { actor_kind, actor_id: "farbaek" } : {}) });
const version = async (task: string) => (await admin<{ version: number }>("select version from public.tasks where id = $1", [task]))[0]!.version;
const latest = async () => (await admin<{ digest: string }>("select digest from public.proofpacks where project_id = $1 order by seq desc limit 1", [project]))[0]?.digest ?? null;

/** A task with an approved contract, a proposal, and (unless `apply` is false) that proposal applied by a person or the policy. */
async function task(title: string, opts: { by?: "person" | "policy"; apply?: boolean } = {}) {
  const id = (await q<{ id: string }>("select public.app_create_task($1, $2, $3, $4) as id", [org, USERS.alice, project, title]))[0]!.id;
  await q("select public.app_save_contract($1, $2, $3, $4, 0, 0, $5)", [
    id,
    USERS.alice,
    JSON.stringify({ schema: "farbaek.intent-contract/v1", version: 1 }),
    H("c"),
    JSON.stringify([step("RECEIVED", "CONTEXT_ASSEMBLED", "assemble_context"), step("CONTEXT_ASSEMBLED", "CONTRACT_DRAFTED", "draft_contract")]),
  ]);
  await q("select public.app_approve_contract($1, $2, 1, $3, 2, $4)", [id, USERS.alice, H("c"), JSON.stringify([step("CONTRACT_DRAFTED", "CONTRACT_APPROVED", "approve_contract")])]);
  const path = `src/${title.replace(/\W+/g, "-").toLowerCase()}.ts`;
  const content = `export const name = ${JSON.stringify(title)};\n`;
  const outcome = opts.by === "policy" ? "ALLOW_WITHIN_LIMITS" : "REQUIRE_APPROVAL";
  const proposal = (
    await q<{ id: string }>("select public.app_create_proposal($1, $2, 1, $3, $4, '[]', '[]', $5, 'm', 1, 1, $6, $7, $8, 1000, $9, $10) as id", [
      id,
      USERS.alice,
      JSON.stringify({ summary: "s", steps: [], risks: [], checks: [] }),
      JSON.stringify([{ path, kind: "create", base_revision: 0, content, sha256: sha(content), reason: "r" }]),
      H("b"),
      await version(id),
      JSON.stringify([step("CONTRACT_APPROVED", "PLAN_PROPOSED", "propose_plan", "agent"), step("PLAN_PROPOSED", "POLICY_EVALUATED", "evaluate_policy", "system"), step("POLICY_EVALUATED", "APPROVAL_PENDING", "require_approval", "system")]),
      JSON.stringify({ outcome, version: H("e"), findings: [] }),
      new Date(Date.now() - DAY).toISOString(),
      new Date(Date.now() + DAY).toISOString(),
    ])
  )[0]!.id;
  if (opts.apply === false) return { task: id, proposal, applied: null as string | null };
  const pack = {
    _type: "https://in-toto.io/Statement/v1",
    subject: [{ name: path, digest: { sha256: sha(content) } }],
    predicateType: "https://farbaek.dev/proofpack/v1",
    predicate: { status: "unverified", proposal: { id: proposal }, approval: { appliedSha256: H("a"), ...(opts.by === "policy" ? { by: "policy", autonomyLevel: 2 } : {}) }, previous: await latest(), nonce: ++seq },
  };
  const applied = sha(JSON.stringify(pack));
  await q("select public.app_apply_proposal($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'unverified')", [
    proposal,
    USERS.alice,
    JSON.stringify([{ path, content }]),
    H("a"),
    await version(id),
    JSON.stringify([
      step("APPROVAL_PENDING", "EXECUTION_AUTHORIZED", "grant_approval", opts.by === "policy" ? "system" : undefined),
      step("EXECUTION_AUTHORIZED", "EXECUTING", "start_execution", "system"),
      step("EXECUTING", "VERIFYING", "begin_verification", "system"),
    ]),
    ...LIMITS,
    JSON.stringify(pack),
    applied,
  ]);
  return { task: id, proposal, applied };
}

async function session(taskId: string | null) {
  return (
    await q<{ session_id: string }>(
      `select * from public.app_create_sandbox_session($1, $2, $3, $4, 'Checks', 'node-ts', 'small', 'vercel/sandbox/universal', 'none', 1, 2048, 'vercel', 'microvm', 1800, 600, 100, 1000, now() - interval '1 day', $5)`,
      [org, USERS.alice, project, taskId, `tv-${++seq}-key`],
    )
  )[0]!.session_id;
}

async function receipt(sessionId: string, applied: string, status = "verified") {
  const statement = {
    _type: "https://in-toto.io/Statement/v1",
    subject: [{ name: "project-snapshot", digest: { sha256: H("9") } }],
    predicateType: "https://farbaek.dev/sandbox-receipt/v1",
    predicate: { status, session: { id: sessionId, organizationId: org }, verdict: { taskEvent: "mark_verified", proofPackDigest: applied }, appliedChange: { matched: true, files: [] }, nonce: ++seq },
  };
  const digest = sha(JSON.stringify(statement));
  await q("select public.app_record_sandbox_receipt($1, $2, $3, $4, $5)", [sessionId, USERS.alice, digest, status, JSON.stringify(statement)]);
  return digest;
}

const start = (taskId: string, actor: string = USERS.alice, trigger = "person") =>
  q<{ id: string }>("select public.app_start_task_verification($1, $2, $3, $4) as id", [org, actor, taskId, trigger]).then((r) => r[0]!.id);
const attach = (id: string, sessionId: string) => q("select public.app_attach_verification_session($1, $2, $3)", [id, USERS.alice, sessionId]);
const finish = (id: string, status: string, receiptDigest: string | null, failure: string | null = null) => q("select public.app_finish_task_verification($1, $2, $3, $4, $5)", [id, USERS.alice, status, receiptDigest, failure]);
const row = async (id: string) => (await admin<{ status: string; result: string | null; receipt_digest: string | null; failure: string | null; session_id: string | null; trigger: string; finished_at: string | null }>("select * from public.task_verifications where id = $1", [id]))[0]!;

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  await createOrg(db, USERS.bob, "Bob Labs");
  await admin("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'viewer')", [org, USERS.unverified]);
  project = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Storefront', null, null) as id", [org, USERS.alice]))[0]!.id;
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("starting a verification", () => {
  it("is for contributors, only for an applied change waiting for its checks, one at a time", async () => {
    const pending = await task("Not applied yet", { apply: false });
    await expect(start(pending.task)).rejects.toThrow(/INVALID_TRANSITION/);

    const t = await task("Applied");
    await expect(start(t.task, USERS.unverified)).rejects.toThrow(/FORBIDDEN/);
    await expect(start(t.task, USERS.bob)).rejects.toThrow(/FORBIDDEN/);
    await expect(start(t.task, USERS.alice, "robot")).rejects.toThrow(/INVALID_REQUEST/);

    const id = await start(t.task, USERS.alice, "autonomy");
    expect(await row(id)).toMatchObject({ status: "running", trigger: "autonomy", finished_at: null });
    await expect(start(t.task)).rejects.toThrow(/VERIFICATION_RUNNING/);
    const [audit] = await admin<{ metadata: { verification: string; trigger: string; proposal: string } }>("select metadata from public.audit_events where action = 'verification.started' order by id desc limit 1");
    expect(audit!.metadata).toEqual({ verification: id, trigger: "autonomy", proposal: t.proposal });
  });

  it("closes an attempt that stopped without finishing, so a new one can start", async () => {
    const t = await task("Stale");
    const old = await start(t.task);
    await admin("update public.task_verifications set started_at = now() - interval '25 minutes' where id = $1", [old]);
    const next = await start(t.task);
    expect(await row(old)).toMatchObject({ status: "failed", failure: expect.stringMatching(/stopped without finishing/) });
    expect(await row(next)).toMatchObject({ status: "running" });
  });
});

describe("finishing a verification", () => {
  it("takes its result from the receipt of a session linked to the same task", async () => {
    const t = await task("Checked");
    const other = await task("Other task");
    const id = await start(t.task);
    await expect(attach(id, await session(other.task))).rejects.toThrow(/INVALID_REQUEST/);
    await expect(attach(id, await session(null))).rejects.toThrow(/INVALID_REQUEST/);
    const s = await session(t.task);
    await attach(id, s);

    const foreign = await receipt(await session(other.task), other.applied!);
    await expect(finish(id, "done", foreign)).rejects.toThrow(/INVALID_REQUEST/);
    await expect(finish(id, "maybe", null)).rejects.toThrow(/INVALID_REQUEST/);

    const r = await receipt(s, t.applied!, "partially_verified");
    await finish(id, "done", r);
    expect(await row(id)).toMatchObject({ status: "done", result: "partially_verified", receipt_digest: r, session_id: s, failure: null });
    await expect(finish(id, "failed", null, "again")).rejects.toThrow(/INVALID_TRANSITION/);
  });

  it("records why an attempt couldn't run", async () => {
    const t = await task("Install failed");
    const id = await start(t.task);
    await finish(id, "failed", null, "  Installing packages failed (exit 1).  ");
    expect(await row(id)).toMatchObject({ status: "failed", result: null, failure: "Installing packages failed (exit 1)." });
    const [audit] = await admin<{ metadata: { status: string } }>("select metadata from public.audit_events where action = 'verification.finished' order by id desc limit 1");
    expect(audit!.metadata.status).toBe("failed");
  });

  it("is readable by members and written only by the server", async () => {
    const seen = await asUser(USERS.unverified, () => db.query("select count(*)::int as n from public.task_verifications"));
    expect((seen.rows[0] as { n: number }).n).toBeGreaterThan(0);
    expect((await asUser(USERS.bob, () => db.query("select id from public.task_verifications"))).rows).toEqual([]);
    await expect(asUser(USERS.alice, () => db.query("update public.task_verifications set status = 'done'"))).rejects.toThrow(/permission denied/);
    await expect(asUser(USERS.alice, () => db.query("select public.app_start_task_verification($1, $2, $3, 'person')", [org, USERS.alice, project]))).rejects.toThrow(/permission denied/);
  });
});

describe("autonomy after a partly failed check", () => {
  const failPack = async (t: { task: string; proposal: string }, status: string) => {
    const statement = { _type: "https://in-toto.io/Statement/v1", predicate: { status, proposal: { id: t.proposal }, nonce: ++seq } };
    await admin("insert into public.proofpacks (digest, org_id, project_id, task_id, proposal_id, status, statement, previous) values ($1, $2, $3, $4, $5, $6, $7, $8)", [
      sha(JSON.stringify(statement)),
      org,
      project,
      t.task,
      t.proposal,
      status,
      JSON.stringify(statement),
      await latest(),
    ]);
  };
  const suspended = async () => (await admin<{ suspended_at: string | null }>("select suspended_at from public.org_autonomy where org_id = $1", [org]))[0]!.suspended_at;

  it("pauses it for a change applied on its own, and not for one a person approved", async () => {
    await q("select public.app_set_autonomy($1, $2, 2, 3, true)", [org, USERS.alice]);
    const byPerson = await task("Person approved");
    await failPack(byPerson, "partially_verified");
    expect(await suspended()).toBeNull();

    const byPolicy = await task("Policy applied", { by: "policy" });
    await failPack(byPolicy, "partially_verified");
    expect(await suspended()).not.toBeNull();
    const [audit] = await admin<{ metadata: { status: string } }>("select metadata from public.audit_events where action = 'autonomy.suspended' order by id desc limit 1");
    expect(audit!.metadata.status).toBe("partially_verified");
  });
});
