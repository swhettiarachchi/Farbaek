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

/** How the change happened, for people reading the report. */
export type DriftOrigin = "proposal" | "import" | "edit" | "delete";

export interface DriftFinding {
  path: string;
  operation: "files.create" | "files.edit" | "files.delete";
  reasons: DriftReason[];
  at: string;
  viaProposal: boolean;
  origin: DriftOrigin;
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
    if (reasons.length) {
      const origin: DriftOrigin = e.proposalId !== null ? "proposal" : e.change;
      findings.push({ path: e.path, operation, reasons, at: e.at, viaProposal: e.proposalId !== null, origin });
    }
  }
  return findings;
}

export interface DriftGroup {
  origin: DriftOrigin;
  count: number;
  /** Findings by folder (the path's first two segments), largest first. */
  folders: { folder: string; findings: DriftFinding[] }[];
}

function folderOf(path: string): string {
  const parts = path.split("/");
  return parts.length === 1 ? "(project root)" : parts.slice(0, Math.min(2, parts.length - 1)).join("/");
}

/** Groups findings by how they happened, then by folder, so a bulk import reads as one line. */
export function groupDrift(findings: readonly DriftFinding[]): DriftGroup[] {
  const order: DriftOrigin[] = ["proposal", "edit", "delete", "import"];
  return order
    .map((origin) => {
      const mine = findings.filter((f) => f.origin === origin);
      const byFolder = new Map<string, DriftFinding[]>();
      for (const f of mine) byFolder.set(folderOf(f.path), [...(byFolder.get(folderOf(f.path)) ?? []), f]);
      const folders = [...byFolder].map(([folder, list]) => ({ folder, findings: list })).sort((a, b) => b.findings.length - a.findings.length || a.folder.localeCompare(b.folder));
      return { origin, count: mine.length, folders };
    })
    .filter((g) => g.count > 0);
}

export const ORIGIN_LABELS: Record<DriftOrigin, string> = {
  proposal: "Applied from a reviewed change",
  edit: "Edited directly",
  delete: "Deleted",
  import: "Imported",
};

export const DRIFT_LABELS: Record<DriftReason, string> = {
  outside_paths: "outside the plan's paths",
  operation_forbidden: "an operation the plan forbids",
  operation_not_allowed: "an operation the plan doesn't allow",
};
