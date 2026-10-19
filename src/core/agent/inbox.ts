/**
 * The agent inbox on Mission Control: every recent run in the lane that says
 * what it needs from the person. A run waiting on an approval needs them now;
 * one that finished with a change still to review is ready for them; the rest
 * are working or done.
 */
import type { RunStatus } from "./cloud-run";

export const INBOX_LANES = ["needs_you", "working", "review", "done"] as const;
export type InboxLane = (typeof INBOX_LANES)[number];

export const INBOX_LANE_LABELS: Record<InboxLane, { title: string; empty: string }> = {
  needs_you: { title: "Needs you", empty: "Nothing is waiting on you." },
  working: { title: "Working", empty: "No agent is working right now." },
  review: { title: "Ready for review", empty: "No changes are waiting for review." },
  done: { title: "Done", empty: "Finished runs show here." },
};

/** A run's proposal as stored (`change_proposals.status`), or "other" when it couldn't be read. */
export type ProposalState = "pending" | "blocked" | "applied" | "discarded" | "other";

export function inboxLane(status: RunStatus, proposal: ProposalState | null): InboxLane {
  if (status === "waiting") return "needs_you";
  if (status === "starting" || status === "working") return "working";
  // Blocked by the contract checks still needs a person to look at it.
  if (status === "finished" && (proposal === "pending" || proposal === "blocked")) return "review";
  return "done";
}

export interface InboxRun {
  id: string;
  status: RunStatus;
  proposalId: string | null;
}

/** Runs sorted into lanes, keeping their order (newest first); Done keeps only the latest few. */
export function groupInbox<R extends InboxRun>(runs: readonly R[], proposals: ReadonlyMap<string, ProposalState>, doneLimit = 4): Record<InboxLane, R[]> {
  const lanes: Record<InboxLane, R[]> = { needs_you: [], working: [], review: [], done: [] };
  for (const r of runs) {
    const proposal = r.proposalId ? (proposals.get(r.proposalId) ?? "other") : null;
    lanes[inboxLane(r.status, proposal)].push(r);
  }
  lanes.done = lanes.done.slice(0, doneLimit);
  return lanes;
}

/** The workspace's agents at a glance, for the presence orb in the app's chrome. */
export interface AgentPresence {
  state: "idle" | "working" | "waiting";
  /** Live runs (starting, working or waiting). */
  count: number;
  /** The run to open: the one waiting for a person, or the only live one. */
  runId: string | null;
}

export function agentPresence(runs: readonly { id: string; status: RunStatus }[]): AgentPresence {
  const live = runs.filter((r) => r.status === "starting" || r.status === "working" || r.status === "waiting");
  const waiting = live.find((r) => r.status === "waiting");
  if (waiting) return { state: "waiting", count: live.length, runId: waiting.id };
  if (live.length) return { state: "working", count: live.length, runId: live.length === 1 ? live[0]!.id : null };
  return { state: "idle", count: 0, runId: null };
}

export const PRESENCE_LABELS: Record<AgentPresence["state"], (count: number) => string> = {
  idle: () => "No agent running",
  working: (n) => (n === 1 ? "Agent working" : `${n} agents working`),
  waiting: () => "Agent needs you",
};

/** The first sentence of a longer text, for a one-line summary. */
export function firstSentence(text: string | null | undefined, max = 140): string | null {
  if (!text) return null;
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  const end = clean.search(/[.!?](\s|$)/);
  const sentence = end === -1 ? clean : clean.slice(0, end + 1);
  return sentence.length > max ? `${sentence.slice(0, max - 1).trimEnd()}…` : sentence;
}
