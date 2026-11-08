import { CheckCircleIcon, WarningIcon, WarningOctagonIcon } from "@phosphor-icons/react/ssr";
import { SEVERITY_WORDS, STATUS_WORDS, type IncidentStatus, type Severity } from "@/core/trust/incidents";

const pill = "inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium";

// Severity is its word in its colour and border; a warning mark only where it means act now.
const SEVERITY: Record<Severity, { icon: typeof WarningIcon | null; className: string }> = {
  low: { icon: null, className: "border-line text-ink-2" },
  medium: { icon: null, className: "border-approval/40 text-approval" },
  high: { icon: WarningIcon, className: "border-failed/40 text-failed" },
  critical: { icon: WarningOctagonIcon, className: "border-failed bg-failed/[0.06] text-failed" },
};

// Status is its word (ADR 0180); a mark only once it's resolved.
const STATUS: Record<IncidentStatus, { icon: typeof CheckCircleIcon | null; className: string }> = {
  open: { icon: null, className: "border-approval/40 text-approval" },
  contained: { icon: null, className: "border-accent/40 text-accent" },
  resolved: { icon: CheckCircleIcon, className: "border-verified/40 text-verified" },
};

/** Severity with its word, never colour alone: the border pattern and the word carry it. */
export function SeverityBadge({ severity }: { severity: Severity }) {
  const { icon: SeverityIcon, className } = SEVERITY[severity];
  return (
    <span className={`${pill} ${className}`}>
      {SeverityIcon ? <SeverityIcon size={14} weight="bold" aria-hidden /> : null}
      {SEVERITY_WORDS[severity]}
      <span className="sr-only"> severity</span>
    </span>
  );
}

export function IncidentStatusBadge({ status }: { status: IncidentStatus }) {
  const { icon: StatusIcon, className } = STATUS[status];
  return (
    <span className={`${pill} ${className}`}>
      {StatusIcon ? <StatusIcon size={14} weight="bold" aria-hidden /> : null}
      {STATUS_WORDS[status]}
    </span>
  );
}
