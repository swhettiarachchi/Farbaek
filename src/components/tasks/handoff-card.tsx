import { CheckCircleIcon, WarningCircleIcon, XCircleIcon } from "@phosphor-icons/react/ssr";
import { LiveRefresh } from "@/components/app/live-refresh";
import { RelativeTime } from "@/components/ui/local-time";
import { ButtonLink } from "@/components/ui/button";
import { HANDOFF_STATUS_WORDS, handoffVerdict, type HandoffStatus } from "@/core/agent/handoff";
import type { HandoffView } from "@/server/agent/handoffs";
import { cancelHandoffAction } from "@/app/app/tasks/handoff-actions";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { HandOff } from "./hand-off";

// A state is its words in a colour and border (ADR 0180); a mark only for how it ended.
const STATUS: Record<HandoffStatus, { Icon: typeof CheckCircleIcon | null; className: string }> = {
  waiting: { Icon: null, className: "border-approval/40 text-approval" },
  opened: { Icon: null, className: "border-info/40 text-info" },
  done: { Icon: CheckCircleIcon, className: "border-line text-ink-2" },
  failed: { Icon: WarningCircleIcon, className: "border-dashed border-failed/40 text-failed" },
  cancelled: { Icon: null, className: "border-dashed border-line-strong text-ink-3" },
  expired: { Icon: null, className: "border-dashed border-line-strong text-ink-3" },
};

const seconds = (ms: number | null) => (ms === null ? null : ms < 1000 ? "under 1 s" : `${Math.round(ms / 1000)} s`);

/**
 * Continue on my computer (ADR 0139): hand the task, with its contract and
 * the change waiting, to one of the workspace's computers, which runs the
 * checks on a copy and reports back. A report is evidence from that
 * computer, labelled as such; it never verifies the change.
 */
export function HandoffCard({ taskId, computers, handoffs, disabledReason }: { taskId: string; computers: { id: string; name: string }[]; handoffs: readonly HandoffView[]; disabledReason: string | null }) {
  const open = handoffs.some((h) => h.status === "waiting" || h.status === "opened");
  return (
    <section aria-labelledby="handoff-heading" className="grid gap-4 rounded-md border border-line bg-canvas-2/60 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="handoff-heading" className="text-base font-medium">
          Continue on your computer
        </h3>
        <span className="text-xs text-ink-3">Runs only when you start it there</span>
      </div>
      <p className="max-w-[68ch] text-sm leading-relaxed text-ink-2">
        Send this task to the Farbaek Agent app on one of your computers. It shows the plan, the change waiting for review and the checks to run; when you start it there,
        it runs the checks on a copy of the project with the change written in, and the results come back here.
      </p>
      {computers.length === 0 ? (
        <div className="grid justify-items-start gap-2">
          <p className="text-sm text-ink-2">No computer is paired with this workspace yet. Install the Farbaek Agent app and pair it from the Desktop app page.</p>
          <ButtonLink href="/app/agents" variant="secondary" size="sm">
            Open Desktop app
          </ButtonLink>
        </div>
      ) : null}
      <HandOff taskId={taskId} computers={computers} disabledReason={disabledReason} />
      <LiveRefresh active={open} everyMs={10_000} />

      {handoffs.length > 0 ? (
        <ul className="grid divide-y divide-line rounded-sm border border-line bg-surface">
          {handoffs.map((h) => {
            const s = STATUS[h.status];
            const v = h.result ? handoffVerdict(h.result) : null;
            return (
              <li key={h.id} className="grid gap-2.5 px-3 py-3.5 sm:px-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[0.9375rem] font-medium">{h.agentName}</p>
                  <span className={`inline-flex h-6 items-center gap-1 rounded-full border px-2.5 text-xs font-medium ${s.className}`}>
                    {s.Icon ? <s.Icon size={13} weight="bold" aria-hidden /> : null} {HANDOFF_STATUS_WORDS[h.status]}
                  </span>
                </div>
                <p className="text-xs text-ink-3">
                  Sent <RelativeTime iso={h.createdAt} />
                  {h.note ? <> with the note &ldquo;{h.note}&rdquo;</> : null}
                </p>
                {h.reason && h.status !== "done" ? <p className="text-sm text-ink-2">{h.reason}</p> : null}
                {h.result && v ? (
                  <div className="grid gap-2">
                    <p className={`flex items-center gap-2 text-sm font-medium ${v.verdict === "all_passed" ? "text-verified" : v.verdict === "some_failed" ? "text-failed" : "text-unverified"}`}>
                      {v.verdict === "all_passed" ? <CheckCircleIcon size={18} weight="bold" aria-hidden /> : v.verdict === "some_failed" ? <XCircleIcon size={18} weight="bold" aria-hidden /> : null}
                      {v.verdict === "none_ran" ? "No check ran on that computer." : `${v.passed} of ${h.result.length} ${h.result.length === 1 ? "check" : "checks"} passed on ${h.agentName}.`}
                    </p>
                    <ul className="grid gap-1.5">
                      {h.result.map((c, i) => (
                        <li key={`${c.command}-${i}`} className="grid gap-1">
                          <p className="flex flex-wrap items-baseline gap-x-3 text-sm">
                            <span className="font-mono text-[0.78125rem] text-ink">{c.command}</span>
                            <span className={c.exitCode === 0 ? "text-verified" : c.exitCode === null ? "text-unverified" : "text-failed"}>
                              {c.skipped ? `Didn't run: ${c.skipped}` : c.timedOut ? "Ran out of time" : c.exitCode === 0 ? "Passed" : `Failed, exit ${c.exitCode}`}
                            </span>
                            {seconds(c.durationMs) ? <span className="text-xs text-ink-3">{seconds(c.durationMs)}</span> : null}
                          </p>
                          {c.output ? (
                            <details className="rounded-sm border border-line">
                              <summary className="flex min-h-11 cursor-pointer items-center px-3 text-xs font-medium text-ink-2 hover:text-ink">The end of its output</summary>
                              <pre className="max-h-56 overflow-auto border-t border-line bg-canvas-2 p-3 font-mono text-[0.78125rem] leading-relaxed text-ink-2">{c.output}</pre>
                            </details>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-ink-3" title={h.digest ? `Report sha256:${h.digest}` : undefined}>
                      Reported by your computer: Farbaek didn&apos;t watch these run, so they don&apos;t verify the change.
                    </p>
                  </div>
                ) : null}
                {h.status === "waiting" || h.status === "opened" ? (
                  <ConfirmAction
                    action={cancelHandoffAction}
                    fields={{ taskId, handoffId: h.id }}
                    trigger="Withdraw"
                    triggerVariant="ghost"
                    question="Withdraw this handoff? The computer won't run these checks."
                    confirmLabel="Withdraw it"
                    pendingLabel="Withdrawing…"
                    keepLabel="Leave it"
                    danger={false}
                    disabledReason={disabledReason}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
