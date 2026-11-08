import { WarningIcon, WarningOctagonIcon } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import { STATUS_KINDS, StatusBadge, type Status } from "@/components/ui/status-badge";
import { SEVERITY_WORDS, STATUS_WORDS, type IncidentStatus, type Severity } from "@/core/trust/incidents";

const pill = "inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium";

// Severity is its word, icon, colour and border together (ADR 0183): critical and high in the failed colour with a
// warning mark, medium needs a look, low is information.
const SEVERITY: Record<Severity, { icon: Icon; className: string }> = {
  low: { icon: STATUS_KINDS.info.icon, className: STATUS_KINDS.info.className },
  medium: { icon: STATUS_KINDS.attention.icon, className: STATUS_KINDS.attention.className },
  high: { icon: WarningIcon, className: "text-failed border-failed/35" },
  critical: { icon: WarningOctagonIcon, className: "text-failed border-failed bg-failed/[0.06]" },
};

// Open needs a look, contained is paused for now, resolved is verified.
const STATUS: Record<IncidentStatus, Status> = {
  open: "attention",
  contained: "paused",
  resolved: "verified",
};

/** Severity with its word and icon, never colour alone. */
export function SeverityBadge({ severity }: { severity: Severity }) {
  const { icon: SeverityIcon, className } = SEVERITY[severity];
  return (
    <span className={`${pill} ${className}`}>
      <SeverityIcon size={14} weight="fill" className="shrink-0" aria-hidden />
      {SEVERITY_WORDS[severity]}
      <span className="sr-only"> severity</span>
    </span>
  );
}

export function IncidentStatusBadge({ status }: { status: IncidentStatus }) {
  return <StatusBadge status={STATUS[status]} label={STATUS_WORDS[status]} />;
}
