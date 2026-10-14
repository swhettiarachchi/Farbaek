import { CheckCircleIcon, WarningIcon } from "@phosphor-icons/react/ssr";
import { Card } from "@/components/app/primitives";
import { LocalTime } from "@/components/ui/local-time";
import { DRIFT_LABELS, type DriftFinding } from "@/core/realityloop/scope-drift";

/**
 * Changes to the project's files since the contract was approved that the
 * contract doesn't cover. Drift is reported, not blocked: people can still
 * edit files directly, and this keeps those edits visible against the task.
 */
export function ScopeDriftCard({ approvedAt, changes, findings }: { approvedAt: string; changes: number; findings: DriftFinding[] }) {
  return (
    <Card>
      <h2 className="text-lg font-medium">Scope since approval</h2>
      <p className="mt-1 text-sm text-ink-2">
        Every file change in this project since the contract was approved <LocalTime iso={approvedAt} />, compared with what the contract allows. Direct edits, imports, restores and
        applied proposals all count.
      </p>
      <div className="mt-4">
        {findings.length === 0 ? (
          <p className="flex items-start gap-2 text-sm">
            <CheckCircleIcon size={18} weight="fill" className="mt-px shrink-0 text-verified" aria-hidden />
            {changes === 0 ? "No files changed since the contract was approved." : `${changes} file ${changes === 1 ? "change" : "changes"} since approval, all inside the contract.`}
          </p>
        ) : (
          <div className="grid gap-3">
            <p className="flex items-start gap-2 text-sm text-approval">
              <WarningIcon size={18} weight="bold" className="mt-px shrink-0" aria-hidden />
              {findings.length} of {changes} {changes === 1 ? "change falls" : "changes fall"} outside the contract. Review each one, or revise the contract if the scope really changed.
            </p>
            <ul className="divide-y divide-line overflow-hidden rounded-sm border border-line">
              {findings.slice(0, 50).map((f, i) => (
                <li key={`${f.path}-${f.at}-${i}`} className="grid gap-0.5 px-3 py-2.5 text-sm">
                  <span className="font-mono text-[13px] break-all">{f.path}</span>
                  <span className="text-xs text-ink-2">
                    <code className="font-mono">{f.operation}</code>: {f.reasons.map((r) => DRIFT_LABELS[r]).join(", ")}
                  </span>
                  <span className="text-xs text-ink-3">
                    {f.viaProposal ? "From a reviewed proposal" : "Direct change"} · <LocalTime iso={f.at} />
                  </span>
                </li>
              ))}
            </ul>
            {findings.length > 50 ? <p className="text-xs text-ink-3">Showing the first 50.</p> : null}
          </div>
        )}
      </div>
    </Card>
  );
}
