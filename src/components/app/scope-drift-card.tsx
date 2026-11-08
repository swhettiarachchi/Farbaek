import { CheckCircleIcon, FolderOpenIcon, GitDiffIcon, WarningCircleIcon } from "@phosphor-icons/react/ssr";
import { Card, CardTitle } from "@/components/app/primitives";
import { LocalTime } from "@/components/ui/local-time";
import { DRIFT_LABELS, ORIGIN_LABELS, groupDrift, type DriftFinding } from "@/core/realityloop/scope-drift";

/**
 * Changes to the project's files since the contract was approved that the
 * contract doesn't cover. Drift is reported, not blocked: people can still
 * edit or import files directly, and this keeps those changes visible
 * against the task. Findings are grouped by how they happened and by folder,
 * so a bulk import reads as one line instead of a wall of files.
 */
export function ScopeDriftCard({ approvedAt, changes, findings }: { approvedAt: string; changes: number; findings: DriftFinding[] }) {
  const groups = groupDrift(findings);
  return (
    <Card>
      <CardTitle icon={GitDiffIcon}>Scope since approval</CardTitle>
      <p className="mt-1 text-sm text-ink-2">
        Every file change in this project since the plan was approved <LocalTime iso={approvedAt} />, compared with what the plan allows. Direct edits, imports, restores and
        applied changes all count.
      </p>
      <div className="mt-4">
        {findings.length === 0 ? (
          <p className="flex items-start gap-2 text-sm">
            <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-hidden />
            <span>{changes === 0 ? "No files changed since the plan was approved." : `${changes} file ${changes === 1 ? "change" : "changes"} since approval, all inside the plan.`}</span>
          </p>
        ) : (
          <div className="grid gap-4">
            {/* Outside the plan is a look first, not a turn to act: burnt orange (ADR 0183). */}
            <p className="flex items-start gap-2 text-sm text-ink">
              <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-caution" aria-hidden />
              <span>
                {findings.length} of {changes} {changes === 1 ? "change falls" : "changes fall"} outside the plan. Review them, or change the plan if what it covers really changed.
              </span>
            </p>
            {groups.map((g) => (
              <div key={g.origin} className="grid gap-2">
                <p className="text-sm font-medium">
                  {ORIGIN_LABELS[g.origin]} <span className="font-normal text-ink-3 tabular">· {g.count}</span>
                </p>
                <ul className="divide-y divide-line overflow-hidden rounded-sm border border-line">
                  {g.folders.map((f) => (
                    <li key={f.folder}>
                      <details className="group">
                        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-3 py-2 text-sm hover:bg-surface-raised [&::-webkit-details-marker]:hidden">
                          <FolderOpenIcon size={16} weight="bold" className="shrink-0 text-ink-3" aria-hidden />
                          <span className="min-w-0 flex-1 truncate font-mono text-[0.8125rem]">{f.folder}</span>
                          <span className="shrink-0 text-xs text-ink-3 tabular">
                            {f.findings.length} {f.findings.length === 1 ? "file" : "files"}
                          </span>
                        </summary>
                        <ul className="grid gap-2 border-t border-line bg-surface-raised/40 px-3 py-3">
                          {f.findings.slice(0, 100).map((d, i) => (
                            <li key={`${d.path}-${d.at}-${i}`} className="grid gap-0.5 text-sm">
                              <span className="font-mono text-[0.8125rem] break-all">{d.path}</span>
                              <span className="text-xs text-ink-2">
                                <code className="font-mono">{d.operation}</code>: {d.reasons.map((r) => DRIFT_LABELS[r]).join(", ")} · <LocalTime iso={d.at} />
                              </span>
                            </li>
                          ))}
                          {f.findings.length > 100 ? <li className="text-xs text-ink-3">And {f.findings.length - 100} more.</li> : null}
                        </ul>
                      </details>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
