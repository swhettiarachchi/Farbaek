import { ArrowCounterClockwiseIcon, CheckCircleIcon, CircleDashedIcon, CoinsIcon, InfoIcon, WarningIcon, XCircleIcon } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import { modelName } from "@/core/billing/rate-card";
import { shareLabel, type TaskCost } from "@/core/insights/cost-brain";
import { AREA_LABELS, REVERSIBILITY_LABELS, type FileReversibility, type Reversibility } from "@/core/insights/reversibility";

// Colour is never the only signal: each class has an icon, a label and a border pattern.
const LOOK: Record<Reversibility, { icon: Icon; className: string }> = {
  rollback_supported: { icon: CheckCircleIcon, className: "text-verified border-verified/40" },
  compensating_action: { icon: InfoIcon, className: "text-info border-info/40" },
  unknown: { icon: CircleDashedIcon, className: "text-unverified border-unverified/60 border-dashed" },
  forward_fix: { icon: WarningIcon, className: "text-approval border-approval/40" },
  requires_backup: { icon: XCircleIcon, className: "text-failed border-failed/40" },
};

function ClassChip({ value }: { value: Reversibility }) {
  const look = LOOK[value];
  return (
    <span className={`inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium ${look.className}`}>
      <look.icon size={14} weight="bold" aria-hidden /> {REVERSIBILITY_LABELS[value]}
    </span>
  );
}

const OVERALL: Record<Reversibility, string> = {
  rollback_supported: "Every file in this change can be undone in Farbaek.",
  compensating_action: "Every file can be undone, and some need a step outside Farbaek afterwards.",
  unknown: "Some of this change reaches beyond the project, so how far it can be undone isn't known.",
  forward_fix: "Part of this change can only be undone with a new change once it has run.",
  requires_backup: "Part of this change removes or rewrites data: take a backup before it runs.",
};

/** Reversibility Radar on a change (ADR 0122): each file's class, with the basis and the limits. */
export function ReversibilityCard({ overall, files }: { overall: Reversibility; files: FileReversibility[] }) {
  return (
    <section aria-labelledby="radar-title" className="grid gap-4 rounded-md border border-line bg-surface-raised/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="radar-title" className="flex items-center gap-2 text-base font-medium">
          <ArrowCounterClockwiseIcon size={18} className="text-ink-3" aria-hidden /> How far this can be undone
        </h3>
        <ClassChip value={overall} />
      </div>
      <p className="text-sm leading-relaxed text-ink-2">{OVERALL[overall]} Decided from each file&apos;s path and the lines it adds; nothing was run.</p>
      <ul className="grid gap-2">
        {files.map((f) => (
          <li key={f.path} className="grid gap-1.5 rounded-sm border border-line bg-surface px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="min-w-0 break-all font-mono text-xs">{f.path}</span>
              <ClassChip value={f.reversibility} />
            </div>
            <p className="text-xs text-ink-3">{AREA_LABELS[f.area]}</p>
            <p className="text-sm leading-relaxed text-ink-2">
              {f.basis} {f.limits}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Developer Cost Brain for a task (ADR 0122): what it has actually used, as shares, with estimates and refunds labelled. */
export function CostCard({ cost, period }: { cost: TaskCost; period: "trial" | "month" | null }) {
  // A task can run across months, so its share is of one period's allowance, not of this month's.
  const of = period === "trial" ? "of the trial's AI usage" : "of a month's AI usage on this plan";
  const nothing = cost.operations.length === 0 && cost.sandbox.sessions === 0;
  const refunds = cost.refunds.failed + cost.refunds.freeRetry + cost.refunds.stopped;
  return (
    <section aria-labelledby="cost-title" className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="cost-title" className="flex items-center gap-2 text-lg font-medium">
          <CoinsIcon size={20} className="text-ink-3" aria-hidden /> What this task has used
        </h2>
        {cost.operations.length > 0 ? (
          <span className="text-sm text-ink-2">
            <span className="font-medium text-ink">{shareLabel(cost.percent)}</span> {cost.percent === null ? "" : of}
            {cost.estimated ? <span className="ml-1.5 rounded-full border border-dashed border-line-strong/60 px-2 py-0.5 text-xs">includes an estimate</span> : null}
          </span>
        ) : null}
      </div>
      {nothing ? (
        <p className="text-sm text-ink-3">No AI usage or test space time recorded for this task yet.</p>
      ) : (
        <>
          {cost.operations.length > 0 ? (
            <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface">
              {cost.operations.map((o) => (
                <li key={o.operation} className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline sm:gap-4">
                  <div className="min-w-0">
                    <p className="text-[0.9375rem] font-medium">{o.label}</p>
                    <p className="text-xs leading-relaxed text-ink-3">
                      {o.calls === 1 ? "1 call" : `${o.calls} calls`}
                      {o.ownKeyCalls ? ` (${o.ownKeyCalls === o.calls ? "all" : o.ownKeyCalls} on your own key, not counted)` : ""}
                      {o.models.length ? ` on ${o.models.map(modelName).join(" and ")}` : ""}
                    </p>
                  </div>
                  <p className="text-sm tabular text-ink-2 sm:text-right">
                    {shareLabel(o.percent)}
                    {o.estimated ? <span className="text-ink-3"> (estimate)</span> : null}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
          <ul className="grid gap-1 text-sm leading-relaxed text-ink-2">
            {refunds > 0 ? (
              <li>
                Given back, so not counted: {[cost.refunds.failed ? `${cost.refunds.failed} failed` : null, cost.refunds.freeRetry ? `${cost.refunds.freeRetry} free retry` : null, cost.refunds.stopped ? `${cost.refunds.stopped} stopped` : null].filter(Boolean).join(", ")}.
              </li>
            ) : null}
            {cost.sandbox.sessions > 0 ? (
              <li>
                Test space: {cost.sandbox.sessions === 1 ? "1 session" : `${cost.sandbox.sessions} sessions`}, {cost.sandbox.minutes === 1 ? "1 minute" : `${cost.sandbox.minutes} minutes`} counted while running
                {cost.sandbox.running ? `, ${cost.sandbox.running} still open` : ""}.
              </li>
            ) : null}
          </ul>
          <p className="text-xs leading-relaxed text-ink-3">Shares are {of}, at each model&apos;s real price. A call still in progress counts at its reserved estimate until it settles.</p>
        </>
      )}
    </section>
  );
}
