/**
 * Migration 11: undoing an applied change. Files go back to their earlier
 * revisions only while they still hold what was applied, the result is
 * verified before it's recorded, a repeated request acts once, and the
 * task is recovered only when every file is back.
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
const DAY = 86_400_000;

let seq = 0;
const step = (from: string, to: string, type: string, actor_kind?: "agent" | "system") => ({ event_id: `r-${++seq}`, event_type: type, from, to, ...(actor_kind ? { actor_kind, actor_id: "farbaek" } : {}) });

async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return asService(async () => (await db.query<T>(sql, params)).rows);
}

async function taskState(task: string) {
  return (await q<{ state: string; version: number }>("select state, version from public.tasks where id = $1", [task]))[0]!;
}

async function current(path: string) {
  return (await q<{ revision: number; sha256: string }>("select revision, sha256 from public.project_files where project_id = $1 and path = $2", [project, path]))[0] ?? null;
}

async function content(path: string) {
  const rows = await q<{ content: string }>(
    "select r.content from public.project_files f join public.project_file_revisions r on r.project_id = f.project_id and r.path = f.path and r.revision = f.revision where f.project_id = $1 and f.path = $2",
    [project, path],
  );
  return rows[0]?.content;
}

const change = (path: string, body: string, base: number) => ({ path, kind: base === 0 ? "create" : "edit", base_revision: base, content: body, sha256: sha(body), reason: "r" });

/** A task with an applied proposal, in VERIFYING (or a pending one, with apply: false). */
async function appliedChange(title: string, files: { path: string; content: string }[], outcome = "REQUIRE_APPROVAL", { apply = true } = {}) {
  const task = (await q<{ id: string }>("select public.app_create_task($1, $2, $3, $4) as id", [org, USERS.alice, project, title]))[0]!.id;
  await q("select public.app_save_contract($1, $2, $3, $4, 0, 0, $5)", [
    task,
    USERS.alice,
    JSON.stringify({ schema: "farbaek.intent-contract/v1", version: 1 }),
    H("c"),
    JSON.stringify([step("RECEIVED", "CONTEXT_ASSEMBLED", "assemble_context"), step("CONTEXT_ASSEMBLED", "CONTRACT_DRAFTED", "draft_contract")]),
  ]);
  await q("select public.app_approve_contract($1, $2, 1, $3, 2, $4)", [task, USERS.alice, H("c"), JSON.stringify([step("CONTRACT_DRAFTED", "CONTRACT_APPROVED", "approve_contract")])]);
  const changes = [];
  for (const f of files) changes.push(change(f.path, f.content, (await current(f.path))?.revision ?? 0));
  const proposal = (
    await q<{ id: string }>("select public.app_create_proposal($1, $2, 1, $3, $4, '[]', '[]', $5, 'claude-opus-5-5', 100, 50, 3, $6, $7, 1000, $8, $9) as id", [
      task,
      USERS.alice,
      JSON.stringify({ summary: "s", steps: [], risks: [], checks: [] }),
      JSON.stringify(changes),
      H("b"),
      JSON.stringify([
        step("CONTRACT_APPROVED", "PLAN_PROPOSED", "propose_plan", "agent"),
        step("PLAN_PROPOSED", "POLICY_EVALUATED", "evaluate_policy", "system"),
        step("POLICY_EVALUATED", "APPROVAL_PENDING", "require_approval", "system"),
      ]),
      JSON.stringify({ outcome, version: H("e"), findings: [] }),
      new Date(Date.now() - DAY).toISOString(),
      new Date(Date.now() + DAY).toISOString(),
    ])
  )[0]!.id;
  if (!apply) return { task, proposal, packDigest: null, bases: changes };
  const previous =(await q<{ digest: string }>("select digest from public.proofpacks where project_id = $1 order by seq desc limit 1", [project]))[0]?.digest ?? null;
  const pack = {
    _type: "https://in-toto.io/Statement/v1",
    subject: files.map((f) => ({ name: f.path, digest: { sha256: sha(f.content) } })),
    predicateType: "https://farbaek.dev/proofpack/v1",
    predicate: { status: "unverified", proposal: { id: proposal }, approval: { appliedSha256: H("a") }, previous, nonce: ++seq },
  };
  const packDigest = sha(JSON.stringify(pack));
  await q("select public.app_apply_proposal($1, $2, $3, $4, 6, $5, $6, $7, $8, $9, $10, 'unverified')", [
    proposal,
    USERS.alice,
    JSON.stringify(files),
    H("a"),
    JSON.stringify([
      step("APPROVAL_PENDING", "EXECUTION_AUTHORIZED", "grant_approval"),
      step("EXECUTION_AUTHORIZED", "EXECUTING", "start_execution", "system"),
      step("EXECUTING", "VERIFYING", "begin_verification", "system"),
    ]),
    ...LIMITS,
    JSON.stringify(pack),
    packDigest,
  ]);
  return { task, proposal, packDigest, bases: changes };
}

