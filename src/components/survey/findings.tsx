import type { Finding, Severity } from "@/core/survey/qc";
import { StatusBadge, type Status } from "@/components/ui/status-badge";

/** Survey states as StatusBadge kinds (farbaek-survey-studio skill, "Status in the app"). */
export const SEVERITY_BADGE: Record<Severity, { status: Status; label: string }> = {
  error: { status: "blocked", label: "Blocked" },
  warning: { status: "attention", label: "Needs a look" },
  information: { status: "info", label: "Info" },
  professional_review: { status: "approval", label: "For the surveyor" },
};

const BLOCKS: Record<Finding["blocks"][number], string> = { plan: "the plan", export: "export", approval: "approval" };

export function FindingsList({ findings }: { findings: readonly Finding[] }) {
  if (findings.length === 0) return <p className="text-sm text-ink-2">No findings. Checks passing is not certification: the surveyor still reviews and signs the plan.</p>;
  return (
    <ul className="grid gap-3">
      {findings.map((f, i) => (
        <li key={`${f.code}-${i}`} className="grid gap-2 rounded-md bg-surface p-4 ring-1 ring-line">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={SEVERITY_BADGE[f.severity].status} label={SEVERITY_BADGE[f.severity].label} />
            <span className="font-mono text-xs text-ink-3">{f.code}</span>
          </div>
          <p className="font-medium text-ink">{f.message}</p>
          {f.detail ? <p className="text-sm text-ink-2">{f.detail}</p> : null}
          <p className="text-sm text-ink-2">{f.action}</p>
          {f.blocks.length > 0 ? <p className="text-sm text-ink-3">Stops {f.blocks.map((b) => BLOCKS[b]).join(" and ")} until it is resolved.</p> : null}
        </li>
      ))}
    </ul>
  );
}
