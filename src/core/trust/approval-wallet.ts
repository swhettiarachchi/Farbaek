/**
 * The Approval Wallet (ADR 0042): what a card in the approvals inbox says
 * about one waiting proposal. Facts only, each in words: how long it can
 * still be approved, and what the policy, the contract and the Intent Diff
 * Lens found. There is no risk score; nothing here would back one.
 *
 * The window itself is set and enforced by the database. This reads it.
 */
import type { LensSummary } from "@/core/realityloop/intent-lens";

/** Under this much time left, a card says the window is closing. */
export const CLOSING_MS = 12 * 3_600_000;

export type WindowState = "open" | "closing" | "expired";

export interface ApprovalWindow {
  state: WindowState;
  msLeft: number;
  /** Share of the window still left, 0 to 1, for the bar under the timer. */
  fractionLeft: number;
}

export function approvalWindow(createdAt: string, expiresAt: string, now: Date): ApprovalWindow {
  const start = Date.parse(createdAt);
  const end = Date.parse(expiresAt);
  // An unreadable end date fails closed: the card says it can't be approved.
  if (!Number.isFinite(end) || now.getTime() >= end) return { state: "expired", msLeft: 0, fractionLeft: 0 };
  const msLeft = end - now.getTime();
  const total = end - start;
  const fractionLeft = Number.isFinite(total) && total > 0 ? Math.min(1, msLeft / total) : 0;
  return { state: msLeft < CLOSING_MS ? "closing" : "open", msLeft, fractionLeft };
}

export type FactTone = "failed" | "approval" | "neutral";

export interface WalletFact {
  kind: "escalated" | "flagged" | "unexplained" | "matched" | "files";
  tone: FactTone;
  label: string;
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function walletRisk(input: { policyOutcome: string | null; lens: LensSummary | null; changes: readonly { kind: "create" | "edit" }[] }): WalletFact[] {
  const facts: WalletFact[] = [];
  if (input.policyOutcome === "ESCALATE") facts.push({ kind: "escalated", tone: "approval", label: "Escalated: an owner or admin approves" });
  const lens = input.lens;
  if (lens && lens.hunks > 0) {
    if (lens.flagged) facts.push({ kind: "flagged", tone: "failed", label: `${count(lens.flagged, "change")} flagged by the plan` });
    if (lens.unexplained) facts.push({ kind: "unexplained", tone: "approval", label: `${count(lens.unexplained, "change")} that no line of the plan explains` });
    if (lens.matched) facts.push({ kind: "matched", tone: "neutral", label: `${count(lens.matched, "change")} ${lens.matched === 1 ? "shares" : "share"} words with the plan` });
  }
  const created = input.changes.filter((c) => c.kind === "create").length;
  const edited = input.changes.length - created;
  const files = [created ? count(created, "new file") : null, edited ? count(edited, "edited file") : null].filter(Boolean).join(", ");
  if (files) facts.push({ kind: "files", tone: "neutral", label: files });
  return facts;
}