type Op = { path: string; action: "restore" | "remove"; from_sha256: string; to_sha256: string | null };

const STEPS: Record<string, (complete: boolean) => object[]> = {
  VERIFYING: (complete) => [
    step("VERIFYING", "INTERRUPTED", "interrupt"),
    step("INTERRUPTED", "RECOVERY_PENDING", "plan_recovery"),
    ...(complete ? [step("RECOVERY_PENDING", "RECOVERED", "recover", "system")] : []),
  ],
  RECOVERY_PENDING: (complete) => (complete ? [step("RECOVERY_PENDING", "RECOVERED", "recover", "system")] : []),
};

async function recover(
  ctx: { task: string; proposal: string; packDigest: string | null },
  ops: Op[],
  opts: { status?: string; actor?: string; outcome?: string; operation?: string; receipt?: (r: Record<string, unknown>) => void; complete?: boolean } = {},
) {
  const { state, version } = await taskState(ctx.task);
  const status = opts.status ?? (opts.complete === false ? "partially_recovered" : "recovered");
  const operation = opts.operation ?? sha(`op-${++seq}`);
  const receipt: Record<string, unknown> = {
    _type: "https://in-toto.io/Statement/v1",
    subject: [],
    predicateType: "https://farbaek.dev/recovery/v1",
    predicate: {
      status,
      proposal: { id: ctx.proposal },
      plan: { sha256: H("d") },
      operationSha256: operation,
      proofPack: ctx.packDigest,
      operations: ops.map((o) => ({ path: o.path, action: o.action, fromSha256: o.from_sha256, toSha256: o.to_sha256 })),
      nonce: ++seq,
    },
  };
  opts.receipt?.(receipt);
  const digest = sha(JSON.stringify(receipt));
  const rows = await q<{ r: { id: string; restored: number; status: string; digest: string; replayed: boolean } }>(
    "select public.app_recover_change($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) as r",
    [
      ctx.proposal,
      opts.actor ?? USERS.alice,
      JSON.stringify(ops),
      H("d"),
      operation,
      version,
      JSON.stringify(STEPS[state]?.(status === "recovered") ?? []),
      JSON.stringify({ outcome: opts.outcome ?? "REQUIRE_APPROVAL", version: H("e"), findings: [] }),
      JSON.stringify(receipt),
      digest,
      status,
      ...LIMITS,
    ],
  );
  return rows[0]!.r;
}

