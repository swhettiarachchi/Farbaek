/**
 * Counterfactual policy replay (ADR 0081): what level 2, with limits a person
 * is considering, would have done with each of the workspace's past changes.
 * It runs the same policy as shadow mode (ADR 0075) over each change's shape,
 * so a replay and a rehearsal judge alike. Nothing is applied or changed.
 *
 * What can't be known after the fact is assumed and said: whether a verified
 * sandbox was connected when each change was made is taken from today.
 */
import { evaluateChangePolicy } from "./policy";
import type { RehearsalRow } from "./rehearsal";

export interface ReplayChange {
  proposalId: string;
  taskId: string;
  createdAt: string;
  status: RehearsalRow["status"];
  files: { path: string; kind: "create" | "edit" }[];
  violations: number;
  fromAgent: boolean;
  hasChecks: boolean;
  evidence: RehearsalRow["evidence"];
}

export interface ReplayResult {
  rows: RehearsalRow[];
  /** Changes the desktop agent made: level 2 never applies those, so they're left out. */
  leftOut: number;
}

export async function replayLimits(changes: readonly ReplayChange[], limits: { maxFiles: number; allowCreates: boolean }, sandboxConnected: boolean): Promise<ReplayResult> {
  const rows: RehearsalRow[] = [];
  let leftOut = 0;
  for (const c of changes) {
    if (c.fromAgent) {
      leftOut++;
      continue;
    }
    const decision = await evaluateChangePolicy({
      files: c.files,
      contractViolations: c.violations > 0 ? [{ kind: "replay", detail: "It broke its contract." }] : [],
      autonomy: { level: 2, maxFiles: limits.maxFiles, allowCreates: limits.allowCreates, rehearsal: true },
      verifiable: c.hasChecks && sandboxConnected,
    });
    if (!decision.shadow) continue;
    rows.push({ proposalId: c.proposalId, taskId: c.taskId, createdAt: c.createdAt, status: c.status, evidence: c.evidence, shadow: { outcome: decision.shadow.outcome, reasons: decision.shadow.reasons } });
  }
  return { rows, leftOut };
}
