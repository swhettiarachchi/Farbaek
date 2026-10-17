import { describe, expect, it } from "vitest";
import { buildRecoveryReceipt, recoveryReceiptDigest, RECOVERY_PREDICATE_TYPE } from "../proof/recovery-receipt";
import { canonicalHash } from "../trust/canonical-json";
import {
  RECOVERABLE_STATES,
  planRecovery,
  recoveryOperationHash,
  recoveryPlanHash,
  recoverySteps,
  selectOperations,
  type AppliedFile,
  type CurrentFile,
  type ReadyItem,
} from "./recovery";
import { newTask, transition, type TaskSnapshot, type TaskState } from "./task-machine";

const H = (c: string) => c.repeat(64);

const EDIT: AppliedFile = { path: "src/price.ts", kind: "edit", baseRevision: 2, baseSha256: H("1"), appliedRevision: 3, appliedSha256: H("2") };
const CREATE: AppliedFile = { path: "src/vat.ts", kind: "create", baseRevision: 0, baseSha256: null, appliedRevision: 1, appliedSha256: H("3") };
const now = (entries: Record<string, CurrentFile>) => new Map(Object.entries(entries));

describe("planRecovery", () => {
  it("restores an edited file and removes a created one while they still hold what was applied", () => {
    const items = planRecovery([EDIT, CREATE], now({ "src/price.ts": { revision: 3, sha256: H("2") }, "src/vat.ts": { revision: 1, sha256: H("3") } }));
    expect(items).toEqual([
      { path: "src/price.ts", kind: "edit", status: "ready", action: "restore", fromRevision: 3, fromSha256: H("2"), toRevision: 2, toSha256: H("1") },
      { path: "src/vat.ts", kind: "create", status: "ready", action: "remove", fromRevision: 1, fromSha256: H("3") },
    ]);
  });

  it("leaves files that changed after the apply, and counts files already back as done", () => {
    const items = planRecovery([EDIT, CREATE], now({ "src/price.ts": { revision: 4, sha256: H("9") }, "src/vat.ts": { revision: 2, sha256: H("8") } }));
    expect(items.map((i) => [i.path, i.status, i.status === "conflict" ? i.reason : null])).toEqual([
      ["src/price.ts", "conflict", "changed"],
      ["src/vat.ts", "conflict", "changed"],
    ]);
    const back = planRecovery([EDIT, CREATE], now({ "src/price.ts": { revision: 5, sha256: H("1") } }));
    expect(back.map((i) => i.status)).toEqual(["done", "done"]);
  });

  it("doesn't bring back an edited file that was deleted after the apply", () => {
    expect(planRecovery([EDIT], now({}))).toEqual([{ path: "src/price.ts", kind: "edit", status: "conflict", reason: "deleted", currentRevision: null }]);
  });

  it("still undoes a file whose newest revision holds the same content that was applied", () => {
    const [item] = planRecovery([EDIT], now({ "src/price.ts": { revision: 7, sha256: H("2") } }));
    expect(item).toMatchObject({ status: "ready", fromRevision: 7 });
  });
});

describe("plan hashes", () => {
  const items = planRecovery([EDIT, CREATE], now({ "src/price.ts": { revision: 3, sha256: H("2") }, "src/vat.ts": { revision: 1, sha256: H("3") } }));

  it("bind the approval to the exact plan, in any order", async () => {
    const a = await recoveryPlanHash({ taskId: "t1", proposalId: "p1", items });
    expect(await recoveryPlanHash({ taskId: "t1", proposalId: "p1", items: [...items].reverse() })).toBe(a);
    const moved = planRecovery([EDIT, CREATE], now({ "src/price.ts": { revision: 4, sha256: H("9") }, "src/vat.ts": { revision: 1, sha256: H("3") } }));
    expect(await recoveryPlanHash({ taskId: "t1", proposalId: "p1", items: moved })).not.toBe(a);
    expect(await recoveryPlanHash({ taskId: "t2", proposalId: "p1", items })).not.toBe(a);
  });

  it("give one operation per plan and choice of files", async () => {
    const one = await recoveryOperationHash({ planSha256: H("a"), paths: ["b", "a"] });
    expect(await recoveryOperationHash({ planSha256: H("a"), paths: ["a", "b", "a"] })).toBe(one);
    expect(await recoveryOperationHash({ planSha256: H("a"), paths: ["a"] })).not.toBe(one);
    expect(await recoveryOperationHash({ planSha256: H("b"), paths: ["a", "b"] })).not.toBe(one);
  });
});

