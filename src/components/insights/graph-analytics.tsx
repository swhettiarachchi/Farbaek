import { FileCodeIcon, WarningCircleIcon } from "@phosphor-icons/react/ssr";
import { formatDuration, OUTCOME_WORDS, PROOF_WORDS, type GraphAnalytics, type Median, type ProofStatus } from "@/core/insights/project-graph";
import type { ReactNode } from "react";
import { StatTile } from "@/components/app/primitives";

const time = (m: Median) => (m.ms === null ? "None yet" : formatDuration(m.ms));

/**
 * Counts as labelled bars: one hue for magnitude, the label carries the
 * category and the number is printed, so nothing depends on colour.
 */
function BarRows({ rows, of, noun }: { rows: { label: string; count: number }[]; of: number; noun: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="grid gap-3">
      {rows.map((r) => (
        <li key={r.label} className="grid gap-1.5" title={`${r.count} of ${of} ${noun}`}>
          <span className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-ink-2">{r.label}</span>
            <span className="tabular font-medium text-ink">{r.count}</span>
          </span>
          <span aria-hidden className="block h-2 overflow-hidden rounded-full bg-surface-sunken">
            <span
              className="block h-full origin-left rounded-full bg-accent motion-safe:animate-[steps-fill_700ms_cubic-bezier(0.16,1,0.3,1)_both]"
              style={{ width: `${Math.max(2, (r.count / max) * 100)}%` }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid content-start gap-4 rounded-md border border-line bg-surface p-5 shadow-e1 sm:p-6">
      <h3 className="text-base font-medium">{title}</h3>
      {children}
    </section>
  );
}

/** What the project's records add up to (ADR 0089). Every number comes from the lanes below it. */
export function GraphAnalyticsView({ a }: { a: GraphAnalytics }) {
  const proofTotal = Object.values(a.proof).reduce((n, v) => n + v, 0);
  const outcomesTotal = a.outcomes.reduce((n, o) => n + o.count, 0);
  const proofOrder: ProofStatus[] = ["verified", "partially_verified", "failed", "unverified"];
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatTile
          label="From ask to verified"
          value={time(a.askToVerified)}
          detail={a.askToVerified.count ? `Median over ${a.askToVerified.count} ${a.askToVerified.count === 1 ? "task" : "tasks"} with verified evidence.` : "No task here has verified evidence yet."}
        />
        <StatTile
          label="Waiting for approval"
          value={time(a.approvalWait)}
          detail={a.approvalWait.count ? `Median over ${a.approvalWait.count} ${a.approvalWait.count === 1 ? "change" : "changes"} a person approved.` : "No change here has been approved by a person yet."}
        />
        <StatTile
          label="Passed their checks"
          value={proofTotal ? `${a.proof.verified} of ${proofTotal}` : "None yet"}
          detail={proofTotal ? "Applied changes whose newest ProofPack is verified." : "Nothing here has been applied and checked yet."}
        />
        <StatTile
          label="Published with evidence"
          value={a.releases.total ? `${a.releases.verified} of ${a.releases.total}` : "None yet"}
          detail={
            a.releases.total
              ? a.releases.override
                ? `${a.releases.override} went out with an owner's or admin's reason instead.`
                : "Every version went out with verified evidence."
              : "No version of this project has been published."
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="How the policy decided">
          {outcomesTotal ? (
            <BarRows rows={a.outcomes.map((o) => ({ label: OUTCOME_WORDS[o.outcome] ?? o.outcome, count: o.count }))} of={outcomesTotal} noun="proposals" />
          ) : (
            <p className="text-sm text-ink-3">No proposals with a recorded decision yet.</p>
          )}
          {a.rework.of ? (
            <p className="text-xs leading-relaxed text-ink-3">
              {a.rework.tasks === 0 ? "Every task's first proposal was the one that counted." : `${a.rework.tasks} of ${a.rework.of} tasks needed more than one proposal.`}
            </p>
          ) : null}
        </Panel>

        <Panel title="How checks ended">
          {proofTotal ? (
            <BarRows rows={proofOrder.filter((s) => a.proof[s] > 0).map((s) => ({ label: PROOF_WORDS[s], count: a.proof[s] }))} of={proofTotal} noun="applied changes" />
          ) : (
            <p className="text-sm text-ink-3">Nothing applied here has a ProofPack yet.</p>
          )}
          {a.incidents ? (
            <p className="flex items-center gap-1.5 text-xs text-ink-2">
              <WarningCircleIcon size={14} weight="bold" className="text-failed" aria-hidden /> {a.incidents} {a.incidents === 1 ? "incident is" : "incidents are"} linked to these changes.
            </p>
          ) : null}
        </Panel>

        <Panel title="Most-changed files">
          {a.hotFiles.length ? (
            <ul className="grid gap-2.5">
              {a.hotFiles.map((f) => (
                <li key={f.path} className="grid gap-0.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <FileCodeIcon size={16} className="shrink-0 text-ink-3" aria-hidden />
                    <span className="truncate font-mono text-[13px] text-ink" title={f.path}>
                      {f.path}
                    </span>
                  </span>
                  <span className="pl-6 text-xs text-ink-3">
                    {f.changes} {f.changes === 1 ? "change" : "changes"}
                    {f.failed ? (
                      <span className="text-failed">
                        , {f.failed} ended in failed checks
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-3">No applied changes here yet.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
