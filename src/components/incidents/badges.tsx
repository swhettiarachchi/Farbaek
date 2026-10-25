import { CheckCircleIcon, InfoIcon, ShieldCheckIcon, SirenIcon, WarningCircleIcon, WarningIcon, WarningOctagonIcon } from "@phosphor-icons/react/ssr";
import { SEVERITY_WORDS, STATUS_WORDS, type IncidentStatus, type Severity } from "@/core/trust/incidents";

const pill = "inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium";

const SEVERITY: Record<Severity, { icon: typeof InfoIcon; className: string }> = {
  low: { icon: InfoIcon, className: "border-line text-ink-2" },
  medium: { icon: WarningIcon, className: "border-approval/40 text-approval" },
  high: { icon: WarningOctagonIcon, className: "border-failed/40 text-failed" },
  critical: { icon: SirenIcon, className: "border-failed bg-failed/[0.06] text-failed" },
};

const STATUS: Record<IncidentStatus, { icon: typeof InfoIcon; className: string }> = {
  open: { icon: WarningCircleIcon, className: "border-approval/40 text-approval" },
  contained: { icon: ShieldCheckIcon, className: "border-accent/40 text-accent" },
  resolved: { icon: CheckCircleIcon, className: "border-verified/40 text-verified" },
};

/** Severity with an icon and its word, never colour alone. */
export function SeverityBadge({ severity }: { severity: Severity }) {
  const { icon: SeverityIcon, className } = SEVERITY[severity];
  return (
    <span className={`${pill} ${className}`}>
      <SeverityIcon size={14} weight="bold" aria-hidden />
      {SEVERITY_WORDS[severity]}
      <span className="sr-only"> severity</span>
    </span>
  );
}

export function IncidentStatusBadge({ status }: { status: IncidentStatus }) {
  const { icon: StatusIcon, className } = STATUS[status];
  return (
    <span className={`${pill} ${className}`}>
      <StatusIcon size={14} weight="bold" aria-hidden />
      {STATUS_WORDS[status]}
    </span>
  );
}
