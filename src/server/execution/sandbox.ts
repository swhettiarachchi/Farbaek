/**
 * The execution mode shown across the app (Settings, tasks, ProofPacks).
 * It comes from the sandbox runtime registry (ADR 0013): Sandboxed only with
 * a connected runtime whose microVM isolation was verified on this
 * deployment; otherwise Review Only, with the reason.
 */
import type { ExecutionMode } from "@/core/execution/sandbox";
import { sandboxExecutionMode } from "@/server/sandbox/registry";

export function currentExecutionMode(): ExecutionMode {
  return sandboxExecutionMode();
}
