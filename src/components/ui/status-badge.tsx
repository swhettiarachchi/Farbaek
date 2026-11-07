import { CheckCircleIcon, CircleDashedIcon, InfoIcon, XCircleIcon } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";

export type Status = "verified" | "approval" | "failed" | "unverified" | "info" | "simulated";

// Status is a word in its colour and border pattern (ADR 0180). An icon only for done and failed, the states
// people scan for; a waiting state says who it waits for, and a trial says it's a sample.
const STATUS: Record<Status, { label: string; icon: Icon | null; className: string }> = {
  verified: { label: "Verified", icon: CheckCircleIcon, className: "text-verified border-verified/40" },
  approval: { label: "Awaiting approval", icon: null, className: "text-approval border-approval/40" },
  failed: { label: "Failed", icon: XCircleIcon, className: "text-failed border-failed/40" },
  unverified: { label: "Not verified", icon: CircleDashedIcon, className: "text-unverified border-unverified/60 border-dashed" },
  info: { label: "Info", icon: InfoIcon, className: "text-info border-info/40" },
  simulated: { label: "Sample", icon: null, className: "text-simulated border-simulated/40 border-dashed" },
};

export function StatusBadge({ status, label }: { status: Status; label?: string }) {
  const { icon: StatusIcon, className, label: fallback } = STATUS[status];
  return (
    <span className={`inline-flex h-6 w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium ${className}`}>
      {StatusIcon ? <StatusIcon size={14} weight="bold" aria-hidden /> : null}
      {label ?? fallback}
    </span>
  );
}
