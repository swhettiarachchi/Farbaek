import { describe, expect, it } from "vitest";
import { newTask, transition, type TaskSnapshot } from "../realityloop/task-machine";
import { executionMode, toCheckResults, verificationEvent, type CommandResult, type SandboxCapabilities, type SandboxProvider } from "./sandbox";

/** Test double only. Never used outside tests (ADR 0003). */
function mockProvider(over: Partial<SandboxCapabilities> = {}): SandboxProvider {
  return {
    capabilities: { provider: "MockSandbox", isolation: "microvm", verified: true, networkEgress: "deny_all", maxDurationSeconds: 600, maxMemoryMb: 2048, ...over },
  };
}

const run = (command: string, exitCode: number | null, timedOut = false): CommandResult => ({ command, exitCode, stdout: "", stderr: "", durationMs: 10, timedOut });

describe("executionMode", () => {
  it("is Review Only with no provider, and says why", () => {
    expect(executionMode(null)).toEqual({ mode: "review_only", reason: "No isolated sandbox is connected." });
  });

  it("runs only with verified microVM isolation and restricted egress", () => {
    expect(executionMode(mockProvider())).toEqual({ mode: "sandboxed", provider: "MockSandbox" });
    expect(executionMode(mockProvider({ networkEgress: "allowlist" }))).toMatchObject({ mode: "sandboxed" });
    expect(executionMode(mockProvider({ isolation: "container" }))).toMatchObject({ mode: "review_only", reason: expect.stringContaining("microVM") });
    expect(executionMode(mockProvider({ isolation: "process" }))).toMatchObject({ mode: "review_only" });
    expect(executionMode(mockProvider({ verified: false }))).toMatchObject({ mode: "review_only", reason: expect.stringContaining("verified") });
    expect(executionMode(mockProvider({ networkEgress: "open" }))).toMatchObject({ mode: "review_only", reason: expect.stringContaining("network") });
  });
});

describe("verification from real exit codes", () => {
  it("never counts a timed-out or skipped check as passing", () => {
    expect(toCheckResults([run("pnpm test", 0, true), run("pnpm lint", null)]).map((c) => c.exitCode)).toEqual([null, null]);
  });

  it("chooses the event the evidence supports, and nothing when no transition is honest", () => {
    const pass = toCheckResults([run("pnpm test", 0), run("pnpm typecheck", 0)]);
    const mixed = toCheckResults([run("pnpm test", 0), run("pnpm typecheck", 2)]);
    const fail = toCheckResults([run("pnpm test", 1)]);
    expect(verificationEvent(pass, true)).toBe("mark_verified");
    expect(verificationEvent(pass, false)).toBeNull();
    expect(verificationEvent(mixed, true)).toBe("mark_partially_verified");
    expect(verificationEvent(fail, true)).toBe("mark_failed");
    expect(verificationEvent([], true)).toBeNull();
  });

  it("agrees with the state machine's guards", () => {
    let task: TaskSnapshot = newTask("t", "o");
    for (const type of ["assemble_context", "draft_contract", "approve_contract", "propose_plan", "evaluate_policy", "require_approval", "grant_approval", "start_execution", "begin_verification"] as const) {
      const r = transition(task, { id: type, type, at: new Date(), actor: { kind: "system", id: "t" } }, task.version);
      if (!r.ok) throw new Error(r.message);
      task = r.task;
    }
    const cases = [
      { checks: toCheckResults([run("a", 0), run("b", 0)]), proof: true },
      { checks: toCheckResults([run("a", 0), run("b", 1)]), proof: false },
      { checks: toCheckResults([run("a", 1)]), proof: false },
    ];
    for (const c of cases) {
      const type = verificationEvent(c.checks, c.proof)!;
      const r = transition(task, { id: `v-${type}`, type, at: new Date(), actor: { kind: "system", id: "t" }, evidence: { checks: c.checks, proofPackDigest: c.proof ? "sha256:x" : undefined } }, task.version);
      expect(r.ok, type).toBe(true);
    }
  });
});
