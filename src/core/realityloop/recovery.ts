/**
 * Recovery: undoing an applied change proposal (spec "Safe undo and
 * compensating recovery"). Every revision is kept, so the version before
 * the change is always on record. Undoing a file means writing that earlier
 * content back as a new revision, or removing a file the change created.
 *
 * The rules, in order:
 * - A file is only undone while it still holds exactly what was applied.
 *   If it changed since, it's a conflict and is left as it is: newer work
 *   is never overwritten.
 * - A file already back at its earlier content needs nothing.
 * - The plan is hashed, and the person approves that exact hash. Any change
 *   to the files before they confirm changes the hash, and the server
 *   refuses the stale approval.
 * - The task is recovered only when every file the change wrote is back
 *   at its earlier state. Otherwise it stays in recovery pending, so a
 *   partial undo is never reported as a full one.
 *
 * Only project files are covered. Anything done elsewhere with the applied
 * change (a deploy, a message, a payment) isn't undone here.
 */
import { canonicalHash } from "../trust/canonical-json";
import type { TaskEventType, TaskState } from "./task-machine";

export const RECOVERY_PLAN_SCHEMA = "farbaek.recovery-plan/v1";

/** One file a change proposal wrote, and the state it was written over. */
export interface AppliedFile {
  path: string;
  kind: "create" | "edit";
  /** The revision the change was made against; 0 for a new file. */
  baseRevision: number;
  /** Digest of the base revision's content; null for a new file. */
  baseSha256: string | null;
  /** The revision the change wrote, and the digest of its content. */
  appliedRevision: number;
  appliedSha256: string;
}

/** A path's current state in the project. */
export interface CurrentFile {
  revision: number;
  sha256: string;
}

export type RecoveryItem =
  | {
      path: string;
      kind: "edit";
      status: "ready";
      action: "restore";
      /** The current revision, which still holds the applied content. */
      fromRevision: number;
      fromSha256: string;
      /** The earlier revision whose content is written back. */
      toRevision: number;
      toSha256: string;
    }
  | { path: string; kind: "create"; status: "ready"; action: "remove"; fromRevision: number; fromSha256: string }
  | { path: string; kind: "create" | "edit"; status: "done" }
  | { path: string; kind: "create" | "edit"; status: "conflict"; reason: "changed" | "deleted"; currentRevision: number | null };

export type ReadyItem = Extract<RecoveryItem, { status: "ready" }>;

const byPath = (a: { path: string }, b: { path: string }) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

/** Decides, file by file, what undoing the change would do. */
export function planRecovery(applied: readonly AppliedFile[], current: ReadonlyMap<string, CurrentFile>): RecoveryItem[] {
  return [...applied].sort(byPath).map((f): RecoveryItem => {
    const now = current.get(f.path);
    if (f.kind === "create") {
      if (!now) return { path: f.path, kind: "create", status: "done" };
      if (now.sha256 === f.appliedSha256) return { path: f.path, kind: "create", status: "ready", action: "remove", fromRevision: now.revision, fromSha256: now.sha256 };
      return { path: f.path, kind: "create", status: "conflict", reason: "changed", currentRevision: now.revision };
    }
    if (now && now.sha256 === f.baseSha256) return { path: f.path, kind: "edit", status: "done" };
    if (!now) return { path: f.path, kind: "edit", status: "conflict", reason: "deleted", currentRevision: null };
    if (now.sha256 === f.appliedSha256 && f.baseSha256) {
      return { path: f.path, kind: "edit", status: "ready", action: "restore", fromRevision: now.revision, fromSha256: now.sha256, toRevision: f.baseRevision, toSha256: f.baseSha256 };
    }
    return { path: f.path, kind: "edit", status: "conflict", reason: "changed", currentRevision: now.revision };
  });
}

/** Binds a recovery approval to the task, the change and the exact plan the person saw. */
export function recoveryPlanHash(input: { taskId: string; proposalId: string; items: readonly RecoveryItem[] }): Promise<string> {
  return canonicalHash({ schema: RECOVERY_PLAN_SCHEMA, taskId: input.taskId, proposalId: input.proposalId, items: [...input.items].sort(byPath) });
}

/** Identifies one confirmed recovery: the plan plus the files chosen. A repeated request has the same hash and acts once. */
export function recoveryOperationHash(input: { planSha256: string; paths: readonly string[] }): Promise<string> {
  return canonicalHash({ schema: `${RECOVERY_PLAN_SCHEMA}#operation`, planSha256: input.planSha256, paths: [...new Set(input.paths)].sort() });
}

export type SelectionResult = { ok: true; operations: ReadyItem[]; complete: boolean } | { ok: false; reason: "empty" | "not_ready" };

/**
 * The operations for the chosen paths. Each must be ready; conflicts and
 * files already back can't be chosen. `complete` is true when, after these,
 * every file is back at its earlier state. Choosing nothing is allowed only
 * when every file is already back, which just finishes the recovery.
 */
export function selectOperations(items: readonly RecoveryItem[], paths: readonly string[]): SelectionResult {
  const chosen = new Set(paths);
  if (chosen.size === 0) return items.every((i) => i.status === "done") ? { ok: true, operations: [], complete: true } : { ok: false, reason: "empty" };
  const ready = new Map(items.filter((i): i is ReadyItem => i.status === "ready").map((i) => [i.path, i]));
  if ([...chosen].some((p) => !ready.has(p))) return { ok: false, reason: "not_ready" };
  const operations = [...ready.values()].filter((i) => chosen.has(i.path));
  const complete = items.every((i) => i.status === "done" || (i.status === "ready" && chosen.has(i.path)));
  return { ok: true, operations, complete };
}

/** Task states a change can be undone from. Verified and other finished tasks are closed records. */
export const RECOVERABLE_STATES: ReadonlySet<TaskState> = new Set(["VERIFYING", "FAILED", "INTERRUPTED", "RECOVERY_PENDING"]);

/**
 * The lifecycle steps for a recovery, or null when the task's state doesn't
 * allow one. Undoing during verification first stops it (interrupt). The
 * task reaches RECOVERED only when the undo is complete.
 */
export function recoverySteps(state: TaskState, complete: boolean): TaskEventType[] | null {
  const finish: TaskEventType[] = complete ? ["recover"] : [];
  switch (state) {
    case "VERIFYING":
      return ["interrupt", "plan_recovery", ...finish];
    case "FAILED":
    case "INTERRUPTED":
      return ["plan_recovery", ...finish];
    case "RECOVERY_PENDING":
      return finish;
    default:
      return null;
  }
}

export const RECOVERY_CONFLICT_LABELS: Record<"changed" | "deleted", string> = {
  changed: "Changed after the change was applied, so it's left as it is",
  deleted: "Deleted after the change was applied, so it isn't brought back",
};
