"use client";

import { CheckCircleIcon, GitPullRequestIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState } from "react";
import { openPullRequestAction, readPullFromGitHubAction, updatePullStatusAction, type PullRequestState } from "@/app/app/tasks/[taskId]/github-actions";
import { buttonClasses } from "@/components/ui/button";

const IDLE: PullRequestState = { status: "idle" };

const ACTIONS = { open: openPullRequestAction, update: updatePullStatusAction, read: readPullFromGitHubAction } as const;
const LABELS = { open: ["Open a pull request", "Opening…"], update: ["Update the status check", "Posting…"], read: ["Check GitHub now", "Reading…"] } as const;

/** Opening a pull request for an applied change, posting its status again (ADR 0126), or reading it from GitHub (ADR 0143). */
export function PullRequestControls({ proposalId, mode, disabledReason }: { proposalId: string; mode: "open" | "update" | "read"; disabledReason: string | null }) {
  const [state, run, running] = useActionState(ACTIONS[mode].bind(null, proposalId), IDLE);
  const busy = running || Boolean(disabledReason);
  return (
    <div className="grid gap-2">
      <form action={run} className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} className={buttonClasses(mode === "open" ? "primary" : "secondary", "sm")}>
          {mode === "open" ? <GitPullRequestIcon size={16} weight="bold" aria-hidden /> : null}
          {running ? LABELS[mode][1] : LABELS[mode][0]}
        </button>
        {disabledReason ? <span className="text-sm text-ink-3">{disabledReason}</span> : null}
      </form>
      <div aria-live="polite" className="empty:hidden">
        {state.status === "error" ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-failed">
            <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
            {state.message}
          </p>
        ) : state.status === "done" ? (
          <p role="status" className="flex items-start gap-2 text-sm text-ink-2">
            <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-hidden />
            {state.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
