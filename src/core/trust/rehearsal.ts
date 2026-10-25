/**
 * Shadow mode's record (ADR 0075): what level 2 would have done with each
 * change made while the workspace rehearsed, set against what really
 * happened to those changes, so an owner judges autonomy on its record
 * before turning it on. Simulated decisions are never counted as real ones.
 */
import type { RehearsalReason, ShadowDecision } from "./policy";

export interface RehearsalRow {
  proposalId: string;
  taskId: string;
  createdAt: string;
  /** What really happened to the change. */
  status: "pending" | "blocked" | "applied" | "discarded";
  /** Its newest ProofPack's status, once applied. */
  evidence: "unverified" | "partially_verified" | "verified" | "failed" | null;
  shadow: Pick<ShadowDecision, "outcome" | "reasons">;
}

export type RehearsalVerdict = "nothing_yet" | "none_would_apply" | "would_have_paused" | "people_disagreed" | "held_up";

export interface RehearsalSummary {
  total: number;
  wouldApply: number;
  wouldWait: number;
  /** The changes level 2 would have applied, by what happened to them. */
  outcomes: { verified: number; partly: number; failed: number; unchecked: number; discarded: number; pending: number };
  /** Why the others would have waited, most common first. */
  reasons: { reason: RehearsalReason; count: number }[];
  verdict: RehearsalVerdict;
  /** A change to look at first: one level 2 would have applied that failed its checks, or that a person discarded. */
  example: { taskId: string; kind: "failed" | "discarded" } | null;
}

export const REASON_WORDS: Record<RehearsalReason, string> = {
  blocked: "the policy blocked it",
  escalated: "it needed an owner or admin",
  too_many_files: "it changed more files than the limit",
  creates_files: "it created new files",
  not_verifiable: "nothing could check it",
};

export function summarizeRehearsal(rows: readonly RehearsalRow[]): RehearsalSummary {
  const would = rows.filter((r) => r.shadow.outcome === "ALLOW_WITHIN_LIMITS");
  const outcomes = { verified: 0, partly: 0, failed: 0, unchecked: 0, discarded: 0, pending: 0 };
  for (const r of would) {
    if (r.status === "discarded") outcomes.discarded++;
    else if (r.status !== "applied") outcomes.pending++;
    else if (r.evidence === "verified") outcomes.verified++;
    else if (r.evidence === "failed") outcomes.failed++;
    else if (r.evidence === "partially_verified") outcomes.partly++;
    else outcomes.unchecked++;
  }

  const counts = new Map<RehearsalReason, number>();
  for (const r of rows) if (r.shadow.outcome !== "ALLOW_WITHIN_LIMITS") for (const reason of r.shadow.reasons) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  const reasons = [...counts].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));

  // A failed check outranks everything: level 2 would have paused itself (ADR 0046).
  const failed = would.find((r) => r.status === "applied" && r.evidence === "failed");
  const discarded = would.find((r) => r.status === "discarded");
  const verdict: RehearsalVerdict =
    rows.length === 0 ? "nothing_yet" : would.length === 0 ? "none_would_apply" : failed ? "would_have_paused" : discarded ? "people_disagreed" : "held_up";
  const example = failed ? { taskId: failed.taskId, kind: "failed" as const } : discarded ? { taskId: discarded.taskId, kind: "discarded" as const } : null;

  return { total: rows.length, wouldApply: would.length, wouldWait: rows.length - would.length, outcomes, reasons, verdict, example };
}
