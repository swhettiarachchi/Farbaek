import { CheckCircleIcon, CircleDashedIcon, MinusCircleIcon, XCircleIcon } from "@phosphor-icons/react/ssr";
import type { CommitStatusState } from "@/server/github/store";

const LOOK: Record<CommitStatusState | "none", { word: string; Icon: typeof CheckCircleIcon; chip: string }> = {
  success: { word: "ProofPack verified", Icon: CheckCircleIcon, chip: "border-verified/45 bg-verified/[0.08] text-verified" },
  failure: { word: "Not passing", Icon: XCircleIcon, chip: "border-failed/45 bg-failed/[0.08] text-failed" },
  pending: { word: "Not verified yet", Icon: CircleDashedIcon, chip: "border-dashed border-line-strong/60 bg-surface text-ink-2" },
  none: { word: "No status posted", Icon: MinusCircleIcon, chip: "border-line bg-surface-raised text-ink-3" },
};

/** The "Farbaek ProofPack" status Farbaek last posted on GitHub: icon, words and border, never colour alone. */
export function PullStatusChip({ state }: { state: CommitStatusState | null }) {
  const look = LOOK[state ?? "none"];
  return (
    <span className={`inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium ${look.chip}`}>
      <look.Icon size={14} weight="bold" aria-hidden />
      {look.word}
    </span>
  );
}
