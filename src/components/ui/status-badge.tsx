import { CheckCircleIcon, CircleDashedIcon, FlaskIcon, HourglassMediumIcon, InfoIcon, XCircleIcon } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";

export type Status = "verified" | "approval" | "failed" | "unverified" | "info" | "simulated";

// Colour is never the only signal: each status has an icon, a label and a border pattern.
const STATUS: Record<Status, { label: string; icon: Icon; className: string }> = {
  verified: { label: "Verified", icon: CheckCircleIcon, className: "text-verified border-verified/40" },
  approval: { label: "Awaiting approval", icon: HourglassMediumIcon, className: "text-approval border-approval/40" },
  failed: { label: "Failed", icon: XCircleIcon, className: "text-failed border-failed/40" },
  unverified: { label: "Not verified", icon: CircleDashedIcon, className: "text-unverified border-unverified/60 border-dashed" },
  info: { label: "Info", icon: InfoIcon, className: "text-info border-info/40" },
  simulated: { label: "SIM", icon: FlaskIcon, className: "text-simulated border-simulated/40" },
};

export function StatusBadge({ status, label }: { status: Status; label?: string }) {
  const { icon: StatusIcon, className, label: fallback } = STATUS[status];
  return (
    <span className={`inline-flex h-6 items-center gap-1.5 rounded-xs border px-2 text-xs font-medium ${className}`}>
      <StatusIcon size={14} weight="bold" aria-hidden />
      {label ?? fallback}
    </span>
  );
}
