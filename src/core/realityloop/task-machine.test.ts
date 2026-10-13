import { describe, expect, it } from "vitest";
import { allowedEvents, newTask, transition, type TaskEvent, type TaskEventType, type TaskSnapshot } from "./task-machine";

let seq = 0;
const ev = (type: TaskEventType, over: Partial<TaskEvent> = {}): TaskEvent => ({
  id: `evt_${++seq}`,
  type,
  at: new Date("2026-10-13T10:00:00Z"),
  actor: { kind: "user", id: "usr_1" },
  ...over,
});

function run(task: TaskSnapshot, ...types: TaskEventType[]): TaskSnapshot {
  let current = task;
  for (const type of types) {
    const result = transition(current, ev(type), current.version);
    if (!result.ok) throw new Error(`${type}: ${result.message}`);
    current = result.task;
  }
  return current;
}

const toVerifying = (t: TaskSnapshot) =>
  run(t, "assemble_context", "draft_contract", "approve_contract", "propose_plan", "evaluate_policy", "require_approval", "grant_approval", "start_execution", "begin_verification");

const green = { checks: [{ name: "test", command: "pnpm test", exitCode: 0 }], proofPackDigest: "sha256:abc" };

describe("task lifecycle", () => {
  it("walks the happy path and records every transition", () => {
    const t = toVerifying(newTask("tsk_1", "org_a"));
    const done = transition(t, ev("mark_verified", { evidence: green }), t.version);
    expect(done).toMatchObject({ ok: true, applied: true });
    if (!done.ok) return;
    expect(done.task.state).toBe("VERIFIED");
    expect(done.task.version).toBe(10);
    expect(done.task.history.map((h) => h.to)).toEqual([
      "CONTEXT_ASSEMBLED",
      "CONTRACT_DRAFTED",
      "CONTRACT_APPROVED",
      "PLAN_PROPOSED",
      "POLICY_EVALUATED",
      "APPROVAL_PENDING",
      "EXECUTION_AUTHORIZED",
      "EXECUTING",
      "VERIFYING",
      "VERIFIED",
    ]);
  });

  it("skips approval when policy authorizes directly", () => {
    const t = run(newTask("t", "o"), "assemble_context", "draft_contract", "approve_contract", "propose_plan", "evaluate_policy", "authorize");
    expect(t.state).toBe("EXECUTION_AUTHORIZED");
  });

  it("rejects transitions the table doesn't allow", () => {
    const t = newTask("t", "o");
    expect(transition(t, ev("start_execution"), 0)).toMatchObject({ ok: false, code: "INVALID_TRANSITION" });
  });

  it("uses optimistic concurrency", () => {
    const t = run(newTask("t", "o"), "assemble_context");
    expect(transition(t, ev("draft_contract"), 0)).toMatchObject({ ok: false, code: "VERSION_CONFLICT" });
  });

  it("treats a replayed event as a no-op, even with a stale version", () => {
    const t = newTask("t", "o");
    const e = ev("assemble_context");
    const first = transition(t, e, 0);
    if (!first.ok) throw new Error("expected ok");
    const replay = transition(first.task, e, 0);
    expect(replay).toEqual({ ok: true, task: first.task, applied: false });
  });

  it("can be cancelled from any non-terminal state, and terminal states are final", () => {
    const t = run(newTask("t", "o"), "assemble_context", "cancel");
    expect(t.state).toBe("CANCELLED");
    expect(transition(t, ev("draft_contract"), t.version)).toMatchObject({ ok: false, code: "TERMINAL_STATE" });
    expect(allowedEvents("CANCELLED")).toEqual([]);
    expect(allowedEvents("RECEIVED")).toEqual(["assemble_context", "cancel"]);
  });

  it("sends a blocked plan back to contract revision", () => {
    const t = run(newTask("t", "o"), "assemble_context", "draft_contract", "approve_contract", "propose_plan", "evaluate_policy", "block", "revise_contract");
    expect(t.state).toBe("CONTRACT_DRAFTED");
  });

  it("recovers from interruption only through a recovery plan", () => {
    const t = run(toVerifying(newTask("t", "o")), "interrupt", "plan_recovery", "recover");
    expect(t.state).toBe("RECOVERED");
  });
});

describe("verification guards", () => {
  const verifying = toVerifying(newTask("t", "o"));
  const attempt = (type: TaskEventType, evidence?: TaskEvent["evidence"]) => transition(verifying, ev(type, { evidence }), verifying.version);

  it("never marks a task verified without evidence", () => {
    expect(attempt("mark_verified")).toMatchObject({ ok: false, code: "GUARD_FAILED" });
    expect(attempt("mark_verified", { checks: [] , proofPackDigest: "x" })).toMatchObject({ code: "GUARD_FAILED" });
  });

  it("treats a check that did not run as not passing", () => {
    const notRun = { checks: [{ name: "e2e", command: "pnpm e2e", exitCode: null }], proofPackDigest: "x" };
    expect(attempt("mark_verified", notRun)).toMatchObject({ code: "GUARD_FAILED" });
  });

  it("requires every check to exit 0 and a ProofPack digest", () => {
    const oneFailed = { checks: [...green.checks, { name: "lint", command: "pnpm lint", exitCode: 1 }], proofPackDigest: "x" };
    expect(attempt("mark_verified", oneFailed)).toMatchObject({ code: "GUARD_FAILED" });
    expect(attempt("mark_verified", { checks: green.checks })).toMatchObject({ code: "GUARD_FAILED" });
    expect(attempt("mark_verified", green)).toMatchObject({ ok: true });
  });

  it("allows partial verification only for mixed results", () => {
    const mixed = { checks: [...green.checks, { name: "e2e", command: "pnpm e2e", exitCode: null }] };
    expect(attempt("mark_partially_verified", mixed)).toMatchObject({ ok: true });
    expect(attempt("mark_partially_verified", green)).toMatchObject({ code: "GUARD_FAILED" });
  });

  it("refuses to mark all-green results as failed", () => {
    expect(attempt("mark_failed", green)).toMatchObject({ code: "GUARD_FAILED" });
    expect(attempt("mark_failed", { checks: [{ name: "test", command: "pnpm test", exitCode: 2 }] })).toMatchObject({ ok: true });
  });
});

describe("discarding a proposed change", () => {
  const approved = () => run(newTask("t1", "o1"), "assemble_context", "draft_contract", "approve_contract");

  it("returns to the approved contract from approval or a block, so the task can try again", () => {
    const pending = run(approved(), "propose_plan", "evaluate_policy", "require_approval");
    expect(run(pending, "discard_plan").state).toBe("CONTRACT_APPROVED");
    const blocked = run(approved(), "propose_plan", "evaluate_policy", "block");
    expect(run(blocked, "discard_plan").state).toBe("CONTRACT_APPROVED");
  });

  it("can't discard once execution is authorized", () => {
    const authorized = run(approved(), "propose_plan", "evaluate_policy", "require_approval", "grant_approval");
    expect(transition(authorized, ev("discard_plan"), authorized.version)).toMatchObject({ ok: false, code: "INVALID_TRANSITION" });
  });
});
