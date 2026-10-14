/**
 * Scope drift: file changes made after a contract was approved that the
 * contract doesn't cover. Proposals are checked before they apply, but files
 * can also change by direct edits, imports, restores and deletes; this
 * compares every one of those with the contract, whatever made it.
 *
 * Each change maps to an operation: a first revision is files.create, a
 * later one files.edit, a deletion files.delete. A change drifts when its
 * operation is forbidden, when it isn't among the allowed operations, or
 * when its path is outside the contract's path scope (resources written as
 * paths; see pathScope).
 */
import { pathScope } from "./change-proposal";
import type { IntentContract } from "./contract";

export interface FileChangeEvent {
  path: string;
  change: "import" | "edit" | "delete";
  revision: number;
  at: string;
  /** Set when the change was applied from a reviewed proposal. */
  proposalId: string | null;
}

export type DriftReason = "outside_paths" | "operation_forbidden" | "operation_not_allowed";

export interface DriftFinding {
  path: string;
  operation: "files.create" | "files.edit" | "files.delete";
  reasons: DriftReason[];
  at: string;
  viaProposal: boolean;
}

export function operationOf(event: FileChangeEvent): DriftFinding["operation"] {
  if (event.change === "delete") return "files.delete";
  return event.revision === 1 ? "files.create" : "files.edit";
}

/** Every change in `events` that the contract doesn't cover, oldest first. */
export function scopeDrift(contract: IntentContract, events: readonly FileChangeEvent[]): DriftFinding[] {
  const scope = pathScope(contract);
  const findings: DriftFinding[] = [];
  for (const e of [...events].sort((a, b) => a.at.localeCompare(b.at))) {
    const operation = operationOf(e);
    const reasons: DriftReason[] = [];
    if (contract.forbiddenOperations.includes(operation)) reasons.push("operation_forbidden");
    else if (!contract.allowedOperations.includes(operation)) reasons.push("operation_not_allowed");
    if (scope.length > 0 && !scope.some((s) => e.path === s || e.path.startsWith(`${s}/`))) reasons.push("outside_paths");
    if (reasons.length) findings.push({ path: e.path, operation, reasons, at: e.at, viaProposal: e.proposalId !== null });
  }
  return findings;
}

export const DRIFT_LABELS: Record<DriftReason, string> = {
  outside_paths: "outside the contract's paths",
  operation_forbidden: "an operation the contract forbids",
  operation_not_allowed: "an operation the contract doesn't allow",
};