const restore = (path: string, from: string, to: string): Op => ({ path, action: "restore", from_sha256: sha(from), to_sha256: sha(to) });
const remove = (path: string, from: string): Op => ({ path, action: "remove", from_sha256: sha(from), to_sha256: null });

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
      { path: "src/tax.ts", content: "export const tax = 1;\n" },
    ]),
  ]);
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("undoing an applied change", () => {
  it("restores edited files, removes created ones, verifies them and records the recovery", async () => {
    const c = await appliedChange("Undo all", [
      { path: "src/price.ts", content: "export const vat = 21;\n" },
      { path: "src/vat.ts", content: "export const rate = 0.21;\n" },
    ]);
    const result = await recover(c, [restore("src/price.ts", "export const vat = 21;\n", "export const vat = 20;\n"), remove("src/vat.ts", "export const rate = 0.21;\n")]);
    expect(result).toMatchObject({ restored: 2, status: "recovered", replayed: false });

    expect(await content("src/price.ts")).toBe("export const vat = 20;\n");
    expect(await current("src/vat.ts")).toBeNull();
    const revisions = await q<{ path: string; change: string; proposal_id: string | null }>(
      "select path, change, proposal_id from public.project_file_revisions where project_id = $1 and path in ('src/price.ts', 'src/vat.ts') order by path, revision",
      [project],
    );
    expect(revisions.map((r) => [r.path, r.change, r.proposal_id === c.proposal])).toEqual([
      ["src/price.ts", "import", false],
      ["src/price.ts", "edit", true],
      ["src/price.ts", "edit", false],
      ["src/vat.ts", "edit", true],
      ["src/vat.ts", "delete", false],
    ]);

    expect((await taskState(c.task)).state).toBe("RECOVERED");
    const steps = await q<{ event_type: string; actor_kind: string }>(
      "select event_type, actor_kind from public.task_transitions where task_id = $1 and event_type in ('interrupt', 'plan_recovery', 'recover') order by event_type",
      [c.task],
    );
    expect(steps).toEqual([
      { event_type: "interrupt", actor_kind: "user" },
      { event_type: "plan_recovery", actor_kind: "user" },
      { event_type: "recover", actor_kind: "system" },
    ]);
    const [row] = await q<{ status: string; restored: number; proofpack_digest: string; digest: string }>(
      "select status, restored, proofpack_digest, digest from public.recovery_operations where proposal_id = $1",
      [c.proposal],
    );
    expect(row).toMatchObject({ status: "recovered", restored: 2, proofpack_digest: c.packDigest, digest: result.digest });
    expect(await q("select 1 from public.audit_events where action = 'change.recovered' and target = $1", [c.proposal])).toHaveLength(1);
  });

  it("acts once for a repeated request", async () => {
    const c = await appliedChange("Twice", [{ path: "src/once.ts", content: "once\n" }]);
    const first = await recover(c, [remove("src/once.ts", "once\n")], { operation: H("7") });
    const again = await recover(c, [remove("src/once.ts", "once\n")], { operation: H("7") });
    expect(again).toEqual({ ...first, replayed: true });
    expect(await q("select id from public.recovery_operations where proposal_id = $1", [c.proposal])).toHaveLength(1);
  });

  it("never overwrites a newer change, and finishes only when every file is back", async () => {
    const c = await appliedChange("Partial", [
      { path: "src/cart.ts", content: "export const max = 2;\n" },
      { path: "src/tax.ts", content: "export const tax = 2;\n" },
    ]);
    // Someone edits cart.ts after the change was applied.
    const cart = await current("src/cart.ts");
    await q("select public.app_save_file($1, $2, 'src/cart.ts', 'export const max = 3;\n', $3, $4, $5, $6)", [project, USERS.alice, cart!.revision, ...LIMITS]);

    await expect(recover(c, [restore("src/cart.ts", "export const max = 2;\n", "export const max = 1;\n")])).rejects.toThrow(/FILE_CHANGED/);
    expect(await content("src/cart.ts")).toBe("export const max = 3;\n");
    expect((await taskState(c.task)).state).toBe("VERIFYING");

    // Claiming a full recovery while cart.ts isn't back is refused.
    await expect(recover(c, [restore("src/tax.ts", "export const tax = 2;\n", "export const tax = 1;\n")], { status: "recovered" })).rejects.toThrow(/INVALID_RECOVERY/);
    const partial = await recover(c, [restore("src/tax.ts", "export const tax = 2;\n", "export const tax = 1;\n")], { complete: false });
    expect(partial).toMatchObject({ restored: 1, status: "partially_recovered" });
    expect((await taskState(c.task)).state).toBe("RECOVERY_PENDING");

    // Nothing left to undo isn't a recovery yet.
    await expect(recover(c, [], { complete: true })).rejects.toThrow(/INVALID_RECOVERY/);
    // The person puts cart.ts back themselves; then the recovery can finish with no writes.
    const now = await current("src/cart.ts");
    await q("select public.app_save_file($1, $2, 'src/cart.ts', 'export const max = 1;\n', $3, $4, $5, $6)", [project, USERS.alice, now!.revision, ...LIMITS]);
    expect(await recover(c, [], { complete: true })).toMatchObject({ restored: 0, status: "recovered" });
    expect((await taskState(c.task)).state).toBe("RECOVERED");
  });

  it("refuses stale plans, mismatched records and the wrong action, changing nothing", async () => {
    const c = await appliedChange("Refusals", [
      { path: "src/refuse.ts", content: "new\n" },
      { path: "src/price.ts", content: "export const vat = 22;\n" },
    ]);
    const before = await current("src/price.ts");
    const good = restore("src/price.ts", "export const vat = 22;\n", "export const vat = 20;\n");
    await expect(recover(c, [{ ...good, from_sha256: H("0") }], { complete: false })).rejects.toThrow(/INVALID_RECOVERY/);
    await expect(recover(c, [{ ...good, to_sha256: H("0") }], { complete: false })).rejects.toThrow(/INVALID_RECOVERY/);
    await expect(recover(c, [{ path: "src/refuse.ts", action: "restore", from_sha256: sha("new\n"), to_sha256: H("0") }], { complete: false })).rejects.toThrow(/INVALID_RECOVERY/);
    await expect(recover(c, [restore("src/cart.ts", "a", "b")], { complete: false })).rejects.toThrow(/INVALID_RECOVERY/);
    await expect(recover(c, [good], { complete: false, receipt: (r) => ((r.predicate as Record<string, unknown>).proofPack = H("9")) })).rejects.toThrow(/INVALID_RECOVERY/);
    await expect(recover(c, [good], { complete: false, receipt: (r) => ((r.predicate as Record<string, unknown>).operations = []) })).rejects.toThrow(/INVALID_RECOVERY/);
    await expect(recover(c, [good], { complete: false, outcome: "BLOCK" })).rejects.toThrow(/POLICY_BLOCKED/);
    expect(await current("src/price.ts")).toEqual(before);
    expect((await taskState(c.task)).state).toBe("VERIFYING");
    expect(await q("select id from public.recovery_operations where proposal_id = $1", [c.proposal])).toEqual([]);
  });

  it("refuses a proposal that wasn't applied", async () => {
    const c = await appliedChange("Not applied", [{ path: "src/pending.ts", content: "p\n" }], "REQUIRE_APPROVAL", { apply: false });
    await expect(recover(c, [remove("src/pending.ts", "p\n")])).rejects.toThrow(/NOT_RECOVERABLE/);
    expect((await taskState(c.task)).state).toBe("APPROVAL_PENDING");
  });

  it("needs an owner or admin to undo an escalated change", async () => {
    await q("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'member') on conflict do nothing", [org, USERS.bob]);
    const c = await appliedChange("Escalated undo", [{ path: "package.json", content: "{}\n" }], "ESCALATE");
    await expect(recover(c, [remove("package.json", "{}\n")], { actor: USERS.bob })).rejects.toThrow(/APPROVER_ROLE_REQUIRED/);
    expect(await recover(c, [remove("package.json", "{}\n")])).toMatchObject({ status: "recovered" });
    await q("delete from public.organization_members where org_id = $1 and user_id = $2", [org, USERS.bob]);
  });
});

