import { CheckCircleIcon, CircleNotchIcon, GitMergeIcon, WarningCircleIcon, XCircleIcon } from "@phosphor-icons/react/ssr";
import { RelativeTime } from "@/components/ui/local-time";
import type { CheckResult, PullState } from "@/core/github/pull-request";
import type { PullRequestView } from "@/server/github/store";

// A state is its words in a colour and border (ADR 0180); a mark only once it ended.
const STATE: Record<PullState, { word: string; Icon: typeof CheckCircleIcon | null; chip: string }> = {
  open: { word: "Open", Icon: null, chip: "border-info/40 text-info" },
  merged: { word: "Merged", Icon: GitMergeIcon, chip: "border-verified/45 bg-verified/[0.08] text-verified" },
  closed: { word: "Closed without merging", Icon: null, chip: "border-dashed border-line-strong text-ink-2" },
};

const RESULT: Record<CheckResult, { word: string; Icon: typeof CheckCircleIcon | null; className: string; live?: boolean }> = {
  passed: { word: "Passed", Icon: CheckCircleIcon, className: "text-verified" },
  failed: { word: "Failed", Icon: XCircleIcon, className: "text-failed" },
  pending: { word: "Running", Icon: CircleNotchIcon, className: "text-approval", live: true },
  skipped: { word: "Skipped", Icon: null, className: "text-ink-3" },
};

/**
 * What GitHub said about the pull request when Farbaek last read it (ADR
 * 0143): open, merged or closed, and the checks GitHub ran on its head. Read
 * hourly and on request; the time it was read is always shown.
 */
export function PullOnGitHub({ pull }: { pull: PullRequestView }) {
  if (!pull.syncedAt) return <p className="text-sm text-ink-3">Not read back from GitHub yet. It&apos;s read every hour, or check now.</p>;
  const state = pull.prState ? STATE[pull.prState] : null;
  const checks = pull.checks;
  return (
    <div className="grid gap-2.5 rounded-sm border border-line bg-surface-raised/50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">On GitHub</span>
        {state ? (
          <span className={`inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium ${state.chip}`}>
            {state.Icon ? <state.Icon size={14} weight="bold" aria-hidden /> : null}
            {state.word}
          </span>
        ) : null}
        <span className="text-xs text-ink-3">
          read <RelativeTime iso={pull.syncedAt} />
        </span>
      </div>
      {pull.prState === "merged" && pull.mergedAt ? (
        <p className="text-sm text-ink-2">
          Merged <RelativeTime iso={pull.mergedAt} />
          {pull.headSha && pull.headSha !== pull.commitSha ? ", with commits added on GitHub after Farbaek's" : null}.
        </p>
      ) : null}
      {pull.syncProblem ? (
        <p className="flex items-start gap-2 text-sm text-approval">
          <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden /> {pull.syncProblem}
        </p>
      ) : null}
      {checks && checks.total > 0 ? (
        <div className="grid gap-1.5">
          <p className="text-sm">
            GitHub&apos;s checks: {checks.passed} of {checks.total} passed
            {checks.failed ? `, ${checks.failed} failed` : ""}
            {checks.pending ? `, ${checks.pending} still running` : ""}.
          </p>
          <ul className="grid gap-1">
            {checks.runs.map((r, i) => {
              const look = RESULT[r.result];
              return (
                <li key={`${r.name}-${i}`} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className={`inline-flex items-center gap-1 ${look.className}`}>
                    {look.Icon ? <look.Icon size={14} weight="bold" className={look.live ? "motion-safe:animate-spin" : undefined} aria-hidden /> : null} {look.word}
                  </span>
                  <span className="min-w-0 break-words text-ink-2">{r.name}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : checks ? (
        <p className="text-sm text-ink-3">GitHub has no checks on this commit.</p>
      ) : pull.prState ? (
        <p className="text-sm text-ink-3">GitHub&apos;s checks couldn&apos;t be read: the token needs Checks read access to show them.</p>
      ) : null}
    </div>
  );
}
