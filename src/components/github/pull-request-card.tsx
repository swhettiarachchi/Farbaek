import { ArrowUpRightIcon, GitPullRequestIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { Card, CardTitle } from "@/components/app/primitives";
import { RelativeTime } from "@/components/ui/local-time";
import type { PullRequestView } from "@/server/github/store";
import { PullRequestControls } from "./pull-request-controls";
import { PullOnGitHub } from "./pull-on-github";
import { PullStatusChip } from "./pull-status";

/**
 * A task's pull request on GitHub (ADR 0126): the button that opens one for
 * the applied change, or the one that's open, with the status Farbaek posted.
 */
export function PullRequestCard({ projectId, proposalId, pull, repo, openReason }: { projectId: string; proposalId: string; pull: PullRequestView | null; repo: string | null; openReason: string | null }) {
  return (
    <Card>
      <CardTitle icon={GitPullRequestIcon}>Pull request</CardTitle>
      {pull ? (
        <div className="mt-3 grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <a href={pull.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 min-w-0 items-center gap-1.5 font-medium text-accent hover:underline">
              <span className="break-all">
                {pull.repo} #{pull.number}
              </span>
              <ArrowUpRightIcon size={14} weight="bold" className="shrink-0" aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
            <PullStatusChip state={pull.status} />
          </div>
          <p className="text-sm text-ink-2">
            <span className="break-all font-mono">{pull.branch}</span> into <span className="font-mono">{pull.baseBranch}</span>, commit <span className="font-mono">{pull.commitSha.slice(0, 7)}</span>. Opened <RelativeTime iso={pull.openedAt} />.
          </p>
          <p className="text-xs text-ink-3">The Farbaek ProofPack status is on this commit only. Farbaek updates it when checks run again here.</p>
          <PullOnGitHub pull={pull} />
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <PullRequestControls proposalId={proposalId} mode="read" disabledReason={null} />
            {pull.prState === "open" || pull.prState === null ? <PullRequestControls proposalId={proposalId} mode="update" disabledReason={openReason} /> : null}
          </div>
        </div>
      ) : (
        <div className="mt-3 grid gap-3">
          <p className="text-sm text-ink-2">
            {repo ? (
              <>
                Push this change to <span className="font-mono">{repo}</span> on a new branch and open a pull request, with its ProofPack result as a status check. Nothing on GitHub is overwritten.
              </>
            ) : (
              <>
                Link this project to a repository on its{" "}
                <Link href={`/app/projects/${projectId}/github`} className="font-medium text-accent hover:underline">
                  GitHub page
                </Link>{" "}
                to open a pull request for this change.
              </>
            )}
          </p>
          <PullRequestControls proposalId={proposalId} mode="open" disabledReason={openReason} />
        </div>
      )}
    </Card>
  );
}