describe("recovery records", () => {
  it("never change, only the server writes them, and other organizations see nothing", async () => {
    const [row] = await q<{ id: string }>("select id from public.recovery_operations limit 1");
    await expect(q("update public.recovery_operations set status = 'recovered' where id = $1", [row!.id])).rejects.toThrow(/RECOVERY_IMMUTABLE/);
    await expect(asUser(USERS.alice, () => db.query("update public.recovery_operations set restored = 9"))).rejects.toThrow(/permission denied/);
    await expect(
      asUser(USERS.alice, () =>
        db.query("select public.app_recover_change(gen_random_uuid(), $1, '[]', $2, $2, 0, '[]', '{}', '{}', $2, 'recovered', 1, 1, 1)", [USERS.alice, H("a")]),
      ),
    ).rejects.toThrow(/permission denied/);
    expect((await asUser(USERS.alice, () => db.query("select id from public.recovery_operations"))).rows.length).toBeGreaterThan(0);
    expect((await asUser(USERS.bob, () => db.query("select id from public.recovery_operations"))).rows).toEqual([]);
  });

  it("go away with their task, without tripping the no-update rule", async () => {
    const c = await appliedChange("Removable", [{ path: "src/gone.ts", content: "g\n" }]);
    await recover(c, [remove("src/gone.ts", "g\n")]);
    await q("delete from public.tasks where id = $1", [c.task]);
    expect(await q("select id from public.recovery_operations where task_id = $1", [c.task])).toEqual([]);
  });
});