describe("selectOperations", () => {
  const items = planRecovery([EDIT, CREATE, { ...EDIT, path: "src/cart.ts" }], now({ "src/price.ts": { revision: 3, sha256: H("2") }, "src/vat.ts": { revision: 1, sha256: H("3") }, "src/cart.ts": { revision: 9, sha256: H("7") } }));

  it("takes only files that can be undone, and says when the undo is complete", () => {
    const some = selectOperations(items, ["src/price.ts"]);
    expect(some).toMatchObject({ ok: true, complete: false });
    expect(some.ok && some.operations.map((o) => o.path)).toEqual(["src/price.ts"]);
    expect(selectOperations(items, ["src/cart.ts"])).toEqual({ ok: false, reason: "not_ready" });
    expect(selectOperations(items, [])).toEqual({ ok: false, reason: "empty" });
    // cart.ts changed, so even undoing every other file leaves the recovery partial.
    expect(selectOperations(items, ["src/price.ts", "src/vat.ts"])).toMatchObject({ ok: true, complete: false });
  });

  it("is complete when every file is back, and allows finishing with nothing to write", () => {
    const clean = planRecovery([EDIT, CREATE], now({ "src/price.ts": { revision: 3, sha256: H("2") }, "src/vat.ts": { revision: 1, sha256: H("3") } }));
    expect(selectOperations(clean, ["src/price.ts", "src/vat.ts"])).toMatchObject({ ok: true, complete: true });
    const back = planRecovery([EDIT], now({ "src/price.ts": { revision: 5, sha256: H("1") } }));
    expect(selectOperations(back, [])).toEqual({ ok: true, operations: [], complete: true });
  });
});

describe("recoverySteps", () => {
  function run(state: TaskState, events: NonNullable<ReturnType<typeof recoverySteps>>): TaskSnapshot | string {
    let task: TaskSnapshot = { ...newTask("t", "o"), state };
    for (const type of events) {
      const r = transition(task, { id: `${type}-${task.version}`, type, at: new Date(), actor: { kind: "user", id: "u" } }, task.version);
      if (!r.ok) return r.message;
      task = r.task;
    }
    return task;
  }

  it("are valid lifecycle paths that end recovered only when complete", () => {
    for (const state of RECOVERABLE_STATES) {
      const full = run(state, recoverySteps(state, true)!);
      expect(typeof full === "string" ? full : full.state).toBe("RECOVERED");
      const partial = run(state, recoverySteps(state, false)!);
      expect(typeof partial === "string" ? partial : partial.state).toBe("RECOVERY_PENDING");
    }
  });

  it("are refused for verified and other finished tasks", () => {
    for (const state of ["VERIFIED", "PARTIALLY_VERIFIED", "CANCELLED", "RECOVERED", "APPROVAL_PENDING"] as const) expect(recoverySteps(state, true)).toBeNull();
  });
});

describe("recovery receipts", () => {
  const items = planRecovery([EDIT, CREATE], now({ "src/price.ts": { revision: 3, sha256: H("2") }, "src/vat.ts": { revision: 1, sha256: H("3") } }));
  const ready = items.filter((i): i is ReadyItem => i.status === "ready");
  const input = {
    task: { id: "t1", organizationId: "o1", projectId: "p1" },
    proposal: { id: "p1", sha256: H("b") },
    proofPack: H("f"),
    plan: { sha256: H("c") },
    operationSha256: H("d"),
    policy: { outcome: "REQUIRE_APPROVAL", version: H("e"), findings: [] },
    approval: { approvedBy: "u1", approvedAt: "2026-10-17T10:00:00.000Z" },
    operations: ready,
    left: [],
    complete: true,
    createdAt: "2026-10-17T10:00:00.000Z",
  };

  it("are in-toto statements naming the restored content and the ProofPack being undone", async () => {
    const r = buildRecoveryReceipt(input);
    expect(r.predicateType).toBe(RECOVERY_PREDICATE_TYPE);
    expect(r.subject).toEqual([
      { name: "src/price.ts", digest: { sha256: H("1") } },
      { name: `proofpack:${H("f")}`, digest: { sha256: H("f") } },
    ]);
    expect(r.predicate.status).toBe("recovered");
    expect(r.predicate.operations).toEqual([
      { path: "src/price.ts", action: "restore", fromRevision: 3, fromSha256: H("2"), toRevision: 2, toSha256: H("1") },
      { path: "src/vat.ts", action: "remove", fromRevision: 1, fromSha256: H("3"), toRevision: null, toSha256: null },
    ]);
    expect(await recoveryReceiptDigest(r)).toBe(await canonicalHash(r));
  });

  it("state their limits, including a partial undo and what was left", () => {
    const r = buildRecoveryReceipt({ ...input, operations: ready.slice(0, 1), left: [{ path: "src/vat.ts", reason: "changed" }], complete: false, proofPack: null });
    expect(r.predicate.status).toBe("partially_recovered");
    expect(r.predicate.limits.join(" ")).toMatch(/No checks ran/);
    expect(r.predicate.limits.join(" ")).toMatch(/1 file was left as it is/);
    expect(r.predicate.limits.join(" ")).toMatch(/Partial/);
    expect(r.predicate.limits.join(" ")).toMatch(/no ProofPack/);
  });
});
