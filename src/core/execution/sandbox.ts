/**
 * The execution boundary (ADR 0003). Project code only ever runs through a
 * SandboxProvider, and only when its isolation is verified. Otherwise
 * Farbaek works in Review Only: plans, patches and diffs, no execution.
 * A normal child process is never presented as a sandbox.
 *
 * Verification outcomes come only from real exit codes: a check that didn't
 * run (exitCode null) never counts as passing.
 */
import type { CheckResult, TaskEventType } from "../realityloop/task-machine";

export type IsolationLevel = "microvm" | "container" | "process" | "none";

export interface SandboxCapabilities {
  /** Display name, for example "E2B". */
  provider: string;
  isolation: IsolationLevel;
  /** True only when the provider's isolation was confirmed for this deployment, not just claimed. */
  verified: boolean;
  networkEgress: "deny_all" | "allowlist" | "open";
  maxDurationSeconds: number;
  maxMemoryMb: number;
}

export interface CommandResult {
  command: string;
  /** null when the command didn't run or was stopped before it exited. */
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

/** Anything that can say what isolation it gives. The full runtime contract is SandboxRuntime in src/core/sandbox/runtime.ts. */
export interface SandboxProvider {
  readonly capabilities: SandboxCapabilities;
}

export type ExecutionMode = { mode: "sandboxed"; provider: string } | { mode: "review_only"; reason: string };

/** Decides whether project code may run. Anything short of verified microVM-class isolation with restricted egress is Review Only. */
export function executionMode(provider: SandboxProvider | null, notConnectedReason = "No isolated sandbox is connected."): ExecutionMode {
  if (!provider) return { mode: "review_only", reason: notConnectedReason };
  const c = provider.capabilities;
  if (c.isolation !== "microvm") return { mode: "review_only", reason: `${c.provider} doesn't provide microVM isolation, so project code won't run there.` };
  if (!c.verified) return { mode: "review_only", reason: `${c.provider}'s isolation hasn't been verified for this deployment yet.` };
  if (c.networkEgress === "open") return { mode: "review_only", reason: `${c.provider} allows open network access. Restrict egress before running project code.` };
  return { mode: "sandboxed", provider: c.provider };
}

export function toCheckResults(results: readonly CommandResult[]): CheckResult[] {
  return results.map((r) => ({ name: r.command, command: r.command, exitCode: r.timedOut ? null : r.exitCode }));
}

/**
 * The lifecycle event that real check results support, mirroring the state
 * machine's guards. Every check passed and a ProofPack exists: verified.
 * Some passed: partially verified. None passed: failed. Returns null when
 * no transition is honest yet: no checks ran, or all passed but the
 * ProofPack doesn't exist.
 */
export function verificationEvent(
  checks: readonly CheckResult[],
  hasProofPack: boolean,
): Extract<TaskEventType, "mark_verified" | "mark_partially_verified" | "mark_failed"> | null {
  if (checks.length === 0) return null;
  const passed = checks.filter((c) => c.exitCode === 0).length;
  if (passed === checks.length) return hasProofPack ? "mark_verified" : null;
  return passed > 0 ? "mark_partially_verified" : "mark_failed";
}
