import { WarningCircleIcon } from "@phosphor-icons/react/ssr";
import { RelativeTime } from "@/components/ui/local-time";
import { StatusBadge, StatusGlyph, type Status } from "@/components/ui/status-badge";
import type { CheckResult, PullState } from "@/core/github/pull-request";
import type { PullRequestView } from "@/server/github/store";

// Each state is its kind (ADR 0183): an open pull request is a fact, merged is done and proven, closed is off.
const STATE: Record<PullState, { word: string; kind: Status }> = {
  open: { word: "Open", kind: "info" },
  merged: { word: "Merged", kind: "verified" },
  closed: { word: "Closed without merging", kind: "off" },
};

const RESULT: Record<CheckResult, { word: string; kind: Status }> = {
  passed: { word: "Passed", kind: "verified" },
  failed: { word: "Failed", kind: "failed" },
  pending: { word: "Running", kind: "working" },
  skipped: { word: "Skipped", kind: "off" },
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
        {state ? <StatusBadge status={state.kind} label={state.word} /> : null}
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
        <p className="flex items-start gap-2 text-sm text-ink-2">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-caution" aria-hidden /> {pull.syncProblem}
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
                  <span className="inline-flex items-center gap-1.5 text-ink">
                    <StatusGlyph status={look.kind} size={14} /> {look.word}
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
