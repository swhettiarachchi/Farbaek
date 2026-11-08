import { WarningCircleIcon } from "@phosphor-icons/react/ssr";
import { formatDuration, OUTCOME_WORDS, PROOF_WORDS, type GraphAnalytics, type ProofStatus } from "@/core/insights/project-graph";
import type { ReactNode } from "react";

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** "3 h" as it's said in a sentence: "3 hours". */
function spoken(ms: number): string {
  const [n = "", unit] = formatDuration(ms).split(" ");
  const word = unit === "min" ? "minute" : unit === "h" ? "hour" : "day";
  return `${n} ${n === "1" ? word : `${word}s`}`;
}

/** A number in a sentence: tabular, in ink, so it reads at a glance without a tile around it. */
function Num({ children }: { children: ReactNode }) {
  return <span className="tabular font-medium text-ink">{children}</span>;
}

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
      {/* The totals as a person would say them (ADR 0180): numbers in sentences, each with what it counts. */}
      <p className="max-w-3xl text-[0.9375rem] leading-relaxed text-ink-2">
        {a.askToVerified.count && a.askToVerified.ms !== null ? (
          <>
            A task here usually takes <Num>{spoken(a.askToVerified.ms)}</Num> from the ask to passed checks, the median over <Num>{a.askToVerified.count}</Num>{" "}
            {plural(a.askToVerified.count, "task", "tasks")}.{" "}
          </>
        ) : (
          "No task here has passed its checks yet. "
        )}
        {a.approvalWait.count && a.approvalWait.ms !== null ? (
          <>
            A change waits <Num>{spoken(a.approvalWait.ms)}</Num> for a person&apos;s approval, the median over <Num>{a.approvalWait.count}</Num>{" "}
            {plural(a.approvalWait.count, "change", "changes")}.{" "}
          </>
        ) : (
          "No change here has been approved by a person yet. "
        )}
        {proofTotal ? (
          <>
            <Num>{a.proof.verified}</Num> of <Num>{proofTotal}</Num> applied {plural(proofTotal, "change", "changes")} passed their checks.{" "}
          </>
        ) : (
          "Nothing here has been applied and checked yet. "
        )}
        {a.releases.total ? (
          <>
            <Num>{a.releases.verified}</Num> of <Num>{a.releases.total}</Num> published {plural(a.releases.total, "version", "versions")} went out with passed checks
            {a.releases.override ? (
              <>
                , and <Num>{a.releases.override}</Num> with an owner&apos;s or admin&apos;s reason instead
              </>
            ) : null}
            .
          </>
        ) : (
          "No version of this project has been published."
        )}
      </p>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="How the rules decided">
          {outcomesTotal ? (
            <BarRows rows={a.outcomes.map((o) => ({ label: OUTCOME_WORDS[o.outcome] ?? o.outcome, count: o.count }))} of={outcomesTotal} noun="changes" />
          ) : (
            <p className="text-sm text-ink-3">No changes with a recorded decision yet.</p>
          )}
          {a.rework.of ? (
            <p className="text-xs leading-relaxed text-ink-3">
              {a.rework.tasks === 0 ? "Every task's first change was the one that counted." : `${a.rework.tasks} of ${a.rework.of} tasks needed more than one change.`}
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
              <WarningCircleIcon size={14} weight="bold" className="text-failed" aria-hidden /> {a.incidents} {a.incidents === 1 ? "problem is" : "problems are"} linked to these changes.
            </p>
          ) : null}
        </Panel>

        <Panel title="Most-changed files">
          {a.hotFiles.length ? (
            <ul className="grid gap-2.5">
              {a.hotFiles.map((f) => (
                <li key={f.path} className="grid min-w-0 gap-0.5">
                  <span className="truncate font-mono text-[0.8125rem] text-ink" title={f.path}>
                    {f.path}
                  </span>
                  <span className="text-xs text-ink-3">
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
