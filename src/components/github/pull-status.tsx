import { StatusBadge, type Status } from "@/components/ui/status-badge";
import type { CommitStatusState } from "@/server/github/store";

// Each posted status is its kind (ADR 0183): its words, icon, colour and border, never colour alone.
const LOOK: Record<CommitStatusState | "none", { word: string; kind: Status }> = {
  success: { word: "ProofPack verified", kind: "verified" },
  failure: { word: "Not passing", kind: "failed" },
  pending: { word: "Not verified yet", kind: "unverified" },
  none: { word: "No status posted", kind: "off" },
};

/** The "Farbaek ProofPack" status Farbaek last posted on GitHub. */
export function PullStatusChip({ state }: { state: CommitStatusState | null }) {
  const look = LOOK[state ?? "none"];
  return <StatusBadge status={look.kind} label={look.word} />;
}
