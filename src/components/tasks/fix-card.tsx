import { WarningCircleIcon, WrenchIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { startFixAction } from "@/app/app/tasks/[taskId]/fix-actions";
import { Card, CardTitle, TaskStateBadge } from "@/components/app/primitives";
import { PendingSubmit } from "@/components/ui/pending-submit";
import type { TaskFix } from "@/server/workspace/types";

/** What a free retry means on this plan, in one sentence (ADR 0101). */
export function freeRetryWords(included: boolean): string {
  return included
    ? "If the fix's checks fail too, its AI usage is given back, up to about 5% of your plan's AI usage a month."
    : "On paid plans and during the trial, a fix whose checks fail too gets its AI usage back. On Free it counts like any other work.";
}

/**
 * The next step after failed checks (ADR 0101): a fix with the same intent.
 * Shows the open fix instead when there is one, and the reason when the
 * person can't start one.
 */
export function FixCard({ taskId, fix, open, retryIncluded, disabledReason, error }: { taskId: string; fix: TaskFix | null; open: boolean; retryIncluded: boolean; disabledReason: string | null; error: string | null }) {
  return (
    <Card id="fix" className="scroll-mt-24">
      <CardTitle icon={WrenchIcon}>Ask the agent to fix it</CardTitle>
      <p className="mt-1 text-sm leading-relaxed text-ink-2">
        Farbaek opens a new task with this task&apos;s approved plan and a note naming the checks that failed. You review its plan, then start the agent. {freeRetryWords(retryIncluded)}
      </p>
      {error ? (
        <p role="alert" className="mt-4 flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden />
          <span>{error}</span>
        </p>
      ) : null}
      {fix && fix.state === "VERIFIED" ? (
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-sm border border-line bg-canvas-2 px-4 py-3 text-sm">
          <span className="text-ink-2">Fixed in</span>
          <Link href={`/app/tasks/${fix.id}`} className="inline-flex min-h-11 items-center font-medium text-accent underline-offset-4 hover:underline">
            {fix.title}
          </Link>
          <TaskStateBadge state={fix.state} />
        </div>
      ) : fix && open ? (
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-sm border border-line bg-canvas-2 px-4 py-3 text-sm">
          <span className="text-ink-2">A fix is open:</span>
          <Link href={`/app/tasks/${fix.id}`} className="inline-flex min-h-11 items-center font-medium text-accent underline-offset-4 hover:underline">
            {fix.title}
          </Link>
          <TaskStateBadge state={fix.state} />
        </div>
      ) : (
        <form action={startFixAction} className="mt-5 flex flex-wrap items-center gap-3">
          <input type="hidden" name="taskId" value={taskId} />
          <PendingSubmit label={fix ? "Start another fix" : "Start a fix"} pending="Opening the fix…" disabledReason={disabledReason} />
          {disabledReason ? <p className="text-xs text-ink-3">{disabledReason}</p> : null}
          {fix ? (
            <p className="flex w-full flex-wrap items-center gap-2 text-xs text-ink-3">
              The last fix,
              <Link href={`/app/tasks/${fix.id}`} className="inline-flex min-h-11 items-center text-accent underline-offset-4 hover:underline">
                {fix.title}
              </Link>
              ended as <TaskStateBadge state={fix.state} />
            </p>
          ) : null}
        </form>
      )}
    </Card>
  );
}
